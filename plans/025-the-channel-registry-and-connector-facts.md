# 025 — The channel registry, and the facts for every connector on the roadmap

Written 2026-08-19. Every platform fact below was read from the platform's own
developer documentation on that date, and each section ends with the URLs that
were actually read. Facts marked **UNCERTAIN** could not be settled from
official documentation and say why.

**Status: facts only. Execution is gated.** Do not start any step in this plan
until both are true:

1. One real post has been published end to end on a real X connection
   (plan 005's owed post — the publish path has never sent one).
2. One invite has converted to a paying account and named, or plausibly
   implied, a platform we do not serve.

The one exception is Part 2, the corrections to the two live channels. Those
are debts on shipped code, not new surface, and may be executed on their own.

## Why this plan exists

The question "should Quincy add more platform connectors now" was decided on
2026-08-19: **no** — the funnel work (a real first run, the invites, the trial
ceiling) comes first, and breadth is where scheduling tools are strong and
free while their writing layer is empty. Voice is the axis Quincy wins on.

But two things survived that decision and are worth paying for cheaply now:

- **The dispatch code fails silently on a third channel** (Part 1). Four of
  the five failure modes are correctness or consent failures, and none is
  caught by the compiler. The refactor is cheapest while zero real accounts
  are connected.
- **The facts age slowly and the research is done** (Part 3). When a paying
  user asks for a platform, the executor should open this file, not a browser.

## Part 1 — The registry contract a third channel forces

### The finding that decides the shape

`config()` at `lib/channels.ts:70` is an exhaustive `switch` with no
`default`, so a third `ConnectableChannel` fails to compile there. Good.
Every other dispatch is `if (channel === "x") { … } else { LinkedIn }`.
**These do not fail to compile. A third channel is silently treated as
LinkedIn.** There are five:

| file:line                 | what happens to a third channel                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| `lib/channels.ts:397`     | `fetchProfile` calls LinkedIn's userinfo with the new provider's token                        |
| `lib/channels.ts:676`     | `probeLiveness` probes LinkedIn; the daily sweep writes `revoked` on a 401 that means nothing |
| `lib/channels.ts:876`     | `disconnect` skips the revoke call and deletes the row; a live credential stays live upstream |
| `lib/publish.ts:399`      | `publish` sends `urn:li:person:<externalId>` to LinkedIn                                      |
| `lib/publish.ts:472, 489` | cost is metered at zero                                                                       |

Two more findings:

- `ConnectableChannel` is both the TS union (`lib/schema-app.ts:531`) and the
  Drizzle column enum (`:569`). The enum is TS-level on a text column, but
  follow the `scripts/channels.sql` precedent anyway when adding a value.
- A platform's refusal is read in three places with three vocabularies:
  `TokenError.isRevoked` (`lib/channels.ts:358`, string-match on
  `invalid_grant`), `classify(status, body)` (`lib/publish.ts:105`), and the
  401/403 rule in `probeLiveness` (`lib/channels.ts:697`). One provider can
  disagree with itself across the three — and Part 3 shows every candidate
  platform breaks at least one of them.

### The `ChannelProvider` interface

Home: `lib/channels/registry.ts`, with `lib/channels/x.ts` and
`lib/channels/linkedin.ts`. `lib/channels.ts` keeps every exported function
name and becomes the storage + token-lifecycle layer that reads the registry.

```ts
/** What a platform's refusal means to us. Four verbs, because four responses exist. */
export type Refusal =
  | "refresh-token" // stale token: refresh, retry once
  | "bad-body" // the payload is wrong: never retry
  | "retry" // upstream unwell (429, 5xx): back off, write nothing
  | "disconnect" // the grant is gone: never publish on this row again

export type ChannelProvider = {
  readonly id: ConnectableChannel
  readonly label: string

  /* Auth. Replaces the switch at lib/channels.ts:70-118 verbatim. */
  readonly auth: {
    authorizationUrl: string
    tokenUrl: string
    scopes: readonly string[] // frozen per plans/005; changing = migration + mail
    pkce: boolean
    tokenAuth: "basic" | "body"
    refreshable: boolean
    /** Read at call time, never captured — see channels-maintenance.ts:191. */
    credentials(): { clientId?: string; clientSecret?: string }
  }

  fetchProfile(accessToken: string): Promise<ChannelProfile>
  probeLiveness(accessToken: string): Promise<LivenessResult>
  /** No-op for a provider with no revoke endpoint; the caller deletes the row either way. */
  revoke(accessToken: string, credentials: Credentials): Promise<void>
  publish(input: {
    connection: Connection
    accessToken: string
    text: string
  }): Promise<PublishResult>

  /** One reading of a refusal, for all three callers named above. */
  classify(input: { status: number; body: string }): Refusal

  /** Pure, browser-safe: measurePost runs on every keystroke. Settings are
      resolved on the server and passed down, the way DraftTarget.rules
      already is (lib/drafting.ts:131). Null = no published ceiling. */
  maxLength(settings: ChannelSettings): number | null
  fold(settings: ChannelSettings): number | null
  urlCost: number | null // flat per-URL charge; a platform property, not a setting

  /** Micro-dollars per publish, matching lib/pricing.ts. Takes the result
      because X only meters refusals the platform actually processed
      (publish.ts:469). Free platforms return 0 — a real answer. */
  publishCostMicros(input: { text: string; result: PublishResult }): number
  readonly usageLabel: string // usage_event.model; "x:post" today (publish.ts:91)
}

export type ChannelSettings = { tier: string | null }
```

Load-bearing notes:

- **`credentials()` is a function.** A rotated secret must read as
  "unconfigured" on the next sweep, not the next deploy, or the sweep mails
  every user (`lib/channels-maintenance.ts:191`).
- **`Refusal` is four values; `PublishFailure` stays nine.** Different
  questions: "what do we do next" versus "what does the user read". Do not
  merge them (`publish.ts:436-447`).
- **`maxLength` takes settings; `urlCost` does not.** t.co is a property of
  the platform, not of a subscription.
- **Part 3 already breaks this shape twice**, and that is a feature: Bluesky
  needs `auth` to become a discriminated union on a `protocol` tag, and
  Mastodon needs per-connection credentials. Design the union when the third
  channel is chosen, not speculatively.

### What must move, and what must not

Move behind the registry: the five silent-wrong branches above, plus
`isChannelEnabled` (`channels.ts:133`), `channelLabel` (`:138`),
`isRefreshable` (`:142`), `X_COST_MICROS` (`publish.ts:73`), the `"x:post"`
literal (`:91`), and `CHANNEL_RULES` (`post-length.ts:42`) as
`rulesFor(channel, settings)`.

Collapse the six duplicated label tables: `lib/lineup.ts:274`,
`components/lineup/slot-composer.tsx:60`, `app/(app)/channels/page.tsx:63`
and `:79`, `app/(app)/channels/[platform]/page.tsx:47`,
`app/(marketing)/pricing/copy.ts:116`, plus `FIRST_RUN_CHANNELS`
(`onboarding.ts:351`), `CHANNEL_COPY` (`:326`), `adaptTargets`'s inline list
(`adapt.ts:172`), `FILTERABLE_NODES` (`rhythms.ts:574`), and the platform half
of `NODE_LABEL` (`rhythms.ts:550`).

Leave alone, deliberately:

- **`CHANNELS_FOR_SHAPE`** (`riffs.ts:116`) and its derivatives — editorial,
  names platforms no provider will exist for. Add one unit test instead:
  every `ConnectableChannel` appears in at least one shape (the failure
  `app/(app)/riffs/actions.ts:528` describes in prose).
- **Analytics** — X-only by scope; there is no second implementation to
  generalise over. `getNumbers` keeps reading `SOURCES` directly.
- **Corpus ingest** — X-only by design; LinkedIn's path is a file upload, not
  a metered poll. Lift only the flag: `onboarding.ts:548` hardcodes
  `c.id === "x"`; that becomes `readsOwnCorpus: boolean` on the provider.
- **`platform-mark.tsx` `PATHS`**, the `rhythms.ts` `Node` union,
  `publish-run.ts`, and the `/api/connect/[channel]` routes (already
  channel-generic — the proof the registry is achievable).
- **The `usage_event.model` discriminator.** A third channel is a fourth
  label, not a new query. Keep deferring the `kind` column.

### Step order — no behavior change, X and LinkedIn as the proving providers

Each step lands alone and is green before the next. The third channel is the
reward, not part of the work.

1. **The registry file, unused.** Move only the `auth` block out of the
   switch. Proof: `scripts/verify-channels.ts` unchanged;
   `scripts/probe-channels.ts` prints identical resolved configs.
2. **`fetchProfile`, `probeLiveness`, `revoke`.** Removes three of the five
   silent-wrong branches. Proof: `verify-channels.ts` and
   `verify-channel-maintenance.ts` (its injected `probe` pins the 401→revoked
   and 5xx→unreachable readings), then one live probe per channel with
   `probe-channels.ts` and `inspect-channels.ts` (reads only).
3. **The publish adapter and the classifier.** Splitting `classify` stops X's
   duplicate-403 rule being applied to LinkedIn — a latent bug fix; state it
   as one. Map `Refusal` onto `PublishFailure` at the boundary so no message
   string changes. Proof: `vitest run lib/publish.test.ts`, then
   `verify-publish.ts` (never touches the network) and
   `verify-publish-run.ts`. Do not settle `/rest/posts` vs `/v2/ugcPosts` in
   the same commit.
4. **Cost, and `maxLength` as a function.** Delete both `if (channel === "x")`
   cost guards. `ChannelSettings.tier` is null for every account today, so
   every provider returns its current constant and no number moves. Proof:
   `post-length`, `drafting`, `adapt`, `riffs` unit suites, then
   `verify-publish.ts`, `verify-draft-variety.ts`, `verify-adapt-e2e.ts`.
5. **Collapse the label tables and make the verify scripts table-driven.**
   Rewrite `verify-channels.ts` and `verify-publish.ts` to loop over
   `PROVIDERS`. **This is the real proof** — after it, a fourth channel is
   covered by the suite with no new test written.
6. **The third channel — separate PR.** Migration first, then one provider
   file, one `CHANNELS_FOR_SHAPE` entry, one platform mark.

**Decide before step 1:** ship `maxLength(settings)` with settings always
`{ tier: null }` and no storage (honest, costs one argument), or add
`channel_connection.tier` in step 4's migration. Do not build a settings
surface for a case no user has.

**STOP if** any step needs an edit outside the files named in its proof list,
or if a verify script's PASS lines change content rather than only count.

## Part 2 — Corrections owed on the two live channels (not gated)

Verified against official docs 2026-08-19:

- **X's ceiling is account-tier-dependent and Quincy hardcodes 280.**
  Premium accounts post up to 25,000 characters through the same
  `POST /2/tweets` — no separate field, and the create-post schema declares
  no maxLength. The tier is readable:
  `GET /2/users/me?user.fields=subscription_type,verified_type` returns
  `Basic | Premium | PremiumPlus | None`. Read it at connect time and refresh
  it on the daily sweep (one extra field on an existing call). And **fold
  becomes 280, not null**, for a Premium author — a hard product boundary:
  an account mentioned after the first 280 characters is not notified.
  `components/drafts/draft-parts.tsx` renders the literal "/ 280" in the
  gutter; the denominator is UI copy, not only a rules-table value.
  ~150 lines, ~2 days, includes a live send at 300 and 5,000 characters.
  UNCERTAIN, needs an empirical probe: what X returns when a free account
  posts >280, and whether t.co's flat 23 applies inside the 25,000 budget.
- **X 429 is now ambiguous**: "Rate limit OR usage cap exceeded" — back off
  versus out of credits need different handling, and no header distinguishes
  them. Note it in the classifier when Part 1 step 3 runs.
- **`LINKEDIN_API_VERSION` is a dated liability.** Versions sunset on a
  monthly-release / one-year-support cadence; 202508 was sunset 2026-08-17.
  Quincy pins 202607 — safe until roughly July 2027, then 426s. Put the
  annual bump obligation in a comment next to the constant, and special-case
  426 in the classifier.
- **LinkedIn's 3,000-character limit is an inference.** It is stated only on
  the legacy UGC page; the versioned Post Schema declares no maximum. The
  runtime signal is `400 FIELD_LENGTH_TOO_LONG`. Keep 3,000, record it as
  inferred.
- **The `/rest/posts` → 403 → `/v2/ugcPosts` fallback is confirmed correct**
  by LinkedIn's own error table. A LinkedIn 500 can be an auth failure in
  disguise ("Access token downstream verification failures return a 500"), so
  do not retry LinkedIn 500s forever.
- **60-day LinkedIn reconnects are structural.** Programmatic refresh tokens
  are Marketing Developer Platform partners only. Not fixable by code.

Sources: docs.x.com (create-post, user-lookup-me, rate-limits,
response-codes-and-errors, changelog, oauth2 authorization-code),
learn.microsoft.com/linkedin (posts-api, post-api-schema, ugc-post-api,
versioning, error-handling, programmatic-refresh-tokens).

## Part 3 — The connector fact sheets

Ranked by fit. Effort is measured against the ~5,600-line two-channel
footprint, of which 60–70% is shared plumbing.

### Mastodon — the cheapest real channel. VERDICT: first candidate.

- **Auth:** OAuth2 authorization code **per instance** — there is no central
  host. Mandatory step 0: `POST https://{instance}/api/v1/apps`
  (unauthenticated, instant, returns `client_id`/`client_secret`). PKCE S256
  from 4.3.0. Token response has **no `expires_in` and no `refresh_token`**:
  "Tokens will not expire automatically." A real revoke endpoint exists
  (`POST /oauth/revoke`) — better than LinkedIn.
- **Publish:** `POST /api/v1/statuses` with `Idempotency-Key` (honoured for
  1 hour — a retry after that posts a duplicate). Response carries `id`
  (opaque string — never cast) and `url` (the permalink). Simplest publish
  path of any candidate.
- **Limits:** read at runtime from `GET /api/v2/instance` →
  `configuration.statuses.max_characters` (500 vanilla) and
  `characters_reserved_per_url` (23). Mentions cost only the local part
  (`@alice`, not `@alice@example.com`) — `measurePost` overcounts, erring
  safe. Counting unit is "characters", UNCERTAIN versus graphemes.
- **Errors:** 401 = disconnect, never refresh (nothing to refresh). **403 is
  four different verdicts** — only "outside the authorized scopes" warrants a
  reconnect; disabled/unconfirmed-email/pending-approval are account states a
  reconnect cannot fix. Branch on the error string. Dead instances are an
  ordinary outcome; `live: "unknown"` must never read as consent withdrawn.
- **Approval:** none. Domain-to-posting is one HTTP round trip plus consent.
- **Fit:** OAuth shape perfect; the **staticness** breaks —
  `authorizationUrl`, `tokenUrl`, `clientId`, `clientSecret` are
  per-connection values. Needs three encrypted columns on
  `channel_connection` (`instanceDomain`, `clientId`, `clientSecret`) and an
  instance-picker UI. **Riskiest design call:** where the per-instance
  `client_secret` lives between `beginConnect` and the callback — it does not
  belong in the handshake cookie. Decide first.
- **Effort:** ~550–750 lines, 3–4 days, no review wait. Scopes:
  `write:statuses read:accounts profile`.
- Sources: docs.joinmastodon.org — methods/{statuses,oauth,apps,instance,
  accounts}, api/{oauth-scopes,oauth-tokens,rate-limits,guidelines},
  entities/{Token,Status,Instance,Error}, user/posting.

### Threads — OAuth2-ish, one week of review per cycle. VERDICT: second candidate.

- **Auth:** OAuth2 code flow, but Meta's token lifecycle: the code exchange
  returns a **1-hour token with no `expires_in` and no refresh_token**. The
  callback must immediately chain `GET /access_token?grant_type=th_exchange_token`
  to get the 60-day token, and refresh is `GET /refresh_access_token` (token
  ≥24h old). `refreshable: boolean` is not expressive enough — needs a third
  refresh mode. Without the chained exchange, `parseTokens` stores
  `expiresAt: null` and hands out a dead token from day two.
- **Publish:** two-step — create container (`media_type=TEXT`) then
  `threads_publish`; permalink costs a third authenticated GET (it is not in
  the response and not constructible). A failed permalink read must not fail
  a post that already went out. One-step `auto_publish_text=true` exists;
  UNCERTAIN which id it returns — test before relying on it.
- **Limits:** 500 characters, and **emoji count as UTF-8 bytes** — a flag
  emoji is 1 grapheme and 8 bytes, so Quincy's grapheme counter passes posts
  the platform rejects. The exact emoji rule is not documented; needs an
  empirical probe. Max 5 unique URLs, counted literally.
- **Errors:** the verdict lives in the JSON body (`error.code` 190 = dead
  token, subcodes 458/460/463/467; 4/17/613 = rate-limited), **not the HTTP
  status** — Meta does not use 401 for a dead token. `probeLiveness` (401/403
  only) would never mark a revoked Threads account dead, so the reconnect
  mail would never send; `TokenError.isRevoked` never matches. Needs the
  body-parsing classifier from Part 1.
- **Approval:** Meta app with the Threads use case; dev testing via the
  Threads Tester role works day one for the owner's account. Everyone else
  waits on App Review: per-permission screencast (1080p+), privacy policy,
  Deauthorize + Data Deletion callback URLs (endpoints Quincy lacks), EU DPO
  contact. "Within a week" per cycle; budget two cycles. Record the review
  screencast from the real working flow, not a mock — the documented top
  rejection is a reviewer who cannot reproduce it.
- **Effort:** ~550–750 lines, 2–3 days to working-as-tester, 2–3 weeks to
  public. Scopes: `threads_basic threads_content_publish` — decide now
  whether replies are ever wanted; adding the scope later means a reconnect
  mail to every connected user.
- Sources: developers.facebook.com/docs/threads/* (get-started, long-lived-
  tokens, posts, reference/publishing, changelog, troubleshooting),
  /docs/graph-api/guides/error-handling, /docs/app-review.

### Bluesky — no approval at all, but a different protocol. VERDICT: the registry's stress test.

- **Auth:** OAuth 2.1 atproto profile, production. App passwords are
  officially for "single-purpose applications such as bots" — not a
  legitimate fallback for Quincy. What breaks everything static: **endpoints
  are discovered per account** (handle → DID → PDS → two `/.well-known`
  reads); **no client_secret** — the `client_id` IS a hosted JSON metadata
  URL, plus a JWKS route (two new public, environment-specific routes);
  PKCE + PAR mandatory; **DPoP mandatory** with a per-session ES256 key pair
  persisted encrypted per connection; **refresh tokens are single-use and
  rotate** — two concurrent refreshes permanently kill the connection, so a
  per-connection refresh lock is required. Post-callback `sub`/issuer
  verification is mandatory or a hostile server can authenticate arbitrary
  accounts.
- **Publish:** `POST {pds}/xrpc/com.atproto.repo.createRecord`, collection
  `app.bsky.feed.post`. **Links do not render without facets** — UTF-8 byte
  offsets, not JS string indices. Durable id is the `at://` URI; the
  `https://bsky.app/profile/{did}/post/{rkey}` permalink is an undocumented
  front-end convention (verified working 2026-08-19).
- **Limits:** 300 graphemes AND 3,000 UTF-8 bytes — the byte ceiling is
  unenforced by Quincy's grapheme-only check (emoji-dense text passes 300 and
  fails 3,000). URLs count literally.
- **Errors:** `use_dpop_nonce` on 400 _or_ 401 is not a failure — retry once
  with the new nonce, or Quincy disconnects healthy accounts every 5 minutes.
  403 = scope gap (a user can decline individual permissions — record the
  granted `scope` from the token response). The liveness sweep must probe the
  **refresh path**, not a read: revoked sessions keep serving reads up to 15
  minutes. The 3,000-req/5-min PDS limit is **per IP** — Vercel's shared
  egress pool hits it first at scale; route corpus reads through
  public.api.bsky.app (unauthenticated, cached).
- **Approval:** none. Deploy order rule: the metadata JSON requesting a new
  scope must be live before the code that requests it.
- **Fit:** does not fit `ChannelConfig`; forces the discriminated union
  (`protocol: "oauth2-static" | "atproto-oauth"`). Use
  `@atproto/oauth-client-node` — hand-rolling DPoP+PAR+private_key_jwt is
  where the schedule dies.
- **Effort:** ~600–900 lines with the SDK, 4–6 days, front-loaded in the
  connect flow. Shared fraction ~40%, not 65%.
- Sources: atproto.com/specs/{oauth,permission,xrpc,lexicon,at-uri-scheme},
  guides/{about-oauth,oauth-patterns,permission-requests},
  bsky.network/docs/{oauth-client,rate-limits,developer-guidelines,
  bluesky-api}, the app.bsky.feed.post and com.atproto.repo.createRecord
  lexicons.

### YouTube — VERDICT: not a channel. Optional read-only voice source.

No community-posts API exists (confirmed against the full 21-resource
reference and the changelog through 2026-07-07). The only pure-text write is
a comment — a reputational problem before a technical one. Every write scope
is "sensitive": verification takes up to 10 days with a recorded demo, and an
unverified project's refresh tokens **expire every 7 days**. Quota is per
project (10,000 units/day, writes cost 50 — 200 writes/day across all of
Quincy) and does not grow with users. 403 is overloaded across five meanings;
the current `probeLiveness` would mark every connection revoked on the first
quota breach. The honest option, if ever: `youtube.readonly` as a voice
source (~450–600 lines) — titles and descriptions into the corpus. Sources:
developers.google.com/youtube/v3 (reference, revision history, quota,
policies), Google OAuth verification docs.

### Instagram — VERDICT: do not build. 0 lines.

No text-only post type exists in any Instagram API: every publish call
requires a publicly hosted image or video (JPEG only, 8 MiB, aspect locked
4:5–1.91:1), which means asset storage, a public CDN, and a design surface
Quincy would build only to pass Meta's review screencast. Personal accounts
cannot connect at all. Three token hosts and a query-string secret break
`tokenAuth` on top. Sources: developers.facebook.com/docs/instagram-platform
(content-publishing, oauth, business-login).

### Substack — VERDICT: no publish API exists. Source, not channel.

Verified live 2026-08-19: Substack runs a real OAuth server, but dynamic
registration silently downscopes every client to `mcp:read offline_access`,
and requesting `notes.write` — advertised in `scopes_supported` — is rejected
with `invalid_scope`. Even `openid` is rejected. The official MCP connector
is read-only by its own documentation ("cannot publish posts, send Notes, or
modify your account") and gated to Bestseller publications. No webhooks, no
publish-by-email. The internal cookie-authenticated endpoints are a
terms-of-service risk **for the writer's own account** — never ship that.
What is honest instead: (a) `https://{publication}.substack.com/feed` as an
unauthenticated RSS voice source, ~250–400 lines; (b) draft handoff —
copy-to-clipboard plus a deep link into the Substack editor, marked "handed
off", ~150–250 lines. `docs/vision.md:163` says Substack matters; this is the
form it can take today. Sources: substack.com/.well-known/oauth-authorization-
server (live), substack.com/api-tos, support.substack.com (MCP connector,
publishing, import, RSS articles).

### Kit — VERDICT: a second product shape, not "one more channel". Defer.

Kit publishes email broadcasts, not posts: the body is HTML, a subject line
is required (Quincy has neither), there is no documented send-now, and
`subscriber_filter`'s default is undocumented — the failure mode is mailing a
creator's entire list. `public_url` (the only permalink) exists only if the
piece is web-published to their Creator Profile, a decision Quincy must not
make silently. Refresh tokens are single-use and rotate (the same lock Part 3
Bluesky needs); 401 conflates dead token with lapsed Kit plan, so the
reconnect mail can loop. App review is required with no published turnaround.
Scope strings are self-contradictory in Kit's own docs — send none and take
the default. If newsletter reach is ever wanted, the honest first version is
draft-only: create with `send_at: null`, link to the draft in Kit, human
presses send. ~250 lines. Full connector: ~650–950 lines, 4–6 days, plus
unbounded review wait. Sources: developers.kit.com/v4 (authentication, oauth
flows, broadcasts, response-codes, kit-app-store).

## The cross-cutting finding: three counting regimes

`measurePost` assumes one unit — graphemes. The candidates use three:

| platform | unit                                                            |
| -------- | --------------------------------------------------------------- |
| X        | characters, tier-dependent ceiling (280 / 25,000), t.co flat 23 |
| Threads  | 500, but emoji charged as UTF-8 bytes                           |
| Bluesky  | 300 graphemes AND 3,000 UTF-8 bytes, both enforced              |
| Mastodon | per-instance ceiling, mentions cost only the local part         |

`ChannelRules` needs a counting mode, not only a limit, when any of these
ships. The pre-send check is what stands between an approved draft and a
platform rejection — it is the one safety rail every sheet above found a hole
in.

## Execution order, when the gates open

1. Part 2 (live-channel corrections) — ungated, ~2 days.
2. Part 1 steps 1–5 (registry, no behavior change) — when the first invite
   converts.
3. The third channel by demand, defaulting to **Mastodon** (cheapest, no
   review) unless the paying user names Threads or Bluesky. Bluesky is the
   better forcing function for the auth union; Threads proves almost nothing
   about the abstraction but reaches more readers.
4. Substack RSS-in and draft handoff whenever a user who writes there shows
   up — they are small and independent of the registry.

**STOP conditions for the whole plan:** any step that requires widening a
scope list on a live channel (that is a reconnect mail to every connected
user — see `lib/channels.ts:81-91`); any publish path that can send without
the user pressing send (`docs/vision.md`: every rhythm drafts, you send);
any dependency on an endpoint marked UNCERTAIN above that has not first been
probed against a real account.
