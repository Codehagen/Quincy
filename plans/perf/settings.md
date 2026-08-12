# /settings and /settings/billing — performance plan

Reviewed 2026-08-11.

## No findings requiring action

- /settings is a static shell around client components — no server reads at
  all beyond the layout's.
- /settings/billing: `getBillingSnapshot` is one indexed select, wrapped in
  React `cache` so the layout's entitlement read and this page share the
  request. No Stripe API call sits in the render path — status is read from
  the local `subscription` table that webhooks maintain. This is the correct
  shape; do not "freshen" it with a live Stripe call.
- The second `getSession` call is the request-cached one — free.
