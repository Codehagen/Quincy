import { AsyncLocalStorage } from "node:async_hooks"

import { betterAuth } from "better-auth"
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin } from "better-auth/plugins/admin"
// No dedicated subpath for these two in 1.6.25 — they are only on the barrel,
// so the tree-shaking convention the other plugins follow does not apply here.
import { lastLoginMethod, mcp } from "better-auth/plugins"
import { nextCookies } from "better-auth/next-js"
import { stripe } from "@better-auth/stripe"

import { db } from "./db"
import * as schema from "./schema"
// From lib/mcp-gate.ts, not lib/mcp.ts. Same values, no import graph: lib/mcp.ts
// reaches the drafting model and the metering tables, and this file must not.
import {
  forceConsentPrompt,
  mcpGateStep,
  MCP_CONSENT_PAGE,
  MCP_METADATA,
  MCP_REGISTER_REFUSAL,
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

/**
 * Who an MCP tool call is acting for, for the length of that call and no
 * longer.
 *
 * **Why this exists.** The two writes the MCP server exposes are the same
 * server actions the web app calls — `captureToRiff` and `draftAngle` — and
 * those resolve the session from the request themselves (`lib/session.ts`),
 * which is exactly what makes them safe to call from a tool: the id in the
 * argument proves nothing, the cookie does. An MCP client holds an OAuth access
 * token and no cookie, so that resolution comes back null and both writes
 * answer "Not signed in."
 *
 * The alternative was a second copy of the write path with its own entitlement
 * check, its own cooldown and its own metering. AGENTS.md is explicit about
 * what that costs: the second copy of the money path is the one that goes
 * wrong. So the session is bridged instead, and the bridge is bound as tightly
 * as it can be:
 *
 * - It is an `AsyncLocalStorage`, so it exists only inside the callback that
 *   set it. Nothing outside `runAsMcpUser` can put a value in it, and no
 *   request can carry one in.
 * - `lib/mcp.ts` runs only the two write tools inside it. The six reads take
 *   their user as an argument and never needed it.
 * - The hook below reads it on `/get-session` alone. It is not a way to
 *   authenticate a request; the request was already authenticated by
 *   `withMcpAuth` against a live, unexpired access token before anything here
 *   runs.
 *
 * What it deliberately does **not** do is make a bearer token behave like a
 * session anywhere else in the app. An MCP token cannot reach `/api/chat`, a
 * page, or `approveVersion`, because none of those runs inside this store.
 */
export type McpActor = { userId: string }

const mcpActor = new AsyncLocalStorage<McpActor>()

/** Run `fn` with the MCP token's user standing in for the session cookie. */
export function runAsMcpUser<T>(
  actor: McpActor,
  fn: () => Promise<T>
): Promise<T> {
  return mcpActor.run(actor, fn)
}

/**
 * The MCP plugin's options, hoisted out of the `plugins` array on purpose.
 *
 * `metadata` belongs at the **top level**, beside `loginPage`, because that is
 * the object the plugin spreads into
 * `/.well-known/oauth-authorization-server` (`plugins/mcp/index.mjs`, in
 * `getMCPProviderMetadata`). The copy inside `oidcConfig` feeds a different
 * document — `/.well-known/oauth-protected-resource` — so setting only that one
 * advertised `read` and `write` to a client reading RFC 9728 and hid them from
 * a client reading RFC 8414. Both are set now, from the same constant.
 *
 * `MCPOptions` does not declare `metadata`, even though the runtime reads it.
 * A literal passed straight to `mcp({...})` would be refused by the
 * excess-property check; a literal assigned to a variable first is not fresh
 * any more, so the same object goes through untouched. That is the whole reason
 * this is a `const` rather than an argument — not style, and not an
 * `as never` that would throw the rest of the type checking away with it.
 */
const mcpOptions = {
  loginPage: "/login",
  metadata: MCP_METADATA,
  oidcConfig: {
    // Stated twice, and not by choice: `oidcConfig` is the OIDC provider's
    // own options object, which requires it. The plugin overwrites this
    // with the value above, so the two can only ever be the same — kept
    // identical so a reader is not left deciding which one wins.
    loginPage: "/login",
    /**
     * The screen a person actually sees before a token exists.
     *
     * Without it the plugin issues the code even when `prompt=consent` is
     * asked for — `authorize.mjs` falls through to the redirect when no
     * consent page is configured. With it, the browser is sent to
     * `/consent?consent_code=…&client_id=…&scope=…` and nothing is minted
     * until that page posts `{ accept: true }`.
     */
    consentPage: MCP_CONSENT_PAGE,
    requirePKCE: true,
    scopes: ["read", "write"],
    // What a client sees at /.well-known/oauth-protected-resource. The
    // OpenID four are what the plugin always issues; the two after them
    // are the ones that decide anything here.
    metadata: MCP_METADATA,
  },
}

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
       * The two rules this app adds to the MCP plugin's OAuth server.
       *
       * Both are here rather than in the plugin's own options because the
       * plugin has no option for either: `prompt` is whatever the client sent,
       * and `/mcp/register` is unauthenticated by design (RFC 7591). The
       * decision itself is `mcpGateStep` in lib/mcp-gate.ts, which is pure and
       * has a test; this block is the two lines of plumbing around it.
       */
      const gate = mcpGateStep(ctx.path)

      if (gate === "force-consent") {
        /**
         * Consent, always, whatever the client asked for.
         *
         * Without this the plugin issues the code the moment the owner has a
         * session — `authorize.mjs` short-circuits on `prompt !== "consent"` —
         * so a client that never sends `prompt` gets a token with no screen in
         * front of it. Mutated in place rather than reassigned: a before-hook
         * is handed a shallow copy of the context, so `ctx.query = {...}` is
         * discarded and `ctx.query.prompt = ...` is not.
         *
         * It survives the login round trip on its own. When nobody is signed
         * in the plugin stores this query in the `oidc_login_prompt` cookie and
         * its after-hook replays it after sign-in, dropping only `login`.
         */
        forceConsentPrompt(ctx.query)
        return
      }

      if (gate === "require-session") {
        /**
         * A stranger may not register a client.
         *
         * RFC 7591 anonymous registration is what the plugin implements and
         * what this trades away, deliberately: an unauthenticated POST writes a
         * row to `oauth_application` for anyone who can reach the origin, and a
         * client with no `userId` cannot be listed on /settings or removed
         * there. MCP clients are registered by the person who is going to use
         * them, so a signed-in browser is the honest requirement. The cost is
         * that a client cannot discover-and-register on its own; docs/mcp.md
         * says how to do it by hand.
         */
        const session = await getSessionFromCtx(ctx)

        if (!session?.user?.id) {
          throw new APIError("UNAUTHORIZED", {
            error: "invalid_client",
            error_description: MCP_REGISTER_REFUSAL,
            message: MCP_REGISTER_REFUSAL,
          })
        }

        return
      }

      /**
       * The MCP half of the session read. See `runAsMcpUser` above for why it
       * is here rather than in a second copy of the write path.
       *
       * Returning a value from a before-hook short-circuits the endpoint, so
       * this *is* the answer `auth.api.getSession` gives — which is what makes
       * `captureToRiff` and `draftAngle` work unchanged over a bearer token.
       * The store is empty on every request that is not an MCP tool call, so
       * this branch costs one comparison and falls through.
       */
      if (ctx.path === "/get-session") {
        const actor = mcpActor.getStore()

        if (!actor) {
          return
        }

        // The real row, not a synthesised one. `trialEndsAt` and `timezone`
        // ride along on it, and the entitlement gate inside the write actions
        // reads exactly those — a stub would hand every MCP caller a free day.
        const user = await ctx.context.internalAdapter.findUserById(
          actor.userId
        )

        if (!user) {
          return
        }

        /**
         * A banned account has no session, over a token or over a cookie.
         *
         * The admin plugin ends the browser sessions when somebody is banned;
         * it knows nothing about `oauth_access_token`, so an MCP client keeps
         * working until its token expires and its refresh token keeps minting
         * new ones for a week after that. Falling through here rather than
         * answering — the endpoint then resolves no session, and both writes
         * say "Not signed in." The route refuses earlier and more plainly with
         * a 401; this is the second gate, on the path a tool actually takes.
         */
        // Cast because `banned` is the admin plugin's column: it is on the row
        // and off the internal adapter's `User` type, which knows only the core
        // fields. Read as an unknown property rather than widened to `any`.
        if ((user as { banned?: boolean | null }).banned) {
          return
        }

        return ctx.json({
          session: {
            // Prefixed so a session that came from a token is distinguishable
            // from one that came from a cookie at a glance in a log.
            id: `mcp_${actor.userId}`,
            token: "",
            userId: actor.userId,
            // The access token's own expiry is what bounds this; the value here
            // is never persisted and never re-read.
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            createdAt: new Date(),
            updatedAt: new Date(),
            ipAddress: null,
            userAgent: null,
          },
          user,
        })
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
     * Quincy as an OAuth 2.1 authorization server, so an outside agent can
     * reach the tools the Studio chat has. See lib/mcp.ts and docs/mcp.md.
     *
     * `loginPage` is `/login`, which is the route this app actually has —
     * proxy.ts lists it under AUTH_PAGES and the plugin sends an unauthenticated
     * authorization request there, so a wrong value here is a 404 in the middle
     * of somebody's consent flow.
     *
     * **Dynamic client registration is on, and gated.** The plugin's
     * `/mcp/register` takes an unauthenticated POST, which is what RFC 7591
     * asks for; the before-hook above requires a session on it anyway. A
     * registration buys a client id and nothing else, but an anonymous one
     * leaves a row in `oauth_application` that nobody owns — invisible on
     * /settings and impossible to remove there. The trade is written out at
     * `MCP_REGISTER_REFUSAL` in lib/mcp-gate.ts.
     *
     * **Consent is not optional.** `consentPage` gives the flow a real screen
     * and the before-hook forces `prompt=consent`, so neither half can be
     * skipped by a client that simply does not ask for it.
     *
     * `requirePKCE` is asked for explicitly rather than inherited. A public
     * client (`token_endpoint_auth_method: "none"`, which is what every MCP
     * client registers as) is already refused without a verifier; this extends
     * the same rule to a confidential client, so no registration shape can opt
     * out of it. `allowPlainCodeChallengeMethod` stays at its default of false,
     * so S256 is the only method — the metadata says so too.
     *
     * The two scopes are `read` and `write`, and lib/mcp.ts is where they are
     * spent: `write` is required for the two tools that cost money, and there
     * is deliberately no scope that can approve, schedule or publish. They are
     * written out here rather than imported so this file keeps its own import
     * graph — lib/mcp.ts reaches the drafting model and the metering tables.
     */
    mcp(mcpOptions),
    // nextCookies must stay last. It works by wrapping the response to flush
    // Set-Cookie through Next's cookies() API, so any plugin registered after
    // it would have its cookies written after the flush and silently dropped.
    nextCookies(),
  ],
})

export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user
