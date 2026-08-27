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

## Connecting a client

Quincy is an OAuth 2.1 authorization server, so a client that speaks OAuth
needs the URL above and nothing else. The flow, in order:

1. The client POSTs to `/api/mcp` with no token. It gets **401** and a
   `WWW-Authenticate` header naming the protected-resource document.
2. It fetches `/.well-known/oauth-protected-resource` (RFC 9728), which names
   the authorization server, and then
   `/.well-known/oauth-authorization-server` (RFC 8414), which names the
   endpoints and the scopes. Both are also served under `/api/auth`; they are
   published at the origin as well because several clients look there first
   instead of following the header.
3. It **registers** at `/api/auth/mcp/register` (RFC 7591) — **with a signed-in
   session**. This is the one place Quincy departs from the specification, and
   it is deliberate: the plugin takes that POST from anybody, which means a
   stranger can write a row to `oauth_application`, and a client nobody owns
   cannot be listed on `/settings` or removed there. An MCP client is
   registered by the person who is going to use it. A registration still buys a
   client id and nothing else — it grants no access at all.

   A client that cannot register with your cookies, which is most of them, is
   registered by hand from a browser that is signed in:

   ```js
   await fetch("/api/auth/mcp/register", {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({
       client_name: "My terminal agent",
       redirect_uris: ["http://127.0.0.1:33418/callback"],
       token_endpoint_auth_method: "none",
     }),
   }).then((r) => r.json())
   ```

   The `client_id` that comes back goes in the client's config. An
   unauthenticated POST answers **401** with a sentence pointing here.
4. It opens `/api/auth/mcp/authorize` in a browser. If you are not signed in
   you land on `/login`, and the authorization resumes the moment you are.
5. **You consent.** The browser lands on `/consent`, which names the client,
   the host the code will be sent back to, and what each requested scope buys
   in plain words. One button allows it; a text link denies it and sends the
   client `error=access_denied`. Nothing is minted until you press Allow.

   The screen is not skippable. `prompt=consent` is forced by a before-hook in
   `lib/auth.ts` whatever the client asked for, because the plugin issues the
   code immediately when `prompt` is anything else — so a client that simply
   omits it would otherwise get a token with no screen in front of it.
6. It exchanges the code at `/api/auth/mcp/token`.

**PKCE is required.** `code_challenge_methods_supported` advertises `S256`
alone; a request without a verifier is refused, and so is a `plain` challenge.

**Tokens, and what expiry does and does not do.** An access token lasts an
hour. A client that asked for `offline_access` also gets a refresh token good
for a week — and presenting it mints a *new* access token with a *new* week on
its refresh token. So a connected client renews itself indefinitely and the
week is not a deadline for anything. An older refresh token also stays valid
until its own expiry; the plugin writes a new row rather than replacing the old
one. **Expiry is not revocation.** Removing the agent on `/settings` is.

## Scopes

Two that decide anything, plus the OpenID set the provider always issues.

| Scope | What it opens |
| --- | --- |
| `read` | The six reads below |
| `write` | `capture_riff` and `draft_angle` — the two that spend money |

Both are advertised at `/.well-known/oauth-authorization-server` alongside the
OpenID four, so a client reading RFC 8414 sees them and can ask for them.

**What a leaked token is worth, said plainly.** A `read` token reads everything
the account holds: every riff, every draft, the lineup, the numbers, the
stories. A `write` token does that and can spend a model call to leave a draft
on `/drafts`, and a bill. Neither can approve, schedule or publish — not with
any scope. The two controls are the consent screen you pass through to mint one
and the removal on `/settings`; expiry is not one of them, because a refresh
token renews itself.

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

`/settings` lists every MCP client this account has authorized: what it called
itself at registration, when it was connected, and when it last took a key.
Each one has a hold-to-confirm **Remove**.

Removing deletes the `oauth_application` row, and
`oauth_access_token.client_id` and `oauth_consent.client_id` both reference it
`ON DELETE CASCADE` — so every access token and every refresh token issued to
that client goes with it, along with the consent record. The client is not
disabled, it is gone: connecting again means registering again and consenting
again.

**This is the only revocation there is.** Waiting for a token to expire does
nothing, because the refresh token mints a replacement with a fresh week on it.

## Schema

Three tables, from Better Auth's OAuth provider schema, which the `mcp` plugin
reuses unchanged: `oauth_application`, `oauth_access_token`, `oauth_consent`.

```
npx tsx --env-file=.env.local scripts/apply-mcp-oauth.ts
```

The DDL is `scripts/mcp-oauth.sql` and the Drizzle declarations are in a
clearly marked hand-written block in `lib/schema.ts`. That file is generated
output, so `pnpm auth:generate` is what proves the block right — run it and
compare before trusting either.

**There is one database.** Running that script is the production migration. See
AGENTS.md.

## How the writes reach the same code the app uses

`capture_riff` and `draft_angle` call `captureToRiff` and `draftAngle` — the
same server actions the `/riffs` page calls. They own the entitlement check,
the cooldown, the ownership proof on the angle id, the idempotency guard and
the metering, and a second copy of any of that is the copy that goes wrong.

Those actions resolve the session from the request, which is exactly what makes
them safe to call from a tool: an id in an argument proves nothing, a session
does. A banned account is refused at the route with **401**, and again inside
the session bridge — a ban ends the browser sessions and leaves the OAuth
tokens untouched, so neither gate is redundant. An MCP client has a bearer token and no cookie, so the session is bridged
for the length of the tool call and no longer — `runAsMcpUser` in
`lib/auth.ts`, which documents how narrowly it is bound. It is not a way to
authenticate a request; the request was already authenticated against a live
access token before anything ran.

## Known rough edges

- A browser holding a **stale** session cookie — expired, revoked, or signed
  with a rotated secret — is bounced from `/login` to `/studio` by `proxy.ts`,
  which would interrupt an authorization in progress. Signing out and back in
  clears it. This is the pre-existing behaviour of that redirect, not something
  the MCP flow introduced.
- **Dynamic registration needs a browser.** Step 3 above: a client that expects
  to register itself unattended cannot, and has to be registered by hand from a
  signed-in browser first. That is the cost of not letting strangers write rows
  to `oauth_application`, and it is paid once per client.
- An MCP client registered before that gate existed has no owner, so it does
  not appear on `/settings` and cannot be removed there. No such client ever
  held a token — a token needs somebody to authorize it — but the rows are
  there and have to be deleted by hand.
