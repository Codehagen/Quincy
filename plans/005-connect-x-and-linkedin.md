# Plan 005: Connect an X and a LinkedIn account

> **Executor instructions**: Read the whole plan before starting. Phase 0 is
> manual and blocks everything else — do not write code until both developer
> apps exist and their credentials are in `.env.local`. Run every verification
> step. If anything in "STOP conditions" occurs, stop and report.
>
> **Drift check (run first)**:
>
> ```bash
> grep -n "socialProviders\|genericOAuth\|accountLinking" lib/auth.ts
> grep -rn "channel_connection\|channelConnection" lib/
> ls app/api/connect 2>/dev/null
> ```
>
> Expected: `lib/auth.ts` configures only `google` under `socialProviders`, no
> `genericOAuth`, and `accountLinking.trustedProviders` is `["google"]`. No
> `channelConnection` table and no `app/api/connect`. If any of that already
> exists, someone has started this work — STOP.

## Status

- **Priority**: P1 — Quincy is "an AI agent that drafts, schedules and
  publishes". Without this it can do the first two.
- **Effort**: L (X: M · LinkedIn: M · shared plumbing: M)
- **Risk**: HIGH — this stores credentials that can post in a person's name.
- **Depends on**: nothing in code. Blocked on two external approvals (Phase 0).
- **Category**: feature
- **Planned at**: commit `f18f6eb`, 2026-08-03

### Progress

| Phase | State | Notes |
| --- | --- | --- |
| 0.1 X app | TODO | Blocked on a human at console.x.com. Buy credits + spending limit first. |
| 0.2 LinkedIn app | **TODO — blocks the first real connection** | Company page verification is the slow part. |
| 0.3 CMAPI application | TODO | Runs in parallel; nothing in code waits on it. |
| 0.4 Environment | DONE | `.env.example` documents all five vars. `.env.local` still needs the values. |
| 1 Schema | **DONE** | `channel_connection` applied via `scripts/apply-channels.ts`, verified live. |
| 2 OAuth plumbing | **DONE** | `lib/channels.ts`. PKCE for X, plain code flow for LinkedIn. |
| 3 Connect routes | **DONE** | `/api/connect/[channel]`, `/callback`, `/disconnect`. |
| 4 Publishing | **DONE (code) — one real post still owed** | `lib/publish.ts`. Tries `/rest/posts`, falls back to `/v2/ugcPosts` on 403 `ACCESS_DENIED`, and logs which one won. The first real post settles it; nobody has sent one yet. **Callers arrived in plans/010** — this shipped with none, so nothing could reach it. |
| 5 Daily cron | **DONE** | `lib/channels-maintenance.ts` + `/api/cron/channels`, 06:00 UTC. Verified end-to-end against the live grant: 404 unauthenticated, real `/v2/userinfo` heartbeat, nothing written. |
| 6 UI | **DONE** | Strip layout on `/channels`. The `needs_reauth` copy this cron produces is already written. |
| 7 Verification | **DONE (offline half)** | `scripts/verify-channels.ts` (20 assertions) + `scripts/verify-channel-maintenance.ts` (36) + `scripts/verify-publish.ts` (10). The by-hand revocation drill and the first real post still need a human. |

Naming note for the executor: the plan drafted this as `platform`; the code
ships it as `channel`, matching `draft_version.channel` and `slot.channel`.
Publishing joins all three, and a second name for one concept would put a
translation step in the one query that must not be subtly wrong.
- **Revised**: 2026-08-03 — Phase 6 rewritten. `/channels` was rebuilt as an
  index plus a `[platform]` detail route before this plan started, so the phase
  now describes filling in the state column that surface left empty rather than
  adding a header above a tab. Phases 0–5 and 7 are unchanged.
- **Revised**: 2026-08-04 — **the LinkedIn metrics claim was wrong and is
  corrected.** The first draft said Quincy could not read LinkedIn engagement,
  having found `r_member_social` closed. It missed `r_member_postAnalytics`,
  a different permission, open via the Community Management API since API
  version 202506. LinkedIn engagement *is* readable behind a vetting process.
  Changed: Part 1's LinkedIn access section (now two routes), its posting and
  metrics subsections, new Phase 0.3 for the CMAPI application, the
  `LINKEDIN_API_VERSION` floor, and open question 1. Phases 1–7 are otherwise
  unchanged — the architecture in Part 2 does not move, because a second
  LinkedIn scope is still one row in `channel_connection`.
- **Revised**: 2026-08-04 — Phase 5 moved from the weekly brain heartbeat to
  its own daily cron, and the "dedicated cron" entry under Considered and
  rejected is reversed. Expiry tolerated a weekly sweep; silent revocation does
  not. Phase 7 gains the revocation drill.
- **Revised**: 2026-08-04 — **Phase 5 shipped.** Three decisions the plan left
  open, settled in code:
  1. **A rejected token is only revocation when we believed it was still
     valid.** `probeLiveness` returns `live: "unknown"` for anything that is
     not a 401 or 403, so a 429 or a LinkedIn outage writes nothing. The plan
     said "a call that 401s tells you the grant is gone"; that is true only
     against a token whose recorded expiry is still in the future, and without
     the distinction one bad morning upstream disconnects every user at once.
     Where there is no recorded expiry at all the row gets `needs_reauth`, not
     `revoked` — the action is the same and only one of them is a claim about
     intent.
  2. **No email on revocation.** The plan specified a reconnect notice for
     expiry and said nothing either way about withdrawal. Someone who removed
     Quincy in Permitted Services said no on purpose; the UI carries it.
  3. **No entitlement gate**, unlike the brain heartbeat. That one skips
     non-payers because each run costs a model call. This costs one HTTP
     request, and what it protects — Quincy stops posting when consent is
     withdrawn — does not lapse with a subscription.

