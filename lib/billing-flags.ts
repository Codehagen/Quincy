/**
 * Whether Stripe is the merchant of record for Quincy's sales.
 *
 * With Managed Payments on, Stripe (as Link) sells the subscription, adds the
 * VAT or sales tax that applies, files it and pays it to each country. Codebase
 * AS sees $49 less fees and registers for nothing abroad. A business that
 * enters a VAT number pays no VAT; the reverse charge is theirs.
 *
 * A flag rather than always-on because the account has to be approved for
 * Managed Payments first, and a session that asks for it on an account that
 * is not approved fails at Stripe — which would turn every Subscribe press
 * into an error. Set `STRIPE_MANAGED_PAYMENTS=1` once the approval is in.
 *
 * Its own module, with no imports, so the marketing pages can read it to say
 * "plus VAT where it applies" without pulling the Stripe SDK in with it. The
 * sentence must only appear while it is true: without this flag nobody
 * collects VAT, and the price is what the card is charged.
 */
export const MANAGED_PAYMENTS = process.env.STRIPE_MANAGED_PAYMENTS === "1"
