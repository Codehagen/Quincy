import Stripe from "stripe"

const SECRET_KEY = process.env.STRIPE_SECRET_KEY
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET

/**
 * Whether checkout can actually run. Both halves are required and neither is
 * useful alone: the secret key opens a Checkout session, the webhook secret is
 * what lets us believe the answer that comes back.
 *
 * Exported so the billing surface can say "billing is not configured" instead
 * of rendering a Subscribe button that fails on click — the same posture as
 * `isGoogleEnabled` in lib/auth.ts, and for the same reason. A control that
 * breaks when you press it reads as a broken product rather than an unfinished
 * one.
 *
 * Note what this does *not* gate: reading entitlement. lib/billing.ts resolves
 * trial and subscription state from our own tables and never calls Stripe, so
 * the gates stay correct even in an environment that cannot take payment.
 */
export const isBillingConfigured = Boolean(SECRET_KEY && WEBHOOK_SECRET)

/**
 * The client is constructed unconditionally, with an obviously fake key when
 * the real one is absent.
 *
 * Making the plugin itself conditional was the first instinct and it is wrong:
 * `pnpm auth:generate` reads the plugin list to decide which tables to emit, so
 * a config that drops the plugin without a key would silently generate a schema
 * with no `subscription` table. The failure would land in production, not here.
 *
 * Constructing a client does not open a socket or validate the key, so the cost
 * of always having one is nothing, and an accidental call fails at Stripe with
 * "Invalid API Key" — which names the problem better than a TypeError would.
 */
export const stripeClient = new Stripe(SECRET_KEY ?? "sk_test_unconfigured", {
  // Pinned to the version this SDK ships with (node_modules/stripe/cjs/apiVersion.js).
  // The plugin's own docs quote 2026-06-24.dahlia, which is a release behind —
  // following them here would silently downgrade every request.
  apiVersion: "2026-07-29.dahlia",
})

/**
 * The one plan. `lookupKey` rather than a price id: a lookup key is stable
 * across test and live mode, so going live means creating the same key on the
 * live product rather than swapping an environment variable and finding out in
 * production that it still held the test id.
 */
export const PLAN_NAME = "quincy"
export const PLAN_LOOKUP_KEY = "quincy_monthly"
export const PLAN_PRICE_USD = 49