- **Revised**: 2026-08-04 — **Phase 4 shipped as code.** `lib/publish.ts`, one
  entry point, status rather than throw. Four things the plan did not settle:
  1. **The endpoint question answers itself at runtime.** Rather than a human
     trying `/rest/posts` by hand and editing the adapter, it tries the
     versioned endpoint and falls back once on the specific 403
     `ACCESS_DENIED`, logging which one worked. A 403 creates nothing, so the
     fallback cannot double-post. Delete the loser once the answer is in.
  2. **Length is checked before the token is fetched.** X bills for requests it
     rejects, so a 281-character post caught locally costs nothing and the same
     post caught by X costs $0.015 to be told no. `measurePost` counts
     graphemes and charges X's flat 23 per link, so emoji and URLs are counted
     the way X counts them — `text.length` would reject posts that were fine.
  3. **The meter runs on failure, but only where X did the work.** A 400 it
     read and refused is billable; a 401 fails at the auth layer and a 429 is
     the gate itself. Billing those would inflate `/credits` with requests that
     cost nothing, and an untrustworthy number is worse than no number.
     Recorded through `usage_event` with `model: "x:post"` — no migration, the
     token columns default to 0. A third kind of non-model cost is the point to
     add a `kind` discriminator rather than stretch that column again.
  4. **A transport failure returns rather than throws.** Both adapters read
     status codes, so neither throws on a refusal — but a DNS failure or
     dropped socket throws out of `fetch`, and this function promises a value.
     Same try/catch reasoning as `lib/mail.ts`.

  Still owed: one real post, which is the measurement in step 4 above and needs
  a decision about where it goes. `scripts/verify-publish.ts` covers the
  guards offline in 10 assertions; the network paths are deliberately not
  covered, because covering them means posting.

  Also fixed in passing: `scripts/verify-channels.ts` selected its account with
  `select().from(user).limit(1)`, which has no ORDER BY and so returns whatever
  Postgres feels like — then deletes every channel connection that account
  owns, twice. On the run where that landed on the real account it would have
  destroyed a live LinkedIn grant recoverable only by going through consent
  again. Now guarded to `@quincy.test` like `scripts/dev-account.ts`, and
  `runChannelMaintenance` takes an optional `userId` so a verification sweep
  cannot probe rows it did not create.

---

## Part 1 — What the platforms actually allow (research)

This is the part that decides the design, so it comes first. Both platforms
changed materially in the last 18 months and most tutorials online are stale.

### X

**Access and money.** X killed the free tier for new developers on 6 February
2026 and moved everyone new to pay-per-usage credits. The published rates:

| Operation | Price |
| --- | --- |
| Post: Create | **$0.015** per request |
| Post: Create **containing a URL** | **$0.200** per request |
| Posts: Read | $0.005 per resource |
| User: Read | $0.010 per resource |

Pay-per-usage is capped at 2M post reads per billing cycle; above that is
Enterprise (reported entry around $42k/mo). Credits are bought upfront in the
Developer Console and requests are blocked at zero balance.

Two consequences Quincy has to design around, not discover later:

1. **A post with a link costs 13× a post without one.** That is the single
   biggest unit-cost lever in the product. It should be visible in `/credits`
   and it should influence what Quincy drafts.
2. **Reading metrics is metered per post.** The `/numbers` surface cannot poll.
   Polling 100 posts hourly is `100 × 24 × 30 × $0.005 = $360/month per user`.
   Metrics must be a low-frequency batch job (see Phase 6 note), not a
   dashboard refresh.

**Auth.** OAuth 2.0 Authorization Code **with PKCE is mandatory**.

- Authorize: `https://x.com/i/oauth2/authorize`
- Token: `https://api.x.com/2/oauth2/token`
- Revoke: `https://api.x.com/2/oauth2/revoke`
- Scopes needed: `tweet.read tweet.write users.read offline.access`
  (add `media.write` when image posting lands)
- App type must be **Web App, Automated App or Bot** → confidential client, so
  the token request uses HTTP Basic with `client_id:client_secret`.
- **Access token lives 2 hours.** `offline.access` is what yields a refresh
  token; without it every post would need a fresh consent screen.

**Posting.** `POST https://api.x.com/2/tweets`, body `{ "text": "..." }`,
`Authorization: Bearer <user access token>`. Quote-posting is Enterprise-only —
irrelevant for now, but it means "quote this" is not a feature Quincy can offer.

**Identity.** `GET https://api.x.com/2/users/me?user.fields=profile_image_url`
returns `{ data: { id, name, username, profile_image_url } }`. **No email.**
That fact drives the architecture decision below.

### LinkedIn

**Access. There are two routes, and which one you are on decides whether
`/numbers` can exist for LinkedIn at all.**

| Product | Grants | How to get it |
| --- | --- | --- |
| Sign In with LinkedIn using OpenID Connect | `openid` `profile` `email` | Self-serve, instant |
| Share on LinkedIn | `w_member_social` | Self-serve, instant |
| Community Management API | `w_member_social`, `r_member_postAnalytics` (202506+), `r_member_profileAnalytics` (202504+), plus the whole `*_organization_social` family | Vetted — two tiers, see below |

`w_member_social` is exactly "post, comment and like on behalf of the
authenticated member", and **both routes grant it**. So publishing is available
on day one either way. The routes differ in what else comes with them.

**Route A — self-serve.** Sign In with LinkedIn + Share on LinkedIn. Nothing to
apply for, no vetting, working in an afternoon. Publishing only.

**Route B — Community Management API.** Vetted, and the thing it unlocks is
reading. Two tiers:

