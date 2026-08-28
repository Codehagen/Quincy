# Quincy over MCP

Quincy speaks the Model Context Protocol. An agent that is not the Studio chat
— one running in a terminal, an editor, another product — can read your riffs,
your drafts, your lineup and your numbers, and can put material in and ask for
a draft.

It cannot approve, schedule or publish. Not with any scope, not with any token,
not by accident. That is the same invariant the rest of the product holds —
[`docs/vision.md`](vision.md): **Quincy drafts, you send** — and it is stricter
here on purpose, because the thing holding the token is a program.

## The endpoint

```
https://hirequincy.com/api/mcp
```

One URL, streamable HTTP. There is no separate SSE endpoint; the transport was
removed in `mcp-handler` 2.0 and the handler answers from wherever it is
mounted.

Running locally, it is `http://localhost:3000/api/mcp`.

That URL is also the **protected resource identifier** (RFC 8707). Every access
token this server issues is audience-bound to it, and the route refuses a token
whose audience is anything else.

## What runs this

`@better-auth/mcp` 1.7, which is `@better-auth/oauth-provider` configured for
MCP, plus `@better-auth/cimd` for client discovery and the `jwt` plugin for the
signing keyring. It replaced the `mcp()` plugin that shipped inside
`better-auth` 1.6, which was deprecated in 1.7 and is removed in the release
after it.

Two things a reader of the old version of this page needs to know:

- **Every protocol path moved from `/mcp/*` to `/oauth2/*`.** A client that
  reads the discovery documents never notices; a client with a hardcoded
  `/api/auth/mcp/authorize` breaks.
- **An access token is a signed JWT now, not a row.** It carries its own
  scopes, subject and audience, and the route verifies it against
  `/api/auth/jwks`. Nothing looks it up, which is why nothing can revoke it —
  see "Removing an agent".

## Connecting a client

Quincy is an OAuth 2.1 authorization server, so a client that speaks OAuth
needs the URL above and nothing else. The flow, in order:

1. The client POSTs to `/api/mcp` with no token. It gets **401** and a
   `WWW-Authenticate` header naming the protected-resource document.
2. It fetches `/.well-known/oauth-protected-resource/api/mcp` (RFC 9728), which
   names the authorization server and the two scopes that apply to this
   resource, and then `/.well-known/oauth-authorization-server/api/auth`
   (RFC 8414), which names the endpoints and every scope the server issues.

   **Both well-known paths carry a suffix, and that is the spec rather than a
   quirk.** RFC 9728 appends the resource's own path (`/api/mcp`); RFC 8414 §3.1
   appends the issuer's path component, which here is `/api/auth` because that
   is `basePath`. Those two suffixed URLs are the ones the plugin serves and the
   ones the 401 challenge points at. The bare paths answer as well — several
   clients ask there first — but nothing in the plugin serves them, so each is
   an optional catch-all route in `app/.well-known/` that either hands the
   request to `auth.handler` or calls the plugin's exported metadata helper.

   Both documents are also served under `/api/auth` directly.
3. It **identifies itself.** There are two ways and no third — see "How a
   client is registered".
4. It opens `/api/auth/oauth2/authorize` in a browser. If you are not signed in
   you land on `/login`, and the authorization resumes the moment you are.
5. **You consent.** The browser lands on `/consent`, which names the client,
   the host the code will be sent back to, and what each requested scope buys
   in plain words. One button allows it; a text link denies it and sends the
   client `error=access_denied`. Nothing is minted until you press Allow.

   The screen is not skippable and nothing in this app forces it any more. The
   provider issues a code without a screen only when a stored `oauth_consent`
   row already covers every scope, claim and resource being asked for — which
   is the normal OAuth contract: you say yes once per client, and any request
   for more than you agreed to comes back to this page. The 1.6 plugin skipped
   the screen whenever `prompt` was not exactly `consent`, which is why
   `lib/auth.ts` used to force that value; that hook is gone.
6. It exchanges the code at `/api/auth/oauth2/token`.

**PKCE is required.** `code_challenge_methods_supported` advertises `S256`
alone; a request without a verifier is refused, and so is a `plain` challenge.
There is no client shape that opts out.

**Tokens, and what expiry does and does not do.** An access token lasts an
hour. A client that asked for `offline_access` also gets a refresh token good
for thirty days, and presenting it mints a new access token and rotates the
refresh token. So a connected client renews itself indefinitely and the thirty
days is not a deadline for anything.

