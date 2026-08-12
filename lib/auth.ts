import { betterAuth } from "better-auth"
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin } from "better-auth/plugins/admin"
// No dedicated subpath for this one in 1.6.25 — it is only on the barrel, so
// the tree-shaking convention the other plugins follow does not apply here.
import { lastLoginMethod } from "better-auth/plugins"
import { nextCookies } from "better-auth/next-js"
import { stripe } from "@better-auth/stripe"

import { db } from "./db"
import * as schema from "./schema"
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
    // nextCookies must stay last. It works by wrapping the response to flush
    // Set-Cookie through Next's cookies() API, so any plugin registered after
    // it would have its cookies written after the flush and silently dropped.
    nextCookies(),
  ],
})

export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user