- **Development tier** — approved from a form. Requirements: an approved use
  case, a *verified business email* (personal addresses fail vetting), a
  verified legal organization with website and domain, and the app verified by
  a LinkedIn Page belonging to that same organization. Available "to registered
  legal organizations for commercial use cases only".
  **Caps: 500 API calls per app per 24h, and 100 per member per 24h.** No
  `BATCH_GET`. Time-boxed to 12 months.
- **Standard tier** — full access, no caps. Requires a privacy policy,
  compliance with LinkedIn's data-storage requirements, and **a screen
  recording demonstrating the working app**: the OAuth consent flow, a user
  posting to their profile through your app, and how engagement is displayed.

Two consequences for sequencing:

1. **Standard tier requires a working app to film.** You cannot apply your way
   to the finished product. Build on Route A (or Dev tier), then film it.
2. **Rejection is expensive.** "If your application is rejected… create a new
   app and submit a new access request. You won't be able to re-apply with your
   existing app." Read the restricted-use-cases page before submitting.

**Verify in the portal before Phase 0 (may be stale):** the migration FAQ says
"only request Community Management API Development Tier access with a **new**
developer application that doesn't have access to any other API product". If
that still holds, CMAPI cannot be added to the same app that carries Share on
LinkedIn — which means a different `client_id`, which means every connected
user re-consents. That is survivable but it must be a decision, not a surprise.

**The thing that will bite:**

**No refresh tokens.** Access tokens last **60 days**
(`expires_in: 5184000`). Programmatic refresh tokens are "available for a
limited set of partners" — not self-serve. So a LinkedIn connection **expires
every 60 days and needs the human back**. The saving grace: if the member is
still logged in to linkedin.com and the token has not yet expired, re-running
the authorization flow silently bypasses the consent screen and returns a fresh
token. So a re-auth at ~day 50 is a redirect the user barely notices — but it
must be *triggered*, and it must be triggered *before* expiry. This is a
scheduled job, not an error handler.

**Auth.** Plain OAuth 2.0 authorization code — **no PKCE** (LinkedIn does not
support it here; the client secret is the credential).

- Authorize: `https://www.linkedin.com/oauth/v2/authorization`
- Token: `https://www.linkedin.com/oauth/v2/accessToken` (form-encoded, secret
  in the body)
- Discovery: `https://www.linkedin.com/oauth/.well-known/openid-configuration`
- Authorization codes live 30 minutes.
- Changing the requested scopes invalidates existing grants — users must
  re-consent. So settle the scope list before onboarding anyone real.

**Identity.** `GET https://api.linkedin.com/v2/userinfo` returns
`{ sub, name, given_name, family_name, picture, email?, email_verified? }`.
The author URN for posting is `urn:li:person:{sub}`. Note `email` is
documented as **optional and may be absent** — do not depend on it.

**Posting.** Two endpoints, and the documentation genuinely contradicts itself:

- `POST https://api.linkedin.com/rest/posts` — current. Headers
  `LinkedIn-Version: YYYYMM` and `X-Restli-Protocol-Version: 2.0.0`. Body:
  `{ author, commentary, visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false }`.
  The Posts API permission table lists `w_member_social` as accepted.
- `POST https://api.linkedin.com/v2/ugcPosts` — what the *Share on LinkedIn*
  self-serve docs actually document, in a page that carries no deprecation
  banner.

The contradiction: the June 2023 changelog says "we sunset unversioned APIs and
legacy Content APIs Shares API, UGC API on June 30, 2023" — and `/v2/ugcPosts`
is unversioned. Yet the consumer Share-on-LinkedIn page still presents it as
the way to post, unchanged. One of those two pages is stale and there is no way
to tell which from the outside.

**So Phase 4 step 4 is a measurement, and the order matters**: try
`/rest/posts` first, because it is the one with a future. If it 403s with
`ACCESS_DENIED` on a Route A token, the versioned endpoint is gated behind
Community Management and `ugcPosts` is what Route A actually has. Record the
answer in a comment; the next person will ask.

**Metrics — possible, but only on Route B.** This is the correction to an
earlier draft of this plan, which said LinkedIn engagement was unreadable. It
confused two permissions:

- `r_member_social` — genuinely closed. Reads a member's posts, comments and
  likes. Not accepting requests.
- **`r_member_postAnalytics`** — open via Community Management API, from API
  version **202506** onward. This is the one Quincy wants.

`GET https://api.linkedin.com/rest/memberCreatorPostAnalytics` with `q=entity`
for a single post or `q=me` aggregated across the member, `aggregation=DAILY`
or `TOTAL`, optional `dateRange`. Metrics available from 202604:
`IMPRESSION`, `MEMBERS_REACHED`, `RESHARE`, `REACTION`, `COMMENT`,
`POST_SAVE`, `POST_SEND`, `LINK_CLICKS`, `PREMIUM_CTA_CLICKS`,
`FOLLOWER_GAINED_FROM_CONTENT`, `PROFILE_VIEW_FROM_CONTENT`.

That last pair is more than X gives you, and it is exactly what `/numbers`
promises — "read backwards into Riffs, so the next round starts from what
performed". `r_member_profileAnalytics` (202504+) adds profile views, followers
and search appearances on top.

Two caveats. The docs say plainly that this data is "best-effort accurate and
shouldn't be used for billing purposes", and that `RESHARE`, `REACTION` and
`COMMENT` under `q=me` "are not consistent with UI at the moment" — so
`/numbers` should not present these as exact. And one metric costs one call
against the Dev tier's 100-per-member-per-day cap, so an eleven-metric sweep of
a post is eleven calls. On Dev tier that is nine posts a day.

**Rate limits.** Route A: 150 requests/day **per member**, 100,000/day per app.
Route B Dev tier: 100/member/day and 500/app/day — *tighter than self-serve*,
which is easy to miss. Route B Standard tier: unrestricted.

### Sources