A rotated refresh token has a **30-second reuse window**, and what it replays is
narrower than "a retry". The stored response comes back only when the second
request is *identical* to the first in three things: the effective scopes, the
requested resources, and the DPoP confirmation
(`sameRefreshTokenRotationReplayRequest`, `introspect-*.mjs` ~1690, ~1734). A
dropped connection retried verbatim gets its response back. A request inside the
window that asks for anything different is refused with `invalid_grant` — and
refused *without* tearing the family down (~2146), because a client changing its
mind is not evidence of theft.

Outside the window, presenting a rotated or revoked refresh token calls
`invalidateRefreshFamily`, which **deletes** every refresh row for that client
and account and every access token hanging off them, then refuses. That is the
tear-down; there is nothing left behind to inspect afterwards.

The window itself is `@better-auth/mcp`'s default, not this app's; the provider
on its own is strict (`refreshTokenReuseInterval: 0`).

## How a client is registered

**Anonymous dynamic client registration is off**, which is the 1.7 default and
is left alone. `/api/auth/oauth2/register` answers **403** to everyone. RFC 7591
lets any stranger who can reach the origin write a row to `oauth_client`, and a
client nobody owns cannot be listed on `/settings` or removed there.

Two ways in, and they cover different clients.

### A Client ID Metadata Document (a client with a home)

MCP 2026-07-28 lets a client present an **HTTPS URL as its `client_id`**.
`@better-auth/cimd` fetches the document at that URL, validates it against CIMD
draft-00 (which the MCP revision pins, so `client_name` and `redirect_uris` are
mandatory), and creates the client from it. Nobody registers anything and
nothing is typed.

The fetch is not a plain `fetch`. `fetchClientMetadataResource` from
`@better-auth/cimd/node` resolves the hostname once, refuses RFC 6890
special-use addresses, pins the approved address for the connection and follows
no redirects — the guarantees that stop a `client_id` URL being used to make
this server fetch something on its own network.

A CIMD client is owned by a domain rather than by an account, so it has no
`user_id`. It still appears on `/settings` for anyone who has consented to it,
because that list is keyed on consent rather than on ownership.

### Registered by you (a client on your machine)

A client running on a laptop has no public HTTPS home, so CIMD cannot describe
it. Register it from **/settings → Register an agent** while signed in: a name
and the redirect URI the agent printed. The client id comes back once, on the
screen, and goes into the client's config.

That form posts to a server action which calls the provider's own
`/oauth2/create-client` — session-backed, ownership-stamped, and the sanctioned
path for this. Three fields are decided for you: the client is public
(`token_endpoint_auth_method: "none"`, which is what every MCP client is), the
grants are `authorization_code` and `refresh_token`, and the application type
follows the redirect URI.

The redirect URI must be **`https://` on a public host**, or **`http://` on
`localhost`, any address in `127.0.0.0/8`, or `[::1]`**. Anything else is
refused with a sentence saying so. The whole `/8` rather than the one literal
because RFC 8252 §7.3 allows it and the provider's own `isLoopbackIP` accepts
it — refusing `127.0.0.53` here would have refused a URI the endpoint would
have taken. It is matched as an address and not as a prefix, so
`127.example.com` is a public DNS name and is refused. Private-use schemes such as `com.example.app:/cb` are legal OAuth
and are deliberately not offered here: this field is typed by a person from
something an agent printed, and a mistyped private-use scheme hands the
authorization code to a different program on the same machine with nothing
anywhere reporting an error. A client that needs one publishes a CIMD document
instead, which proves domain ownership rather than asking a person to read a
URI carefully.

The client id is not a credential — it travels in the query string of every
authorization request — but nothing prints it a second time.

## The consent contract

Worth writing down because it changed, and because the page and the endpoint
have to agree.

- **The provider redirects to** `/consent?<the whole signed authorization
  query>`. That is `client_id`, `scope`, `redirect_uri`, `response_type`, the
  PKCE challenge, any `resource`, plus `exp`, `ba_iat`, `ba_param` and `sig`.
  There is no short consent code and no consent cookie any more.
- **The page reads three of them** — `client_id` to look the client's real name
  and redirect host up in `oauth_client`, `scope` to write the permission
  sentences, `sig` to tell a real authorization from a bookmark. It reads
  nothing else and trusts nothing it reads.
- **The page posts** `POST /api/auth/oauth2/consent` with
  `{ accept: boolean, oauth_query: string }`, where `oauth_query` is that query
  string handed back byte for byte, plus `credentials: "include"` and
  `Accept: application/json`. The provider verifies the signature against
  `BETTER_AUTH_SECRET` before it reads a field, so a query edited in the
  address bar buys nothing — and the page never has to be trusted to restate
  what was asked for.
