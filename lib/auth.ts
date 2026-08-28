import { betterAuth } from "better-auth"
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin } from "better-auth/plugins/admin"
// No dedicated subpath for these three — they are only on the barrel, so the
// tree-shaking convention the other plugins follow does not apply here.
import { jwt, lastLoginMethod } from "better-auth/plugins"
import { nextCookies } from "better-auth/next-js"
import { stripe } from "@better-auth/stripe"
import { mcp } from "@better-auth/mcp"
import { cimd } from "@better-auth/cimd"
import { fetchClientMetadataResource } from "@better-auth/cimd/node"

import { db } from "./db"
import * as schema from "./schema"
// From lib/mcp-gate.ts, not lib/mcp.ts. Same values, no import graph: lib/mcp.ts
// reaches the drafting model and the metering tables, and this file must not.
import {
  isAdminOAuthPath,
  MCP_CONSENT_PAGE,
  MCP_RESOURCE,
  MCP_SCOPES_SUPPORTED,
} from "./mcp-gate"
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendWelcomeEmail,
} from "./auth-email"
import type { MailResult } from "./mail"
import { hasLiveSubscription } from "./subscription-status"
import { startTrial } from "./trial"
import { PLAN_LOOKUP_KEY, PLAN_NAME, stripeClient } from "./stripe"
import { EMAIL_VERIFICATION_EXPIRES_IN_SECONDS } from "./auth-constants"
import { isUnreachableTestAddress, spendInviteFor } from "./waitlist"

/**
 * The senders return a status instead of throwing so a mail outage cannot fail
 * the signup that triggered it. That is only worth anything if somebody looks
 * at the status — an unread result is the same as a swallowed exception.
 */
function reportMailFailure(kind: string, result: MailResult) {
  if (result.ok) {
    return
  }

  // `skipped` is the expected outcome for every `@quincy.test` account, which
  // is most of what runs against this database. Logging it as an error would
  // put a red line under every `dev-account.ts` run and every `verify-*.ts`
  // script, which is the fastest way to teach everyone to ignore this log.
  if (result.reason === "skipped") {
    return
  }

  console.error(
    `[auth] ${kind} email not delivered (${result.reason}): ${result.message}`
  )
}

/**
 * Google is only offered when it is actually configured. An OAuth button that
 * fails on click is worse than no button — it looks like the product is broken
 * rather than unfinished. `isGoogleEnabled` is exported so the sign-in surfaces
 * can decide whether to render it at all.
 */
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET

export const isGoogleEnabled = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET)