- [X API pricing](https://docs.x.com/x-api/getting-started/pricing) ·
  [X OAuth 2.0 user access token](https://docs.x.com/resources/fundamentals/authentication/oauth-2-0/user-access-token) ·
  [X create a post](https://docs.x.com/x-api/posts/creation-of-a-post)
- [LinkedIn 3-legged OAuth](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow) ·
  [Share on LinkedIn](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin) ·
  [Sign In with LinkedIn (OIDC)](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2) ·
  [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api)
- [Increasing Access — the permission/product matrix](https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access) ·
  [Community Management App Review — vetting requirements](https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review) ·
  [Member Post Statistics](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/members/post-statistics) ·
  [CMAPI migration guide — tier caps and the new-app FAQ](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-api-migration-guide)

The LinkedIn half was re-verified on 2026-08-04 against the `li-lms-2026-07`
docs through the Microsoft Learn MCP server, which is why the metrics finding
above corrects the first draft. The X half is unchanged and still rests on
`docs.x.com`, which that server does not cover.

---

## Part 2 — The architecture decision

**A publishing connection is not a login identity. It gets its own table and
its own routes.**

The tempting shortcut is better-auth's `genericOAuth` plugin with
`authClient.oauth2.link()`. It is already in `node_modules` (1.6.25), it does
PKCE and state for free, and `account.encryptOAuthTokens` is already `true`.
It was rejected for four reasons, three of which are hard blocks:

1. **X does not return an email, and the link path requires one.**
   `node_modules/better-auth/dist/plugins/generic-oauth/routes.mjs:214` bails
   with `email_is_missing` when `getUserInfo` returns no email. Working around
   it means fabricating `${username}@x.invalid`.
2. **The link path then compares that email to the session's.** Same file,
   line 238: unless `account.accountLinking.allowDifferentEmails === true`,
   a mismatch is `email_doesn't_match`. So the workaround forces a **global**
   loosening of account linking — for LinkedIn too, whose email will routinely
   differ from the Quincy account's. That is a real security-posture change to
   `lib/auth.ts` made for a reason that has nothing to do with authentication.
3. **Every configured provider also becomes a sign-in method.**
   `/sign-in/oauth2` accepts any `providerId` in the config. "Sign in with X"
   would exist as a side effect of wanting to post to X.
4. **The state a channel needs has nowhere to live.** Person URN, handle,
   avatar, `needs_reauth`, `lastPublishedAt`, per-connection scopes. The
   `account` table has none of it, and it is generated output — `pnpm
   auth:generate` overwrites `lib/schema.ts` wholesale, which is exactly why
   `lib/schema-app.ts` exists.

The cost of going custom is that we implement PKCE and state ourselves. That
is roughly 60 lines and it is the code that must be right, so it gets a verify
script (Phase 7). Token encryption is *not* reimplemented — `better-auth/crypto`
exports `symmetricEncrypt` / `symmetricDecrypt`, keyed off `BETTER_AUTH_SECRET`,
which is the same primitive `encryptOAuthTokens` uses.

---

## Part 3 — Step by step

### Phase 0 — Platform setup (manual, blocks everything)

Nothing here is code. Both can be done in an afternoon; the LinkedIn page
verification needs a second person if you do not admin the page yourself.

**0.1 — X app**

1. Go to `console.x.com`, sign in with the X account that will own the app.
2. **Buy credits and set a hard spending limit before the first request.**
   Pay-per-usage with a bug in a retry loop is a real bill.
3. Create a Project, then an App inside it.
4. App settings → **User authentication settings** → Set up:
   - App permissions: **Read and write**
   - Type of App: **Web App, Automated App or Bot** (confidential client)
   - Callback URI: `http://localhost:3000/api/connect/x/callback` **and**
     `https://<prod-domain>/api/connect/x/callback`
   - Website URL: your marketing URL
5. Copy the **OAuth 2.0 Client ID and Client Secret** (not the API key/secret —
   those are OAuth 1.0a and are not used here).

**0.2 — LinkedIn app**

1. Go to `linkedin.com/developers/apps` → Create app.
2. It **must** be attached to a LinkedIn **Company Page**. If you do not have
   one, create it first — an app cannot exist without it.
3. Verify the app: LinkedIn generates a verification URL that an **admin of
   that company page** must open and approve. Until this is done, no products
   can be added. This is the step that takes wall-clock time.
4. Products tab → request **Sign In with LinkedIn using OpenID Connect** and
   **Share on LinkedIn**. Both grant instantly.
5. Auth tab → Redirect URLs: `http://localhost:3000/api/connect/linkedin/callback`
   and the production one. Must be absolute, no fragment; query params are
   ignored.
6. Confirm the Auth tab now lists `openid`, `profile`, `email`,
   `w_member_social`. Copy Client ID and Client Secret.

That is Route A, and it is enough to ship publishing. Step 0.3 is what unlocks
`/numbers`, and it is slow — start it now and let it run in the background
while Phases 1–7 proceed.

**0.3 — LinkedIn Community Management API (start early, do not block on it)**

Only worth doing if `/numbers` should show LinkedIn engagement. If the answer
to open question 1 is "X-only", skip this entirely.

1. **First, check the portal against the stale-FAQ risk flagged in Part 1**: on
   the Products tab of the app from 0.2, is "Community Management API" offered,
   or greyed out? If greyed out, the FAQ still holds and CMAPI needs its own
   fresh app — which means a second `client_id`, and every already-connected
   user re-consenting when you migrate. Decide that before applying, not after.
2. Read [restricted use cases](https://learn.microsoft.com/en-us/linkedin/marketing/restricted-use-cases)
   before submitting. A rejection burns the app permanently — you cannot
   re-apply with it.
3. Have ready: business email on your own domain (a Gmail address fails
   vetting), the legal organization name and registered address, website, and a
   published privacy policy.
4. Apply for **Development tier** under Products. On approval you get
   `r_member_postAnalytics` — but capped at 100 calls/member/day and 500/app/day,
   which is pilot-scale, not launch-scale.
5. **Standard tier comes later, after Phase 6.** It needs a screen recording of
   the finished app: the OAuth consent flow, a user posting to their profile
   through Quincy, and how engagement is displayed back to them. That recording
   is a deliverable of this plan, not a prerequisite for it.

**0.4 — Environment**

Add to `.env.example` (empty) and `.env.local` (filled), following the existing
comment style in that file:

```dotenv
# X (Twitter) OAuth 2.0 from console.x.com. Confidential client — the app type
# must be "Web App, Automated App or Bot" or the token exchange rejects the
# Basic auth header. Both must be set or the X connect button is hidden.
# Callback: {BETTER_AUTH_URL}/api/connect/x/callback
X_CLIENT_ID=""
X_CLIENT_SECRET=""

# LinkedIn OAuth 2.0 from linkedin.com/developers. Needs the "Sign In with
# LinkedIn using OpenID Connect" and "Share on LinkedIn" products on the app.
# No refresh tokens on self-serve, so the token expires in 60 days and the
# reconnect job in lib/channels.ts is what keeps a connection alive.
# Callback: {BETTER_AUTH_URL}/api/connect/linkedin/callback
LINKEDIN_CLIENT_ID=""
LINKEDIN_CLIENT_SECRET=""

# LinkedIn versioned APIs require this header, format YYYYMM. Bump it
# deliberately — LinkedIn sunsets each monthly version about a year out and a
# stale value 400s. The floor is 202506: member post analytics does not exist
# below it. 202604 is the floor for LINK_CLICKS and the follower/profile-view
# metrics, and 202605 flattened metricType from a union to a plain string, so
# the analytics parser must not be written against an older sample response.
LINKEDIN_API_VERSION="202607"
```

**Verify**: `grep -c CLIENT .env.local` returns at least 6 (Google's two are
already there).

**STOP** if the LinkedIn Auth tab does not list `w_member_social` after adding
Share on LinkedIn. Everything downstream assumes it.

---

### Phase 1 — Schema

Add to `lib/schema-app.ts` (**not** `lib/schema.ts` — that file is generated
output and is overwritten by `pnpm auth:generate`).

```ts
export const CHANNEL_PLATFORMS = ["x", "linkedin"] as const
export type ChannelPlatform = (typeof CHANNEL_PLATFORMS)[number]

/**
 * A place Quincy may post as you.
 *
 * Deliberately not better-auth's `account` table. That table answers "who is
 * this person"; this one answers "where may we speak for them". They have
 * different lifecycles — disconnecting a channel must not remove a way to sign
 * in — and X returns no email at all, which better-auth's link path requires.
 * See plans/005 for the full reasoning.
 */
export const channelConnection = pgTable(
  "channel_connection",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    platform: text("platform", { enum: CHANNEL_PLATFORMS }).notNull(),

    // The platform's own id. X: users/me `data.id`. LinkedIn: userinfo `sub`,
    // which is also what the author URN is built from.
    externalId: text("external_id").notNull(),
    // For display, and for the "posting as @handle" line above a draft. A
    // connection you cannot identify is one you cannot safely publish through.
    handle: text("handle"),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),

    // Encrypted with symmetricEncrypt from better-auth/crypto, keyed off
    // BETTER_AUTH_SECRET — the same primitive account.encryptOAuthTokens uses.
    // Never selected into anything that reaches a client component.
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    // Space-separated, as the provider returned it. Stored rather than
    // assumed: a connection made before a scope was added still exists, and
    // publishing must be able to tell.
    scope: text("scope"),

    // "active" | "needs_reauth" | "revoked". The whole point of the table.
    // LinkedIn has no refresh token, so needs_reauth is the normal end of a
    // 60-day life, not an error.
    status: text("status", { enum: ["active", "needs_reauth", "revoked"] })
      .notNull()
      .default("active"),
    lastPublishedAt: timestamp("last_published_at"),
    lastErrorAt: timestamp("last_error_at"),
    lastError: text("last_error"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // One connection per platform account per user. Reconnecting updates the
    // row rather than growing a pile of dead tokens — and the tenant is in the
    // key, for the reason brain_page_user_slug_key exists.
    unique("channel_connection_user_platform_external_key").on(
      table.userId,
      table.platform,
      table.externalId
    ),
    index("channel_connection_user_idx").on(table.userId, table.platform),
  ]
)
```

Add the `relations` block alongside the others, then:

```bash
pnpm db:push
pnpm typecheck
```

**Verify**: `pnpm db:studio` shows `channel_connection` with the unique
constraint.

**Note on multiple handles.** The unique key is `(user, platform, externalId)`,
so two X accounts on one Quincy user is representable from day one. The UI in
Phase 6 renders one per platform; nothing in the schema forbids the second.

---

### Phase 2 — The OAuth plumbing (`lib/channels.ts`)

One file, both platforms, because the difference between them is four values
and a boolean.

```ts
type PlatformConfig = {
  authorizationUrl: string
  tokenUrl: string
  scopes: string[]
  pkce: boolean
  // X wants Basic auth on the token request; LinkedIn wants the secret in the
  // form body. Getting this backwards is a 401 with an unhelpful message.
  tokenAuth: "basic" | "body"
  clientId?: string
  clientSecret?: string
}
```

Required exports:

- `isPlatformEnabled(platform)` — both env vars present. Same pattern as
  `isGoogleEnabled` in `lib/auth.ts`, for the same reason: a connect button
  that fails on click looks broken rather than unfinished.
- `buildAuthorizationUrl(platform, { state, codeChallenge })`
- `exchangeCode(platform, { code, codeVerifier })` → tokens
- `getUserProfile(platform, accessToken)` → `{ externalId, handle, displayName, avatarUrl }`
  - X: `GET /2/users/me?user.fields=profile_image_url`
  - LinkedIn: `GET /v2/userinfo` → `sub`, `name`, `picture`; there is no handle
- `saveConnection(...)` — encrypt, upsert on the unique key, reset `status` to
  `active` and clear `lastError`
- `getConnection(userId, platform)` — decrypt, refresh if needed (below)
- `disconnect(userId, platform)` — revoke upstream where possible, then delete

**PKCE and state.** Both live in one httpOnly cookie for the duration of the
round trip:

```ts
// generateRandomString from better-auth/crypto; the S256 challenge is
// base64url(sha256(verifier)) via Web Crypto.
// Cookie: httpOnly, secure in production, sameSite "lax" (the callback is a
// top-level GET navigation from the provider, which lax permits), path
// "/api/connect", maxAge 600.
```

The callback validates three things before it trusts anything: the cookie's
`state` equals the query's `state`, the cookie's `platform` equals the route's,
and there is a live session whose user id the connection will be written to.
There is no "which user is this" question to answer from the callback payload —
the session answers it.

**Token refresh** (`getConnection` does this transparently):

- **X**: if `accessTokenExpiresAt` is within 5 minutes, POST
  `grant_type=refresh_token` to the token endpoint with Basic auth. X returns a
  **new refresh token** — persist it, or the connection dies on the next
  refresh. A `400 invalid_grant` means the user revoked access: set
  `status = "revoked"` and stop.
- **LinkedIn**: there is nothing to refresh. If `accessTokenExpiresAt` is past,
  set `status = "needs_reauth"` and return null. Callers must handle null;
  publishing must never silently drop a post because a token aged out.

**STOP** if X's token response omits `refresh_token` — that means
`offline.access` was not granted, and every post would need a fresh consent.
Fix the scope list, do not work around it.

---

### Phase 3 — The connect routes

Four routes, thin. All of Quincy's OAuth judgment is in `lib/channels.ts`.

- `app/api/connect/[platform]/route.ts` (GET) — require session, require
  `isPlatformEnabled`, mint state + verifier, set cookie, 302 to the provider.
- `app/api/connect/[platform]/callback/route.ts` (GET) — validate state and
  cookie, exchange the code, fetch the profile, `saveConnection`, delete the
  cookie, 302 to `/channels?connected=<platform>`. On any failure, 302 to
  `/channels?error=<code>` — never render an error body at a provider's
  callback URL.
- `app/api/connect/[platform]/disconnect/route.ts` (POST) — session + platform,
  revoke, delete, revalidate.

`params` is a Promise in Next 16 — `const { platform } = await params`. Reject
any platform not in `CHANNEL_PLATFORMS` with a 404 before doing anything else.

Add a rate limit for the connect entry point. It is a session-authenticated
redirect, so the exposure is small, but it is a new unauthenticated-adjacent
surface and `lib/auth.ts` already establishes the convention.

---

### Phase 4 — Publishing (`lib/publish.ts`)

One function: `publish({ userId, platform, text })` →
`{ ok: true, url, externalId } | { ok: false, reason }`. Returning a status
rather than throwing follows `lib/mail.ts` — and the same warning applies: an
unread result is a swallowed exception. Every caller reports.

**X**: `POST https://api.x.com/2/tweets`, `{ text }`. 280 chars — validate
before spending $0.015 on a 400. Detect a URL in the text and record the
**$0.20** cost against `/credits`; that difference is too large to leave
invisible.

**LinkedIn**: `POST https://api.linkedin.com/rest/posts` with
`LinkedIn-Version: ${LINKEDIN_API_VERSION}` and
`X-Restli-Protocol-Version: 2.0.0`, author `urn:li:person:{externalId}`. The
post id comes back in the `x-restli-id` **response header**, not the body.
3000 chars for `commentary`.

**Step 4 is the measurement flagged in Part 1.** Publish one real post to a
throwaway LinkedIn account through `/rest/posts`. If it returns
`403 ACCESS_DENIED`, switch the adapter to `POST /v2/ugcPosts` with the
`specificContent` shape from the Share on LinkedIn docs. Record which one
worked and why in a comment — the next person will ask.

Error handling that matters:

- `401` → mark `needs_reauth`, surface a reconnect prompt, do not retry.
- `429` → LinkedIn's 150/day member cap or X's rate limit. Back off; do not
  burn credits retrying.
- X `403` with `duplicate content` → X refuses identical posts. Report it as
  what it is rather than as a generic failure.

---

### Phase 5 — Keeping connections alive

**This phase is what separates a demo from something you can put another
person's LinkedIn account into.** It is not polish, and it does not come after
onboarding.

LinkedIn publishes its own bar for this, in the Lead Sync integration
requirements. It is written for a different program, so it does not bind Route
A — but it is LinkedIn telling you what a competent integration looks like, and
it is worth meeting:

> "Your application should be able to detect whether or not an access token has
> expired (TTL 60 days) or has been invalidated/revoked. You should be using an
> API call **as a heartbeat to check for this every 24 hours** (proactively
> catch issues for your users)… Best practice → proactively notify the user
> that their token will be expiring in x number of days."

**A daily cron, not the weekly heartbeat.** The earlier draft of this plan
reused the Monday brain heartbeat. That is wrong, and expiry is not why —
60 days against a weekly sweep is fine. **Revocation** is why. Anyone can go to
linkedin.com → Me → Settings & Privacy → Data Privacy → **Permitted Services**
and remove Quincy, and nothing tells us. On a weekly cadence Quincy would keep
trying to publish as someone who withdrew consent, for up to seven days. That
is the one failure mode that is not merely broken but wrong.

Add a second entry to `vercel.json`:

```json
{ "path": "/api/cron/channels", "schedule": "0 6 * * *" }
```

Guard it with `CRON_SECRET` and the 404-not-401 pattern from
`app/api/cron/heartbeat/route.ts`. The logic goes in a new
`lib/channels-maintenance.ts` — not in `lib/heartbeat.ts`, which is about the
brain; mixing a token lifecycle into it makes both harder to read.

Each daily run, per connection:

- **LinkedIn, expiring within 10 days** → `status = "needs_reauth"`, and send
  one "reconnect LinkedIn" email through the existing Resend path. Once, not
  daily — record `lastError`/a sent-at marker so the reminder does not become
  its own mail-bomb.
- **LinkedIn, revoked** → a cheap authenticated call (`GET /v2/userinfo`) that
  401s tells you the grant is gone. Set `status = "revoked"`, stop attempting
  to publish, and surface reconnect in the UI. Do not silently retry.
- **X, refresh failed with `invalid_grant`** → same: `revoked`, stop.

The distinction between `needs_reauth` and `revoked` is not cosmetic. One is
"this expired on schedule, click to continue" and the other is "you took this
away from us" — and only the second must never be followed by another publish
attempt.

---

### Phase 6 — The UI

**Read this before touching `/channels` — the surface changed under this plan.**
It is no longer one tab strip above one editor. A design exploration
(`app/prototypes/channels`, four variants, picker at `/prototypes/channels`)
settled on a list, and the list already shipped. What is left for this phase is
filling in the column the list deliberately left empty.

#### What already exists (do not rebuild)

| File | What it does today |
| --- | --- |
| `app/(app)/channels/page.tsx` | Index. Two lists: channels with a `policy` page, then supported platforms with a **disabled** Connect button and one line saying why |
| `app/(app)/channels/[platform]/page.tsx` | One channel's strategy. Back link + `PolicyEditor`. Slug shape `strategy/<platform>` is unchanged |
| `components/channels/platform-mark.tsx` | Official brand marks (simple-icons paths) in `currentColor`, plus `hasPlatformMark()` for the fallback |
| `SUPPORTED_PLATFORMS` in the index | `x, linkedin, threads, bluesky, instagram, youtube, mastodon, substack, kit` — publishing destinations only |

The tab strip is gone. It disappeared entirely when you had one channel, and a
switcher that is invisible until you have two of something is not navigation.

#### What Phase 6 adds

**1. State into the configured row.** The row is
`tile · label · pillar split · cadence · Manage`. Connection state goes where
the cadence sits, with cadence dropping to the second line:

- **Connected** → display name and `@handle` (X only — LinkedIn's OIDC profile
  has no handle) under the label, replacing the pillar split; state word beside
  the cadence.
- **needs_reauth** → warning token on the row, Reconnect button in place of
  Manage. For LinkedIn this is the *expected* steady state every 60 days, so
  the copy must not read like a failure: "LinkedIn access expires every 60
  days. Reconnect to keep publishing." — not "Connection failed".
- **Connected but no policy page** → possible once connecting comes first.
  Row shows the account and a "Set up strategy" action instead of Manage.

**2. The second list becomes live.** Delete the `disabled` prop, the
`disabled:*` overrides and the "Not connectable yet" explanation; wire the
button to `GET /api/connect/<platform>`. Add the sentence this phase makes
true: "Quincy will be able to post as you. It will never post without your
approval." Keep the group heading and the two-list split — separating what is
set up from what is not is the whole reason this variant won.

**3. Disconnect** uses `<HoldToConfirm>`, not a dialog. Per `AGENTS.md`.

#### The brass question — resolved, do not relitigate

The exploration recommended brass for a publishing channel, on the grounds that
a channel that is posting *is* the live state. **That recommendation is
overruled by the rule already written here:** `--signal*` means "this ritual is
running", and a connected channel is not a running ritual. Connection state is
neutral, `needs_reauth` is the warning token, and the tile stays muted.

The current implementation already follows this — every tile on `/channels` is
`bg-muted` today, and the file header says why. Changing it would mean changing
what `--signal*` reserves, which is a decision about the whole design system
and does not belong inside a feature phase.

#### Motion

One animation, and only one: when a connect succeeds and the user returns from
OAuth, the platform's row moves from the second list to the first. That is a
genuine spatial-continuity question — where did it go — and it fires a handful
of times in a user's life, which is what earns it more than 200ms.

Phase 3 already redirects to `/channels?connected=<platform>` on success; that
param is the trigger, and nothing reads it today. `?error=<code>` from the same
redirect has no handler either — it needs a dismissible message on the index,
not a thrown error.

Everything else stays still. The list had a staggered entrance during the
exploration and it was cut: rows sitting in their resting position on page load
have nothing to arrive from, and the stagger delayed the content on every
navigation. Do not add it back.

#### Hit areas — already fixed app-wide, do not re-add per page

`Button` rendered at `h-8` (32px), under the 44px floor `AGENTS.md` sets, and
`/channels` carried a page-local workaround. Both are gone. The floor now lives
unlayered in `globals.css` beside the other three touch defaults: a 44px-tall
`::after` centred on the button, under `@media (pointer: coarse)`, height-
agnostic so one rule covers every size variant. `relative` sits in
`button.tsx` instead of `globals.css` — unlayered it would beat the `absolute`
on Dialog's and Sheet's close buttons, whereas through `cn` tailwind-merge
drops it when a caller passes `absolute`.

Measured after the change: 0 buttons under 44px and 0 overlapping hit areas on
`/channels`. The composer's addon buttons keep their own wider rule.

So any Connect or Reconnect control this phase adds already clears the floor.
Do not reintroduce a per-page pseudo-element.

---

### Phase 7 — Verification

Follow the `scripts/verify-*.ts` convention (run by hand with
`npx tsx --env-file=.env.local`, teardown deletes what it touched).

`scripts/verify-channels.ts` must assert, without any network:

1. A callback with a mismatched `state` is rejected.
2. A callback with no session is rejected.
3. A callback for a platform that does not match the cookie is rejected.
4. `symmetricEncrypt` round-trips — a token written and read back is equal, and
   the column value is **not** the plaintext.
5. An expired LinkedIn connection resolves to `needs_reauth`, and
   `getConnection` returns null rather than a dead token.
6. Reconnecting an already-connected account updates the row and does not
   create a second one.

Then, by hand and once, against real accounts: connect X → post → verify it
appears → disconnect → confirm the row is gone and the token is revoked
upstream. Same for LinkedIn. Record the LinkedIn endpoint result from Phase 4.

**The revocation drill — run this before onboarding anyone but yourself.** It
is LinkedIn's own suggested test, and it is the scenario real users will
actually produce:

1. Connect LinkedIn in Quincy. Confirm publishing works.
2. Go to linkedin.com → Me → Settings & Privacy → Data Privacy →
   **Permitted Services** → remove Quincy.
3. Without touching Quincy, run `/api/cron/channels` by hand.
4. **Assert**: the connection is now `revoked`, `/channels/linkedin` offers
   Reconnect rather than claiming to be connected, and a scheduled post does
   not attempt to publish.
5. Reconnect. Assert the same row is reused — not a duplicate — and that
   publishing resumes.

Step 4 is the one that matters. A connection that still says "Connected" after
the person removed you is the single worst state this feature can be in: it
tells someone Quincy can speak for them when it cannot, and it will keep trying.

---

## STOP conditions

- LinkedIn's Auth tab does not show `w_member_social` after adding Share on
  LinkedIn → the company page is unverified. Fix that first.
- X's token response has no `refresh_token` → `offline.access` missing.
- `/rest/posts` **and** `/v2/ugcPosts` both 403 → stop and report; the app is
  missing a product, and guessing at request shapes will not fix it.
- Any step requires setting `account.accountLinking.allowDifferentEmails` or
  adding a `genericOAuth` provider in `lib/auth.ts` → the design has drifted
  back to the rejected option. Stop and re-read Part 2.
- Any step wants to store a token unencrypted "for now" → no.

## Considered and rejected

- **better-auth `genericOAuth` + `oauth2.link`** — see Part 2. Three hard
  blocks, one of which is a global change to authentication behaviour made for
  a publishing feature.
- **A third-party posting API (Ayrshare, Postproxy, Blotato)** — removes the
  platform-approval work and the X credit account, but puts a vendor between
  Quincy and the user's identity, adds per-post margin on top of X's already
  metered pricing, and makes "Quincy posts as you" contingent on someone
  else's terms. Reconsider only if X's Enterprise gate ever blocks the direct
  path.
- **OAuth 1.0a for X** — still works and has no PKCE ceremony, but it is the
  legacy path, some v2 endpoints are OAuth 2.0 only, and the credentials it
  needs are different from the ones Phase 0 collects.
- **Storing tokens in the `account` table with a `providerId` of `x`** —
  `lib/schema.ts` is generated output. The first `pnpm auth:generate` would
  silently drop any hand-written column, and the loss would not surface until a
  query failed in production. Same reason `lib/schema-app.ts` exists.
- ~~**A dedicated cron for token maintenance**~~ — **reversed 2026-08-04.** The
  original reasoning only considered expiry, where a weekly sweep against a
  10-day window is genuinely fine. It missed revocation, which is instant and
  silent: a weekly cron means up to seven days of publishing as someone who
  withdrew consent. Phase 5 now adds a daily cron.
- **Blocking the whole plan on Community Management API approval** — Standard
  tier vetting requires a screen recording of a user posting through the app,
  so the app has to exist first. Applying early and building meanwhile is not
  impatience; it is the only order that works.

## Open questions for the product owner

1. ~~**Is LinkedIn engagement worth a vetting process?**~~ **DECIDED
   2026-08-04: Route A now, CMAPI applied for in parallel.** Publishing ships
   on self-serve permissions; `/numbers` gets LinkedIn when and if Standard
   tier lands. Two consequences the executor must honour:
   - **The scope list is now frozen at `openid profile email w_member_social`.**
     Adding `r_member_postAnalytics` later invalidates every existing grant and
     sends every connected user back through consent. That is accepted, not
     overlooked — the reconnect path built in Phase 5 is the same path, so the
     cost is one email and one click, not a migration.
   - **`/numbers` must not promise LinkedIn numbers yet.** Whatever that page
     says on launch has to be true on Route A alone.

   The original question, kept for context: it is readable —
   `r_member_postAnalytics`, eleven metrics including link clicks and followers
   gained — but only through the Community Management API, which wants a
   registered company, a business email, a privacy policy and a screen
   recording of the finished product. X metrics need no approval but cost
   $0.005 per post read. Three options: Route A only and `/numbers` is X-only;
   Route A now and apply for CMAPI in parallel so `/numbers` fills in later; or
   block on CMAPI and launch both together. **Recommend the middle one** —
   Standard tier requires filming a working app, so building first is not a
   compromise, it is the required order.
2. **Who pays for X credits?** A post with a link costs $0.20. At 3 posts a
   week with links that is ~$2.60/user/month before any reads. That is a
   pricing input, not an implementation detail.
3. **Does Quincy ever publish unattended?** Everything above supports it, but
   nothing above decides it. Stanley's positioning is "drafts, schedules, and
   checks back when posts land" — schedule-and-publish, with approval upstream.
   The `needs_reauth` copy and the heartbeat's email depend on this answer.