- **It answers** `{ redirect: true, url }` either way. That URL carries the
  authorization code, or `error=access_denied`, back to the client. The page
  navigates to it with `window.location.assign` rather than the router, because
  the destination is usually not this app — `http://127.0.0.1:…` for a terminal
  client.

## Scopes

Two that decide anything, plus the OpenID set the provider always issues.

| Scope | What it opens |
| --- | --- |
| `read` | The six reads below |
| `write` | `capture_riff` and `draft_angle` — the two that spend money |

All six are advertised at `/.well-known/oauth-authorization-server`. The
protected-resource document advertises `read` and `write` alone — the provider
drops the identity scopes from it itself, because they are facts about the
authorization server rather than about this endpoint.

`read` is also the floor: `requireMcpAuth` refuses a token that does not carry
it with **403** and an RFC 6750 `insufficient_scope` challenge naming what is
missing, so a client can step up in one round trip. `write` is checked per
tool, because a `read` token calling a read must still work.

**What a leaked token is worth, said plainly.** A `read` token reads everything
the account holds: every riff, every draft, the lineup, the numbers, the
stories. A `write` token does that and can spend a model call to leave a draft
on `/drafts`, and a bill. Neither can approve, schedule or publish — not with
any scope. The controls are the consent screen you pass through to mint one and
the removal on `/settings`.

Ask for both if you want the agent to be useful; ask for `read` alone if you
want it to be safe. A read-only token calling a write is refused by the server
before anything is spent, with a sentence saying which scope was missing.

## The eight tools

| Tool | Scope | What it does |
| --- | --- | --- |
| `read_riffs` | `read` | The raw material waiting, and the angles on each, with the ids `draft_angle` needs |
| `read_drafts` | `read` | What has been written and is waiting for you, per channel |
| `read_lineup` | `read` | What is scheduled, and when |
| `read_numbers` | `read` | How your published posts did, against your own median — never a follower count |
| `read_source` | `read` | One delivered item whole: a merged pull request by number, URL or id, with its brief, beats and commits |
| `read_story` | `read` | One story from the brain in full — hooks used before, your own quotes, the proof |
| `capture_riff` | `write` | Turn text you give it into a riff with angles. Costs a model call |
| `draft_angle` | `write` | Write one angle into a draft, one version per channel. Lands on `/drafts` unapproved. Costs a model call |

Every one of them returns prose, not rows. That is deliberate: a model handed
twelve fields per record reads them back, and a chat that recites tables is a
dashboard with extra steps.

### What is deliberately absent

- **`approveVersion`.** Approving is the send. It is the one act that puts
  writing out under your name, and it belongs to a person in a browser.
- **Anything that schedules.** Same argument, one step earlier.
- **Anything that publishes.** `lib/publish.ts` is not reachable from this
  surface and must not become reachable.
- **`read_channels` and `read_sources`**, which the Studio chat does have.
  They enumerate the platforms an account holds and the state of each grant.
  An outside agent has no business with that list, and nothing it could do
  with it that the other six do not already allow.

If a future tool would need any of the first three, the answer is not a new
scope. It is that the tool does not belong here.

## Ceilings

Per AGENTS.md, "Money": every path that spends gets a ceiling.

| Ceiling | Value | Where it lives |
| --- | --- | --- |
| Requests per minute, per account | 60 | In process, `lib/mcp.ts` |
| Drafts per day, per account | 20 | `usage_event`, trailing 24 hours |
| Spend per day, per account | `CHAT_DAILY_CEILING_MICROS` | `ceilingVerdict`, the same call `/api/chat` makes |
| One capture or draft at a time | 15s cooldown | `ADAPT_SPEND`, shared with the `/riffs` buttons |
| Registered agents, per account | 20 | `atAgentLimit`, counted on `oauth_client` |

The day's spend is the chat's ceiling, not a second one: the route reads
`summariseUsage` over the trailing 24 hours and calls `ceilingVerdict` from
`lib/chat-guards.ts` before either write runs. It is per person rather than per
route because a wallet does not care which surface emptied it.

The cooldown is the same fifteen seconds and the same `usage_event` tag the
three adapt buttons on `/riffs` hold, and `draft_angle` both reads it and
writes it. A cooldown that only read it would see the other buttons' rows and
let two drafts through back to back.

The per-minute counter is in memory, which on serverless means per instance —
a tripwire against a runaway loop, not a wall. It is allowed to be, because
everything that costs real money is bounded by the entitlement gate, the day's
spend and the daily draft count, and all three read the database. The map
evicts closed windows once it passes a thousand entries, so a long-lived
instance does not accumulate one row per account that ever connected.

