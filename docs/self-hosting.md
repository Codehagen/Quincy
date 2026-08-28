# Self-hosting Quincy

Quincy runs anywhere Next.js runs. This guide takes you from a clone to a
working instance — locally first, then deployed.

## Prerequisites

- **Node.js 22+**
- **pnpm** — not npm. `ffmpeg-static` installs without its binary under npm
  (see [`video-ingest.md`](video-ingest.md)).
- A Postgres database. A free [Neon](https://neon.tech) project works; use
  its pooled connection string.

## Local setup

```bash
git clone https://github.com/Codehagen/Quincy.git
cd Quincy
pnpm install
cp .env.example .env.local
```

`pnpm install` will report that it skipped `@aiforui/lapse`, and that is
expected rather than a broken clone. It is an animation inspector on a private
registry, listed as an optional dependency so the install survives not being
able to fetch it. Nothing in the product uses it; when it is absent the panel
in `components/lapse-panel.tsx` renders nothing and the import that would pull
it in is dropped at build time.

Fill in `.env.local`. Every variable is documented in
[`.env.example`](../.env.example); the minimum to boot the app is:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Your Postgres connection string |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | `http://localhost:3000` |

Everything else — Resend, Stripe, the X and LinkedIn apps, the GitHub App,
S3, the AI gateway — is optional and degrades gracefully. An empty Resend key
means mail is skipped and logged, not a crash.

Push the schema:

```bash
pnpm db:push
```

## A local account

Sign-up requires a verified email, and verification is a real mail delivery —
that behaviour is deliberately the same in every environment. For local work,
set `DEV_ACCOUNT_EMAIL` and `DEV_ACCOUNT_PASSWORD` in `.env.local` and seed a
pre-verified test account:

```bash
npx tsx --env-file=.env.local scripts/dev-account.ts
```

The script is idempotent and refuses any address outside `@quincy.test`.

Then:

```bash
pnpm dev
```

Sign in at `http://localhost:3000` with the dev account.

## Optional integrations

Each block in [`.env.example`](../.env.example) explains its own variables.
In short:

- **Resend** (`RESEND_API_KEY`, `MAIL_FROM`, `RESEND_WEBHOOK_SECRET`) —
  transactional mail and delivery events. Send from a verified subdomain.
- **The GitHub App** (Shipped Work) — do not fill these in by hand. Deploy
  without them, sign in, and open `/api/connect/github/app`; GitHub's
  manifest flow creates the app and hands back the values.
- **`GITHUB_TOKEN`** (Trend Alerts) — any read-only personal access token.
  Optional and unrelated to the GitHub App above: it raises the rate limit on
  the public repository search. Without it the search runs unauthenticated at
  ten requests a minute per IP, which is fine for one user and not for a
  shared address — Trend Alerts then falls back to Hacker News alone, which
  needs no key at all.
- **X and LinkedIn** — OAuth apps for publishing channels. These two are the
  only first-party publishers.
- **`EXTERNAL_PUBLISHER_URL`, `EXTERNAL_PUBLISHER_TOKEN`** — an external
  scheduler, reached over its REST API, for every other channel. Both or
  neither. Off in a default deployment, and that is the intended state: a post
  scheduled to a channel with no first-party publisher is refused with "No
  publisher for {channel}" until you point these at a service you run. No code
  from that service is vendored here — Quincy POSTs to `{URL}/posts` with the
  token as a bearer, so its licence stays your deployment's question.
- **Stripe** — billing, via the Better Auth Stripe plugin.
- **AI gateway** — model access for drafting.

## Quincy over MCP

An agent that is not the Studio chat can read your riffs, drafts, lineup and
numbers, and can put material in — it cannot approve, schedule or publish with
any token. It needs no environment variables; it needs three database tables.
[`docs/mcp.md`](mcp.md) is the whole story: the endpoint, the OAuth 2.1 flow,
the scopes and the eight tools.

## Migrations `db:push` does not cover

A fresh database gets everything from `pnpm db:push` — every table below is
declared in `lib/schema.ts` or `lib/schema-app.ts`, so a first install needs
nothing here.

An instance that already has data is the other case. `drizzle/` has no
baseline, so a generated migration would carry `CREATE TABLE` for the whole
app; these two are hand-written instead. Both are `IF NOT EXISTS` throughout
and verify what they made, so a second run changes nothing.

```bash
npx tsx --env-file=.env.local scripts/apply-mcp-oauth.ts
npx tsx --env-file=.env.local scripts/apply-post-metric.ts
```

- **`apply-mcp-oauth.ts`** — `oauth_application`, `oauth_access_token` and
  `oauth_consent`, the three tables Better Auth's MCP plugin needs. Without
  them the server runs and the first client to connect fails inside somebody
  else's tool.
- **`apply-post-metric.ts`** — the `post_metric` table and
  `channel_connection.last_metrics_at`. Without them `/numbers` has no series
  and the daily metrics refresh has nowhere to write.

## Deploying

The reference deployment is [Vercel](https://vercel.com): import the repo,
set the environment variables from your `.env.local` (with
`BETTER_AUTH_URL` pointing at your production domain), and deploy. Cron
routes are defined in [`vercel.json`](../vercel.json).

Anywhere else, `pnpm build && pnpm start` serves the app; you are
responsible for scheduling the cron routes yourself.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the dev server |
| `pnpm build` | Production build |
| `pnpm test` | Run the test suite (no env vars needed — the suite is pure mocks) |
| `pnpm typecheck` | TypeScript, no emit |
| `pnpm lint` | ESLint |
| `pnpm db:push` | Push the Drizzle schema to `DATABASE_URL` |
| `pnpm db:studio` | Browse the database |
| `pnpm email` | Preview the email templates on port 3001 |

A warning that applies to all of them: the `scripts/verify-*.ts` files are
end-to-end checks that run against the database `DATABASE_URL` points at.
They guard on `@quincy.test` addresses and tear down what they create, but
treat them as what they are — scripts that write to a real database.