export const auth = betterAuth({
  appName: "Quincy",

  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    // The neon-http driver speaks one request per statement and has no
    // transaction support. The adapter already defaults to false; it is written
    // out because it is load-bearing here, not incidental — switching to the
    // WebSocket driver is what would let this become true.
    transaction: false,
  }),

  emailAndPassword: {
    enabled: true,
    // Mail delivers now, so this is on: an unverified address cannot sign in.
    // It is list hygiene as much as security — a typo'd address that can still
    // use the product keeps bouncing, and bounce rate is the number the big
    // providers judge a young sending domain by.
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      const result = await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        url,
      })
      reportMailFailure("reset-password", result)
    },
  },

  emailVerification: {
    // Named here rather than left as better-auth's default so the copy in
    // resend-verification.tsx (`EMAIL_VERIFICATION_LIFETIME_LABEL`) states this
    // exact value in words instead of asserting an implicit default.
    expiresIn: EMAIL_VERIFICATION_EXPIRES_IN_SECONDS,
    // `sendOnSignUp` is deliberately absent: it defaults to whatever
    // `requireEmailVerification` is, so setting both is one more place to
    // forget. If verification is ever relaxed, the send follows it down.
    sendVerificationEmail: async ({ user, url }) => {
      const result = await sendVerificationEmail({
        to: user.email,
        name: user.name,
        url,
      })
      reportMailFailure("verify-email", result)
    },
    // The click already proves control of the mailbox, which is the same thing
    // the password proves plus one factor. Making someone type it again after
    // they have just proved more is friction that buys nothing.
    autoSignInAfterVerification: true,

    // The password half of the welcome. Firing it at signup instead would put
    // two emails in the inbox at once and invite the wrong click — the account
    // is not usable until this point anyway, so "welcome" would be premature.
    afterEmailVerification: async (user) => {
      // The free day starts here, not at signup. See lib/trial.ts — the short
      // version is that an unverified account cannot be used, so dating the
      // trial from `createdAt` would expire it before its owner ever saw it.
      await startTrial(user.id)

      const result = await sendWelcomeEmail({
        to: user.email,
        name: user.name,
        userId: user.id,
      })
      reportMailFailure("welcome", result)
    },
  },

  databaseHooks: {
    user: {
      create: {
        /**
         * **The invite gate, and the only one that counts.** See plans/023.
         *
         * `/signup` refuses to render its form without a live code, but that
         * is a courtesy to a person with a browser. Anyone can POST straight
         * to `/api/auth/sign-up/email`, and a gate that lives in a page is not
         * a gate. This hook is the choke point every path goes through —
         * password signup and Google alike — which is why it is here rather
         * than in the `hooks.before` middleware below, where it would have to
         * name each route and would miss the OAuth callback.
         *
         * It **spends** the invite as it checks it, in one statement. A read
         * followed by a write loses the race between two signups on one link.
         *
         * FORBIDDEN rather than a redirect: this is an API answer, and the
         * signup form turns it into a sentence pointing at the waitlist.
         */
        before: async (user) => {
          if (isUnreachableTestAddress(user.email)) {
            return
          }

          if (!(await spendInviteFor(user.email))) {
            throw new APIError("FORBIDDEN", {
              message:
                "Quincy is invite-only right now. Join the waitlist and you will get one.",
              code: "INVITE_REQUIRED",
            })
          }
        },

        /**
         * The Google half of the welcome.
         *
         * Google verifies the address itself, so a social signup lands here
         * already verified and never passes through afterEmailVerification —
         * that path would leave OAuth users with no welcome at all. A password
         * signup lands here too, but unverified, and is skipped: its welcome
         * comes later, from the hook above.
         *
         * So the flag is not a detail of this hook, it *is* the routing. One
         * welcome per user either way, at the first moment the account is
         * actually usable. The idempotency key on the user id makes an overlap
         * harmless if that ever stops being true.
         */
        after: async (user) => {
          if (!user.emailVerified) {
            return
          }

          // Same branch, same reason, one line later: this is the moment a
          // Google account becomes usable, so this is when its day starts.
          // Both trial starts sit exactly where the welcome email sits, and
          // that is not a coincidence — "the account is usable now" is the
          // single fact both of them are keyed to.
          await startTrial(user.id)

          const result = await sendWelcomeEmail({
            to: user.email,
            name: user.name,
            userId: user.id,
          })
          reportMailFailure("welcome", result)
        },
      },
    },
  },

  ...(isGoogleEnabled
    ? {
        socialProviders: {
          google: {
            clientId: GOOGLE_CLIENT_ID!,
            clientSecret: GOOGLE_CLIENT_SECRET!,
          },
        },
      }
    : {}),

  /**
   * Rate limiting is on by default in production, but the default storage is
   * in-memory, and this deploys to serverless. Every cold start gets a fresh
   * counter, and concurrent instances never see each other's, so the limit is
   * whatever number happens to land on one lambda. Database storage is the
   * only one that counts the same request twice.
   *
   * The per-endpoint defaults are already 3 per 10s on sign-in and sign-up.
   * These widen the window instead of the count: a minute of real backoff is
   * worth more against credential stuffing than ten seconds of it.
   */
  rateLimit: {
    enabled: true,
    storage: "database",
    // Keys here must be real better-auth route paths — an unmatched key is
    // not an error, it is simply never applied, and better-auth's built-in
    // default for that path quietly takes over instead.
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
      "/request-password-reset": { window: 60, max: 3 },
      "/reset-password": { window: 60, max: 5 },
      // The reason `sendOnSignIn` is off, made explicit. This endpoint takes an
      // arbitrary address from an unauthenticated caller and sends mail to it,
      // which is the same mail-bomb primitive — the difference is that here the
      // limit is the control rather than the absence of the feature. Matched to
      // /request-password-reset, the other unauthenticated sender.
      "/send-verification-email": { window: 60, max: 3 },
    },
  },

  user: {
    additionalFields: {
      /**
       * When the free day runs out. Null until the account is verified.
       *
       * On the user row rather than in its own table because of where it is
       * read: it rides along on the session every request already fetches, so
       * the entire trial costs zero extra round trips to check. On Neon that
       * is the difference between a free gate and a ~120ms one (lib/session.ts).
       *
       * `input: false` is the security half and is not optional. Without it
       * the field is accepted from the client on sign-up, and anyone willing
       * to edit a request body grants themselves a trial ending in 2099.
       */
      trialEndsAt: {
        type: "date",
        required: false,
        input: false,
      },

      /**
       * The IANA zone this person's clock is in. "Europe/Oslo", not "+02:00" —
       * an offset is a fact about one moment, and a slot at 08:00 has to stay
       * at 08:00 when the clocks move.
       *
       * On the user row for the same reason `trialEndsAt` is: /lineup needs it
       * on every render and it rides along on the session that request already
       * fetched, so reading it costs nothing.
       *
       * `input: true` here, unlike `trialEndsAt`, and the difference is what
       * the field can do. A trial end is a grant — accepting it from the client
       * hands out free months. A timezone only decides how this person's own
       * hours are drawn for this person. The client is also the only thing that
       * knows it: the server sees an IP, and geolocating one is both a worse
       * guess and a tracking decision nobody asked for.
       *
       * Nullable, and stays nullable. Google sign-ups arrive without one, every
       * account created before this existed has none, and `resolveTimeZone` in
       * lib/timezone.ts is the single place that turns absent-or-junk into UTC.
       */
      timezone: {
        type: "string",
        required: false,
        input: true,
      },

      /**
       * When first run finished or was skipped. Null means it has not been.
       *
       * On the user row for the same reason the two above are: the `(app)`
       * layout has to ask on every navigation in the group, and here it rides
       * along on the session that request already fetched. A separate table
       * would put a ~120ms Neon round trip in front of every page in the app
       * to answer a question that is "yes" for every account but the newest.
       *
       * `input: false`, like `trialEndsAt` and unlike `timezone`. A timezone
       * is a fact only the client knows and can only change how that person's
       * own hours are drawn. This decides whether first run happens at all,
       * and the client has no business asserting it — a signup body carrying
       * `onboardedAt` would skip the interview and leave the account in
       * exactly the empty state plans/022 exists to prevent.
       */
      onboardedAt: {
        type: "date",
        required: false,
        input: false,
      },
    },
  },

  account: {
    // Google's access and refresh tokens land in the account table. Nothing
    // reads them yet, which is exactly when to turn this on: there are no
    // stored values to migrate, so it costs nothing now and would cost a
    // backfill later.
    encryptOAuthTokens: true,

    accountLinking: {
      // Someone who signed up with a password and later uses Google on the same
      // verified address gets one account, not two. Google verifies the address
      // itself, which is what makes this safe to do automatically.
      enabled: true,
      trustedProviders: ["google"],
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh the row at most once a day
    cookieCache: {
      enabled: true,
      // The cap is the point. A cached session is read from the cookie without
      // touching the database, so a ban or a revoked session stays live until
      // this expires. Five minutes keeps the read path cheap while bounding how
      // long a revoked session can outlive its revocation.
      maxAge: 5 * 60,
    },
  },

  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
  },

  /**
   * The guard that actually runs.
   *
   * `authorizeReference` on the Stripe plugin looks like the right place and is
   * not: the plugin's reference middleware returns early when a request carries
   * no explicit `referenceId`, which is every self-service upgrade this app
   * makes. It fires only when one user names another's reference id.
   *
   * A root-level before-hook is registered with `matcher: () => true`
   * (better-auth/dist/api/dispatch.mjs), so it sees every request with no
   * plugin-internal shortcut in front of it.
   *
   * What it prevents is two $49 subscriptions on one account: two tabs, a
   * double click fast enough to beat the button's disabled state, or a replayed
   * request. The customer finds out on their statement and the refund is
   * manual.
   */
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      /**
       * The provider's admin OAuth surface, closed.
       *
       * `@better-auth/oauth-provider` registers seven endpoints under
       * `/admin/oauth2/**` — create and update a client, create, read, update
       * and delete a resource, link and unlink a client to one. They are gated
       * by `clientPrivileges` and `resourcePrivileges`, and the plugin says in
       * its own comment (authorize-*.mjs, `assertResourcePrivileges`) that an
       * undefined callback "degrades to any authenticated session can manage
       * resources". `metadata: { SERVER_ONLY: true }` marks them as not
       * client-callable; it does not take them off the router, and an ordinary
       * `fetch` reaches them.
       *
       * What they are worth to a stranger with a free account: admin create
       * takes `skip_consent`, which is the one screen standing between a
       * program and somebody's material, plus `require_pkce` and
       * `enable_end_session`; resource update takes `accessTokenTtl` and
       * `disabled`, which are the lifetime and the on-switch of every token
       * this server issues.
       *
       * Nothing in this app calls one. /settings registers through
       * `/oauth2/create-client` and removes through `/oauth2/delete-client`,
       * both of which are user-scoped and neither of which is under this
       * prefix. So the whole prefix is a 404.
       *
       * A prefix rather than `disabledPaths`: that option is an exact-match
       * `includes` against the normalized path (better-auth/dist/api/index.mjs
       * ~166), and `/admin/oauth2/resources/:identifier` and
       * `/admin/oauth2/resources/:identifier/clients/:client_id` are
       * parameterised — there is no finite list of strings to put in it.
       *
       * NOT_FOUND rather than UNAUTHORIZED, because "this server has no such
       * endpoint" is true and is the smaller thing to say. The predicate is
       * `isAdminOAuthPath` in lib/mcp-gate.ts so it has a test; it anchors on
       * `/admin/oauth2/` and on the exact string, so `/oauth2/create-client`
       * is untouched.
       */
      if (isAdminOAuthPath(ctx.path)) {
        throw new APIError("NOT_FOUND", { message: "Not found." })
      }

      if (ctx.path !== "/subscription/upgrade") {
        return
      }

      // Not `ctx.context.session` — a before-hook runs ahead of the endpoint's
      // own session middleware, so that field is not reliably populated yet.
      const session = await getSessionFromCtx(ctx)

      // No session is not this hook's problem; the endpoint refuses it itself,
      // and answering here would change the error a signed-out caller sees.
      if (!session?.user?.id) {
        return
      }

      if (await hasLiveSubscription(session.user.id)) {
        throw new APIError("CONFLICT", {
          message: "You already have an active subscription.",
        })
      }
    }),
  },

  plugins: [
    admin(),
    // Remembers which method you signed in with last, in a cookie. Cookie
    // rather than the database (storeInDatabase defaults to false, and stays
    // false): the badge is a hint about this device, not a fact about the
    // account, and it needs no schema change to be right.
    lastLoginMethod(),
    /**
     * Billing. Note what is absent: `freeTrial`.
     *
     * The plugin can run the trial in Stripe — Checkout at signup, card taken,
     * one day free, automatic charge — and that brings its own abuse
     * prevention with it. We do not use it, because a one-day trial behind a
     * card form is not a trial; it is a purchase with a 24-hour escape hatch,
     * and the card lands before the product has drafted a sentence.
     *
     * The trade is real and is written down in docs/billing.md: their
     * enforcement is one trial per Stripe customer, ours is one trial per
     * verified account (lib/trial.ts). A second email defeats ours and would
     * not defeat theirs.
     *
     * So Stripe sees nobody until somebody pays. There is no subscription row
     * during the free day, which is exactly why lib/billing.ts checks the
     * trial first and only queries the subscription table once it has run out.
     */
    stripe({
      stripeClient,
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
      // A Stripe customer per user at signup, so the first checkout is an
      // upgrade of a known customer rather than a stranger — it keeps one
      // email attached to one customer instead of letting Checkout mint a
      // second one on the way through.
      createCustomerOnSignUp: true,
      subscription: {
        enabled: true,
        // Mirrors emailAndPassword. An unverified address cannot sign in, so
        // it should not be able to start a subscription either.
        requireEmailVerification: true,
        plans: [{ name: PLAN_NAME, lookupKey: PLAN_LOOKUP_KEY }],
        /**
         * The server-side half of "one subscription per account".
         *
         * Hiding the Subscribe button once somebody has paid is presentation;
         * this is enforcement. The endpoint stays reachable with nothing but a
         * session cookie, and two tabs — or one fast double click — are enough
         * to open a second subscription beside the first. Better Auth does not
         * deduplicate: its own docs say upgrading without a `subscriptionId`
         * bills twice. The customer finds out on their statement.
         *
         * Default is allow. This hook governs all five subscription actions,
         * so denying by default would lock people out of cancelling and out of
         * the billing portal — the two things somebody unhappy about billing
         * most needs to reach.
         */
        authorizeReference: async ({ referenceId, action }) => {
          if (action !== "upgrade-subscription") {
            return true
          }

          return !(await hasLiveSubscription(referenceId))
        },
        /**
         * Stripe renders the "Add promotion code" field only when the session
         * asks for it, so without this there is no way to discount anything
         * short of editing the database by hand. Codes themselves live in the
         * Stripe dashboard, which is the point: a launch offer or a comped
         * beta user stops being a deploy.
         *
         * `payment_method_collection: "if_required"` is the half that makes a
         * 100%-off code actually free — otherwise Checkout still demands a
         * card for a zero-amount subscription. Paying customers are
         * unaffected: $49 is a non-zero amount due, so the card is collected
         * exactly as before.
         *
         * The consequence is that a fully-comped subscription has no card on
         * file. That is right for a `forever` coupon and wrong for one that
         * expires — when the discount lapses there is nothing to charge, the
         * invoice fails, and lib/billing.ts reads the account as lapsed. Comp
         * codes must be `forever`; time-limited offers should be a percentage
         * off, never 100%.
         */
        getCheckoutSessionParams: async () => ({
          params: {
            allow_promotion_codes: true,
            payment_method_collection: "if_required",
          },
        }),
      },
    }),
    /**
     * The signing keyring, and it is a dependency rather than a feature.
     *
     * `@better-auth/mcp` issues an access token as a JWT whenever the request
     * names a resource, which is every request here — the token is
     * audience-bound to `MCP_RESOURCE`. `requireMcpAuth` then verifies it
     * against `/api/auth/jwks`, which is this plugin. Without it the provider
     * refuses to boot, and it is what adds the `jwks` table to the schema.
     */
    jwt(),
    /**
     * Quincy as an OAuth 2.1 authorization server, so an outside agent can
     * reach the tools the Studio chat has. See lib/mcp.ts and docs/mcp.md.
     *
     * `@better-auth/mcp` is `@better-auth/oauth-provider` configured for MCP.
     * The core `mcp()` plugin this replaced was deprecated in 1.7 and is gone
     * in the next release; every protocol path moved from `/mcp/*` to
     * `/oauth2/*` with it, which a client discovers from the metadata rather
     * than being told.
     *
     * `loginPage` is `/login`, which is the route this app actually has —
     * proxy.ts lists it under AUTH_PAGES and the provider sends an
     * unauthenticated authorization request there, so a wrong value here is a
     * 404 in the middle of somebody's consent flow.
     *
     * **Consent is not optional, and no hook is needed to make it so.** The
     * provider issues a code without a screen only when a stored `oauthConsent`
     * row already covers every requested scope, claim and resource. The version
     * this replaced short-circuited on `prompt !== "consent"` instead, which is
     * why lib/auth.ts used to force the value; that hook is deleted, and the
     * behaviour it was defending is now the plugin's own.
     *
     * **Dynamic client registration is off**, which is the 1.7 default and is
     * left alone. `allowDynamicClientRegistration` and
     * `allowUnauthenticatedClientRegistration` are both unset, so
     * `/oauth2/register` answers 403 to everyone. A client identifies itself
     * one of two ways instead: a Client ID Metadata Document, which `cimd()`
     * below verifies over HTTPS, or a registration the owner makes on
     * /settings through `/oauth2/create-client`. Both are better than the RFC
     * 7591 anonymous POST the old plugin exposed — one proves domain
     * ownership, the other has a person behind it.
     *
     * PKCE is not an option here any more, it is the rule:
     * `code_challenge_methods_supported` is `["S256"]` and nothing else, for
     * every client shape.
     *
     * The six scopes are the four OpenID ones plus `read` and `write`, and
     * lib/mcp.ts is where the last two are spent: `write` is required for the
     * two tools that cost money, and there is deliberately no scope that can
     * approve, schedule or publish. The provider serves them at
     * `/.well-known/oauth-authorization-server` and serves `read` and `write`
     * alone at `/.well-known/oauth-protected-resource` — it drops the identity
     * scopes from the second document itself, because they are facts about
     * this server rather than about the MCP endpoint.
     */
    mcp({
      loginPage: "/login",
      consentPage: MCP_CONSENT_PAGE,
      resource: MCP_RESOURCE,
      scopes: [...MCP_SCOPES_SUPPORTED],
      /**
       * RBAC on clients, and the second half of closing the admin surface.
       *
       * `assertClientPrivileges` runs on every client mutation, admin and
       * user-scoped alike, and it is handed the *action* rather than the path.
       * Two of those actions are the product: `create` is /settings registering
       * an agent through `/oauth2/create-client`, and `delete` is Remove on the
       * same page. Everything else — read, list, update, rotate, and
       * configuring client-credentials scopes for a grant this server does not
       * issue — has no caller in this repo, so it is refused.
       *
       * This is deliberately not "return false". The plugin enforces the same
       * hook at the shared creation chokepoint, so a blanket refusal would take
       * the /settings registration form down with the admin endpoints.
       *
       * Note what defining this callback *does not* loosen:
       * `configure-client-credentials-scopes` throws UNAUTHORIZED outright when
       * the option is undefined, so returning false for it keeps that exact
       * behaviour rather than opening it.
       *
       * The seed path does not come through here. `seedResources` writes
       * `oauth_resource` with `ctx.adapter` at init, never through an endpoint.
       */
      clientPrivileges: ({ action }) =>
        action === "create" || action === "delete",
      /**
       * RBAC on resources. Every caller of this is an admin endpoint under
       * `/admin/oauth2/resources`, which the hook above already answers 404 to,
       * so `false` here costs nothing and is what the plugin's own comment asks
       * for: with the callback undefined the gate "degrades to any
       * authenticated session can manage resources".
       *
       * The one resource this server has is seeded from the `resource` option
       * at boot. Nothing should ever create, retitle, re-TTL or disable it over
       * HTTP.
       */
      resourcePrivileges: () => false,
    }),
    /**
     * Client ID Metadata Documents, the MCP 2026-07-28 way for a client to say
     * who it is without anybody registering it.
     *
     * The client presents an HTTPS URL as its `client_id`; the plugin fetches
     * the document at that URL and creates the client from it. That is the
     * replacement for anonymous dynamic registration and it is a strictly
     * better trade: a stranger can still bring a client, but the client's
     * identity is pinned to a domain it controls rather than to a name it
     * typed.
     *
     * `fetchClientMetadataResource` comes from `@better-auth/cimd/node` and is
     * not interchangeable with `fetch`. It resolves the hostname once, refuses
     * RFC 6890 special-use addresses, pins the approved address for the
     * connection and follows no redirects — the guarantees that stop a
     * `client_id` URL being used to make this server fetch its own metadata
     * service. Wrapping the standard Fetch API cannot provide them.
     *
     * `metadataProfile` pins CIMD draft-00 as MCP 2026-07-28 requires, which
     * is what makes `client_name` and `redirect_uris` mandatory in the
     * document. Without it the generic draft-02 rules apply and a document
     * with no name would produce a consent screen with nothing to name.
     */
    cimd({
      fetchClientMetadataResource,
      metadataProfile: "mcp-2026-07-28",
    }),
    // nextCookies must stay last. It works by wrapping the response to flush
    // Set-Cookie through Next's cookies() API, so any plugin registered after
    // it would have its cookies written after the flush and silently dropped.
    nextCookies(),
  ],
})

export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user