An account that is out of its free day and has not subscribed keeps its reads
and loses its writes, with a sentence saying so. Read-only means read-only, not
locked out — the same posture as the rest of the product
([`docs/billing.md`](billing.md)).

## Removing an agent

`/settings` lists every MCP client this account has consented to: what it
called itself, when you connected it, and when it last took a key. Each one has
a hold-to-confirm **Remove**.

Removing does three things, and each closes a different door:

1. **Deletes the `oauth_consent` row.** That is the record of "this person said
   yes to this client for these scopes", and while it stands the next
   authorization is granted without a screen. Deleting it means the agent has
   to be consented to again.
2. **Revokes the refresh tokens** — sets `revoked`, keeping the row. This is
   the write that actually ends the connection: the next presentation of one is
   refused. **The row survives only until that next attempt.** Inside the
   30-second reuse window an identical request replays and a non-identical one
   is refused, both leaving the row standing; outside it,
   `invalidateRefreshFamily` (`introspect-*.mjs` ~1498, called at ~2160) deletes
   every refresh row for that client and account together with their access
   tokens. So a revoked row is not a lasting audit trail — it is a refusal that
   holds until the client next asks. Without this write the client keeps minting
   new access tokens for a month.
3. **Deletes any stored access tokens.** Usually there are none, because a
   resource-bound token is a JWT with no row; a token issued without a resource
   is opaque and stored, and leaving it would leave a working key behind.

If this account registered the client itself, the client row is deleted too,
through the provider's own endpoint. A CIMD client is owned by nobody and is
left standing — it is shared machinery and another account may be using it. The
three writes above have already taken everything it had here.

**What removal cannot take back is the hour left on an access token already
issued.** A 1.7 access token is a self-contained JWT verified against the JWKS;
there is nothing to revoke and nothing to look up. That is a real difference
from the version this replaced, where a token was a row and deleting the client
took it. It is stated on the settings page too, rather than papered over.

## Schema

Eight tables: `jwks`, `oauth_client`, `oauth_resource`,
`oauth_client_resource`, `oauth_refresh_token`, `oauth_access_token`,
`oauth_consent`, `oauth_client_assertion`. They are declared in `lib/schema.ts`,
which is the output of `pnpm auth:generate`.

```
npx tsx --env-file=.env.local scripts/apply-mcp-oauth.ts
```

The DDL is `scripts/mcp-oauth.sql` and the script asserts every column, every
index and — since 1.7 tightened seven columns the provider always writes — the
`is_nullable` of each of those.

**Two files, and which one you need depends on the database.** A fresh database
gets everything from `scripts/mcp-oauth.sql`, which declares the 1.7 shape
directly. The live database was created from an earlier version of that file, so
it is brought up by `scripts/account-issuer.sql`
(`scripts/apply-account-issuer.ts`), which carries `account.issuer` and, with
it, the `NOT NULL`s on `oauth_refresh_token.expires_at/created_at`,
`oauth_access_token.token/expires_at/created_at` and
`oauth_consent.created_at/updated_at`, plus the rename of the
`oauth_client_resource` unique index to
`oauthClientResource_clientId_resourceId_uidx`. Both files are idempotent and a
re-run of either against a corrected database changes nothing.

Nothing is dropped and no data moves. The three-table 1.6 version of this
script (`oauth_application` and earlier shapes of `oauth_access_token` and
`oauth_consent`) was never applied, so the upgrade guide's "provider client
store" migration does not apply here. The script refuses to run if it finds an
`oauth_application` table, because that would mean the old schema was applied
after all and `IF NOT EXISTS` would quietly leave two tables in the wrong shape.

**There is one database.** Running that script is the production migration. See
AGENTS.md.

### Apply it before deploying, not after

This is the sharp edge of the whole migration. The OAuth provider seeds
`oauth_resource` from its `init` hook when the auth instance boots, and it is
written to tolerate the table being absent: `seedResources` catches the failed
`findOne`, tests `MISSING_TABLE_PATTERN` — `/no such table|relation.*does not
exist|table.*does(?: not|n't) exist/i` — against `err.message`, and returns
early to defer the seed (`introspect-*.mjs` ~831).

**That test is against `err.message`, and on the neon-http driver the relation
error is not there.** `NeonDbError` carries `relation "oauth_resource" does not
exist` on `cause`; the `message` drizzle raises reads `Failed query: select …`.
So the pattern finds nothing, the `throw err` on the next line runs, the error
escapes `init`, and **every call to `auth.api.getSession` throws**. The
tolerance the plugin advertises simply does not apply on this driver.

So on this stack the tables are not optional and not lazy: until
`apply-mcp-oauth.ts` has run, the app cannot resolve a session, which means
nobody can sign in and no page in `(app)` renders. `pnpm build` still passes —
both `/.well-known` catch-all routes await `connection()` and are never prerendered —
but that is the only thing that works without the tables.

## How the writes reach the same code the app uses

`capture_riff` and `draft_angle` call `captureToRiffFor` and `draftAngleFor` in
`lib/riff-writes.ts` — the same two functions the `/riffs` server actions call,
and the same ones the Studio chat calls. They own the entitlement check, the
cooldown, the ownership proof on the angle id, the idempotency guard and the
metering, and a second copy of any of that is the copy that goes wrong.

They take a **user id** as their first argument. That is what lets one write
path serve three callers that authenticate differently: the `/riffs` action
resolves a cookie session and passes `session.user.id`, `/api/chat` does the
same, and `/api/mcp` verifies a bearer token against the JWKS and passes the id
from the row it read. Nothing on the MCP path resolves a session at all.

**The `AsyncLocalStorage` bridge is gone.** Until this change the two writes
were the server actions themselves, which read the cookie — so the MCP route ran
them inside a store and a `/get-session` branch in `lib/auth.ts` answered from
it. That is deleted: `runAsMcpUser`, the store, the hook branch and the wrapping
in the route. Nothing in the app can make a bearer token look like a session any
more, which is one fewer thing standing between a token and a page.

A banned account is refused at the route with **401** before any of this runs,
from the `user` row rather than from the token — a ban ends the browser sessions
and cannot reach an access token that is already signed.

## The admin OAuth routes are disabled

`@better-auth/oauth-provider` registers seven endpoints under
`/api/auth/admin/oauth2` — create and update a client, create, read, update and
delete a resource, link and unlink a client to a resource. They are gated on the
`clientPrivileges` and `resourcePrivileges` callbacks, and the plugin's own
comment says what an undefined callback means: the gate "degrades to any
authenticated session can manage resources". On a product anyone can sign up
for, that is not a gate. `metadata: { SERVER_ONLY: true }` does not help — it
marks them as not client-callable, and an ordinary `fetch` still reaches them.

Admin create accepts `skip_consent`, which turns off the one screen standing
between a program and somebody's material. Resource update accepts
`accessTokenTtl` and `disabled` — the lifetime and the on-switch of every token
this server issues.

So `lib/auth.ts` answers the whole `/admin/oauth2` prefix with **404** from its
root before-hook, and sets both callbacks. `disabledPaths` cannot do this job:
it is an exact-match list and two of the paths are parameterised.
`resourcePrivileges` returns `false` outright; `clientPrivileges` allows exactly
`create` and `delete`, which are /settings registering an agent and Remove,
both through the user-scoped `/oauth2/*` endpoints. Nothing in the repo calls an
admin endpoint.

## Known rough edges

- A browser holding a **stale** session cookie — expired, revoked, or signed
  with a rotated secret — is bounced from `/login` to `/studio` by `proxy.ts`,
  which would interrupt an authorization in progress. Signing out and back in
  clears it. This is the pre-existing behaviour of that redirect, not something
  the MCP flow introduced.
- **An access token cannot be revoked.** An hour, at worst. See "Removing an
  agent" for why, and for what removal does instead.
- **A client without a CIMD document has to be registered by hand.** That is
  the cost of not letting strangers write rows to `oauth_client`, and it is
  paid once per client.
- **Registration writes two rows without a transaction.**
  `createOAuthClient` writes the `oauth_client` row and its
  `oauth_client_resource` link inside `runWithTransaction`, but the drizzle
  adapter here runs `transaction: false` — neon-http speaks one request per
  statement — so the two are independent writes and the second can fail alone. A
  client with no link is dead on arrival: `enforcePerClientResources` defaults
  to true, so no token is ever issued for it. `registerAgent` re-reads the link
  and, if it is missing, deletes the client row and answers "Registration did
  not complete. Try again." The narrower case it cannot repair is a link insert
  that *throws*: the endpoint throws with it, so the client id never comes back
  and the orphan row cannot be named. Switching to the WebSocket driver is what
  would close this properly.
- **No live OAuth round trip has been run against this yet.** Everything above
  is read from the installed plugin source and from the unit tests; the flow
  itself is owed, and it cannot run until the migration has.
