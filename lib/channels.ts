import { createIdGenerator } from "ai"
import { and, desc, eq } from "drizzle-orm"
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto"

import { db } from "./db"
import {
  channelConnection,
  type ConnectableChannel,
  CONNECTABLE_CHANNELS,
} from "./schema-app"

/**
 * Connecting an X or LinkedIn account, and keeping the connection alive.
 *
 * All of the OAuth judgment lives here; the routes under /api/connect are thin
 * on purpose. See plans/005 for why this is not better-auth's genericOAuth —
 * the short version is that X returns no email and better-auth's account-link
 * path hard-requires one, and working around that would mean loosening account
 * linking globally for a reason that has nothing to do with signing in.
 */

const newConnectionId = createIdGenerator({ prefix: "cc", size: 16 })

/** Refresh this far before expiry rather than at it, so a slow call cannot race. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000

/**
 * Every outbound call to a platform carries this.
 *
 * Without it a single hung socket has no upper bound, and the daily sweep —
 * which is sequential by design — spends its whole 300-second budget on one
 * row. The rows behind it are never checked, and because the sweep restarts
 * from the beginning, the same tail is skipped every day. A platform that has
 * not answered in ten seconds is not going to.
 */
export const PLATFORM_TIMEOUT_MS = 10_000

export const CONNECT_COOKIE = "quincy_connect"

/** The round trip is a redirect and back. Ten minutes is generous for that. */
export const CONNECT_COOKIE_MAX_AGE = 600

type ChannelConfig = {
  label: string
  authorizationUrl: string
  tokenUrl: string
  /**
   * Frozen per plans/005: adding a scope invalidates every existing grant and
   * sends everyone back through consent. Changing this list is a migration.
   */
  scopes: string[]
  /** X requires PKCE. LinkedIn does not support it — the secret is the credential. */
  pkce: boolean
  /**
   * Where the client secret goes on the token request. X wants HTTP Basic;
   * LinkedIn wants it in the form body. Getting this backwards is a 401 whose
   * message does not say so.
   */
  tokenAuth: "basic" | "body"
  /**
   * Whether the provider issues refresh tokens to us. LinkedIn's programmatic
   * refresh tokens are limited to approved partners, so a LinkedIn connection
   * genuinely ends every 60 days and the human has to come back.
   */
  refreshable: boolean
  clientId?: string
  clientSecret?: string
}

function config(channel: ConnectableChannel): ChannelConfig {
  switch (channel) {
    case "x":
      return {
        label: "X",
        authorizationUrl: "https://x.com/i/oauth2/authorize",
        tokenUrl: "https://api.x.com/2/oauth2/token",
        // offline.access is what yields a refresh token. Without it the access
        // token dies after two hours and every post needs a fresh consent
        // screen, which is not a product.
        //
        // `bookmark.read` was added on 2026-08-08 for the Bookmarks rhythm
        // (plans/016). Per the note on `scopes` above, that invalidated every
        // grant issued before it: an existing connection keeps working for
        // posting but will never be able to read bookmarks, because the token
        // it holds was minted without the scope. **Everyone connected before
        // that date has to reconnect on /channels.**
        //
        // It was a cheap decision precisely once — at the time there was a
        // single connected account. It will not be cheap again, and the next
        // scope added here needs a reconnect mail (emails/reconnect-channel.tsx
        // already exists) rather than this comment.
        scopes: [
          "tweet.read",
          "tweet.write",
          "users.read",
          "bookmark.read",
          "offline.access",
        ],
        pkce: true,
        tokenAuth: "basic",
        refreshable: true,
        clientId: process.env.X_CLIENT_ID,
        clientSecret: process.env.X_CLIENT_SECRET,
      }
    case "linkedin":
      return {
        label: "LinkedIn",
        authorizationUrl: "https://www.linkedin.com/oauth/v2/authorization",
        tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
        scopes: ["openid", "profile", "email", "w_member_social"],
        pkce: false,
        tokenAuth: "body",
        refreshable: false,
        clientId: process.env.LINKEDIN_CLIENT_ID,
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
      }
  }
}

export function isConnectableChannel(
  value: string
): value is ConnectableChannel {
  return (CONNECTABLE_CHANNELS as readonly string[]).includes(value)
}

/**
 * Whether the channel is configured at all.
 *
 * Same reasoning as `isGoogleEnabled` in lib/auth.ts: a Connect button that
 * fails on click is worse than no button, because it looks like the product is
 * broken rather than unfinished.
 */
export function isChannelEnabled(channel: ConnectableChannel): boolean {
  const { clientId, clientSecret } = config(channel)
  return Boolean(clientId && clientSecret)
}

export function channelLabel(channel: ConnectableChannel): string {
  return config(channel).label
}

export function isRefreshable(channel: ConnectableChannel): boolean {
  return config(channel).refreshable
}

function baseUrl(): string {
  const url = process.env.BETTER_AUTH_URL
  if (!url) {
    throw new Error(
      "BETTER_AUTH_URL is not set. The OAuth redirect URI is derived from it, " +
        "and a mismatch with the provider's registered callback fails the exchange."
    )
  }
  return url.replace(/\/$/, "")
}

export function redirectUri(channel: ConnectableChannel): string {
  return `${baseUrl()}/api/connect/${channel}/callback`
}

/* ── PKCE and state ───────────────────────────────────────────────────────── */

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url")
}

export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)))
}

/**
 * S256, the only challenge method X accepts. `plain` exists in the spec and is
 * pointless — it puts the verifier on the wire, which is what PKCE prevents.
 */
async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  )
  return base64url(new Uint8Array(digest))
}

export type ConnectHandshake = {
  channel: ConnectableChannel
  state: string
  codeVerifier: string
  /**
   * Where to land after the round trip, instead of /channels/<channel>.
   *
   * Carried in the handshake because the handshake is the only thing that
   * already survives the trip out to the provider and back. It is not a
   * secret and nothing security-relevant is derived from it — `resolveReturnTo`
   * is what makes a tampered value harmless.
   */
  next?: string
}

/**
 * Every page the connect callback may return someone to, as literals.
 *
 * A **literal allowlist, not a prefix check**, and the difference is the whole
 * point. `startsWith("/")` is the obvious guard and it is not one: `//evil.example`
 * and `/\evil.example` both pass it and both are protocol-relative URLs that
 * browsers happily navigate off-site. This callback is reachable while the
 * person is holding a freshly minted session, which is exactly when an open
 * redirect is worth the most to an attacker.
 *
 * Growing this list is a deliberate act. Adding a value that takes a parameter
 * would reintroduce the problem in a new shape.
 */
const CONNECT_RETURN_TO = ["/welcome"] as const

/**
 * The return path if it is one we published, otherwise null.
 *
 * Null rather than a thrown error: a bad `next` is not worth failing a connect
 * over, and the caller's fallback (/channels/<channel>) is a real page that
 * shows the outcome. Silently correcting beats stranding someone.
 */
export function resolveReturnTo(value: string | null | undefined): string | null {
  if (!value) return null
  return (CONNECT_RETURN_TO as readonly string[]).includes(value) ? value : null
}

/**
 * The authorization URL, plus the secrets the callback needs to finish.
 *
 * The handshake goes in an httpOnly cookie rather than the database. It is
 * short-lived, scoped to one browser, and useless to anyone who cannot also
 * present the session — and a database row would need its own expiry sweep to
 * avoid accumulating abandoned handshakes.
 */
export async function beginConnect(
  channel: ConnectableChannel,
  /** Already through `resolveReturnTo`. Null means /channels/<channel>. */
  next: string | null = null
): Promise<{
  url: string
  handshake: ConnectHandshake
}> {
  const c = config(channel)

  if (!c.clientId || !c.clientSecret) {
    throw new Error(`${c.label} is not configured.`)
  }

  const state = randomToken()
  const codeVerifier = randomToken()

  const params = new URLSearchParams({
    response_type: "code",
    client_id: c.clientId,
    redirect_uri: redirectUri(channel),
    scope: c.scopes.join(" "),
    state,
  })

  if (c.pkce) {
    params.set("code_challenge", await codeChallenge(codeVerifier))
    params.set("code_challenge_method", "S256")
  }

  return {
    url: `${c.authorizationUrl}?${params.toString()}`,
    handshake: { channel, state, codeVerifier, ...(next ? { next } : {}) },
  }
}

/* ── Token exchange ───────────────────────────────────────────────────────── */

type Tokens = {
  accessToken: string
  refreshToken: string | null
  expiresAt: Date | null
  scope: string | null
}

function authHeaders(c: ChannelConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  }

  if (c.tokenAuth === "basic") {
    const credentials = Buffer.from(`${c.clientId}:${c.clientSecret}`).toString(
      "base64"
    )
    headers.Authorization = `Basic ${credentials}`
  }

  return headers
}

function parseTokens(payload: Record<string, unknown>): Tokens {
  const accessToken = payload.access_token

  if (typeof accessToken !== "string" || !accessToken) {
    throw new Error("Token response contained no access_token.")
  }

  const expiresIn =
    typeof payload.expires_in === "number" ? payload.expires_in : null

  return {
    accessToken,
    refreshToken:
      typeof payload.refresh_token === "string" ? payload.refresh_token : null,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
    scope: typeof payload.scope === "string" ? payload.scope : null,
  }
}

async function postToken(
  channel: ConnectableChannel,
  body: URLSearchParams
): Promise<Tokens> {
  const c = config(channel)

  if (c.tokenAuth === "body") {
    body.set("client_id", c.clientId!)
    body.set("client_secret", c.clientSecret!)
  } else {
    // X wants client_id in the body as well as the Basic header. Omitting it
    // is a 400 that reads like a malformed request rather than a missing field.
    body.set("client_id", c.clientId!)
  }

  const response = await fetch(c.tokenUrl, {
    method: "POST",
    headers: authHeaders(c),
    body,
    signal: AbortSignal.timeout(PLATFORM_TIMEOUT_MS),
  })

  const text = await response.text()

  if (!response.ok) {
    // The body carries the OAuth error code — invalid_grant is the one that
    // means "the user revoked us", and callers branch on it.
    throw new TokenError(
      `${c.label} token request failed (${response.status}): ${text.slice(0, 300)}`,
      text
    )
  }

  return parseTokens(JSON.parse(text) as Record<string, unknown>)
}

export class TokenError extends Error {
  readonly body: string

  constructor(message: string, body: string) {
    super(message)
    this.name = "TokenError"
    this.body = body
  }

  /** The grant is gone — the person removed us, or the token was invalidated. */
  get isRevoked(): boolean {
    return this.body.includes("invalid_grant")
  }
}

export async function exchangeCode(
  channel: ConnectableChannel,
  { code, codeVerifier }: { code: string; codeVerifier: string }
): Promise<Tokens> {
  const c = config(channel)

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(channel),
  })

  if (c.pkce) {
    body.set("code_verifier", codeVerifier)
  }

  return postToken(channel, body)
}

/* ── Who did we just connect ──────────────────────────────────────────────── */

export type ChannelProfile = {
  externalId: string
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
}

export async function fetchProfile(
  channel: ConnectableChannel,
  accessToken: string
): Promise<ChannelProfile> {
  const auth = { Authorization: `Bearer ${accessToken}` }

  if (channel === "x") {
    const response = await fetch(
      "https://api.x.com/2/users/me?user.fields=profile_image_url",
      { headers: auth, signal: AbortSignal.timeout(PLATFORM_TIMEOUT_MS) }
    )

    if (!response.ok) {
      throw new Error(
        `X profile lookup failed (${response.status}): ${(await response.text()).slice(0, 200)}`
      )
    }

    const { data } = (await response.json()) as {
      data?: {
        id?: string
        name?: string
        username?: string
        profile_image_url?: string
      }
    }

    if (!data?.id) {
      throw new Error("X returned no account id.")
    }

    return {
      externalId: data.id,
      handle: data.username ? `@${data.username}` : null,
      displayName: data.name ?? null,
      avatarUrl: data.profile_image_url ?? null,
    }
  }

  const response = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: auth,
    signal: AbortSignal.timeout(PLATFORM_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(
      `LinkedIn profile lookup failed (${response.status}): ${(await response.text()).slice(0, 200)}`
    )
  }

  const profile = (await response.json()) as {
    sub?: string
    name?: string
    picture?: string
  }

  if (!profile.sub) {
    throw new Error("LinkedIn returned no subject id.")
  }

  return {
    externalId: profile.sub,
    // LinkedIn's OIDC profile has no handle. The UI falls back to the name.
    handle: null,
    displayName: profile.name ?? null,
    avatarUrl: profile.picture ?? null,
  }
}

/* ── Storage ──────────────────────────────────────────────────────────────── */

function encryptionKey(): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) {
    throw new Error(
      "BETTER_AUTH_SECRET is not set. Channel tokens are encrypted with it, " +
        "and storing one in the clear is not an acceptable fallback."
    )
  }
  return secret
}

export type Connection = typeof channelConnection.$inferSelect

/**
 * What a caller outside this module is allowed to see.
 *
 * The token columns are absent by construction rather than by remembering to
 * omit them. Everything user-facing takes this; only `getAccessToken` below
 * decrypts, and it is the one function that talks to the platforms.
 */
export type SafeConnection = Omit<
  Connection,
  "accessToken" | "refreshToken" | "scope"
> & { scopes: string[] }

export function toSafeConnection(row: Connection): SafeConnection {
  // Built by naming what may leave, not by deleting what may not. A new secret
  // column added to the table later is absent here by default rather than
  // leaking until somebody remembers to exclude it.
  return {
    id: row.id,
    userId: row.userId,
    channel: row.channel,
    externalId: row.externalId,
    handle: row.handle,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    accessTokenExpiresAt: row.accessTokenExpiresAt,
    state: row.state,
    reauthNoticeSentAt: row.reauthNoticeSentAt,
    lastPublishedAt: row.lastPublishedAt,
    lastErrorAt: row.lastErrorAt,
    lastError: row.lastError,
    lastImportAt: row.lastImportAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    scopes: row.scope ? row.scope.split(/[\s,]+/).filter(Boolean) : [],
  }
}

export async function saveConnection({
  userId,
  channel,
  profile,
  tokens,
}: {
  userId: string
  channel: ConnectableChannel
  profile: ChannelProfile
  tokens: Tokens
}): Promise<Connection> {
  const accessToken = await symmetricEncrypt({
    key: encryptionKey(),
    data: tokens.accessToken,
  })

  const refreshToken = tokens.refreshToken
    ? await symmetricEncrypt({
        key: encryptionKey(),
        data: tokens.refreshToken,
      })
    : null

  const now = new Date()

  const values = {
    userId,
    channel,
    externalId: profile.externalId,
    handle: profile.handle,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    accessToken,
    refreshToken,
    accessTokenExpiresAt: tokens.expiresAt,
    scope: tokens.scope,
    // A reconnect is a repair. Clearing the error state here is what makes the
    // Reconnect button actually mean something.
    state: "active" as const,
    reauthNoticeSentAt: null,
    lastErrorAt: null,
    lastError: null,
    updatedAt: now,
  }

  const [row] = await db
    .insert(channelConnection)
    .values({ id: newConnectionId(), ...values })
    .onConflictDoUpdate({
      // (userId, channel) rather than including externalId: this is what
      // makes connecting a different account on a channel replace the
      // existing connection instead of inserting a second one alongside it.
      target: [channelConnection.userId, channelConnection.channel],
      set: values,
    })
    .returning()

  return row
}

export async function getConnectionRow(
  userId: string,
  channel: ConnectableChannel
): Promise<Connection | null> {
  // Ordered even though the unique index above should make at most one row
  // possible. LIMIT 1 without ORDER BY is a promise Postgres does not make:
  // it returns whatever it finds first, which can change between calls as rows
  // are updated. If a duplicate ever reappears — a migration that did not run,
  // a restore from an older dump — this at least makes every caller agree on
  // the same row instead of publishing through one and disconnecting another.
  const [row] = await db
    .select()
    .from(channelConnection)
    .where(
      and(
        eq(channelConnection.userId, userId),
        eq(channelConnection.channel, channel)
      )
    )
    .orderBy(desc(channelConnection.updatedAt))
    .limit(1)

  return row ?? null
}

/** For the UI. Never carries a token. */
export async function getConnection(
  userId: string,
  channel: ConnectableChannel
): Promise<SafeConnection | null> {
  const row = await getConnectionRow(userId, channel)
  return row ? toSafeConnection(row) : null
}

export async function listConnections(
  userId: string
): Promise<SafeConnection[]> {
  const rows = await db
    .select()
    .from(channelConnection)
    .where(eq(channelConnection.userId, userId))

  return rows.map(toSafeConnection)
}

/**
 * Exported for the daily sweep in lib/channels-maintenance.ts, which is the
 * only caller outside this file. Kept here rather than written inline there so
 * that every write to `state` goes through one function — the column decides
 * whether Quincy may post in someone's name, and two places setting it is how
 * the two places drift apart.
 */
export async function markConnectionState(
  id: string,
  state: (typeof channelConnection.$inferSelect)["state"],
  error?: string
): Promise<void> {
  await db
    .update(channelConnection)
    .set({
      state,
      updatedAt: new Date(),
      ...(error ? { lastError: error, lastErrorAt: new Date() } : {}),
    })
    .where(eq(channelConnection.id, id))
}

/** So the reconnect nudge sends once per 60-day cycle rather than every day. */
export async function recordReauthNotice(id: string): Promise<void> {
  await db
    .update(channelConnection)
    .set({ reauthNoticeSentAt: new Date(), updatedAt: new Date() })
    .where(eq(channelConnection.id, id))
}

/* ── Is the grant still there ─────────────────────────────────────────────── */

export type LivenessResult =
  /** The platform answered as the connected account. */
  | { live: true }
  /** The platform says this credential is no good. */
  | { live: false; status: number; body: string }
  /**
   * We could not find out. A timeout, a 500, a DNS failure. Deliberately its
   * own case: the sweep must never read "LinkedIn is down" as "the user
   * withdrew consent", because that conclusion is written to the database and
   * only a human reconnecting can undo it.
   */
  | { live: "unknown"; error: string }

/**
 * One authenticated call, purely to ask whether the grant still exists.
 *
 * This is the heartbeat LinkedIn's own integration requirements ask for, and
 * the cheapest honest version of it: the same profile endpoints `fetchProfile`
 * uses, read for their status code rather than their body. It is separate from
 * `fetchProfile` because that one throws a string on any non-200, and the
 * difference between 401 and 503 is the entire decision being made here.
 */
export async function probeLiveness(
  channel: ConnectableChannel,
  accessToken: string
): Promise<LivenessResult> {
  const url =
    channel === "x"
      ? "https://api.x.com/2/users/me"
      : "https://api.linkedin.com/v2/userinfo"

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(PLATFORM_TIMEOUT_MS),
    })

    if (response.ok) {
      return { live: true }
    }

    const body = (await response.text()).slice(0, 300)

    // 401 and 403 are verdicts about the credential. Everything else is the
    // platform having a bad day, and a bad day upstream is not consent
    // withdrawn down here. 429 especially: rate limiting says nothing at all
    // about the grant, and treating it as revocation would disconnect every
    // user at once on the day we cross a quota.
    if (response.status === 401 || response.status === 403) {
      return { live: false, status: response.status, body }
    }

    return {
      live: "unknown",
      error: `${channelLabel(channel)} answered ${response.status}: ${body}`,
    }
  } catch (cause) {
    return {
      live: "unknown",
      error: cause instanceof Error ? cause.message : String(cause),
    }
  }
}

/* ── The read path that matters ───────────────────────────────────────────── */

export type AccessResult =
  | { ok: true; accessToken: string; connection: Connection }
  | { ok: false; reason: "missing" | "needs_reauth" | "revoked" }

/**
 * The stored token as-is, with no refresh and no state written.
 *
 * `getAccessToken` is the right function for anything that intends to *use* a
 * connection: it refreshes what is stale and records what it learns. That
 * makes it the wrong function for a diagnostic, because looking at a
 * connection would change it — an inspector run at the wrong moment marks a
 * working row `needs_reauth`, or spends an X refresh token that X will not
 * honour twice.
 *
 * So this one only reads. It returns whatever is in the column, including a
 * token that has already expired, and says when it expires so the caller can
 * decide what that means. A caller that wants a *usable* token wants
 * `getAccessToken` instead.
 */
export async function peekAccessToken(
  userId: string,
  channel: ConnectableChannel
): Promise<
  | { ok: true; accessToken: string; connection: Connection }
  | { ok: false; reason: "missing" }
> {
  const row = await getConnectionRow(userId, channel)

  if (!row) {
    return { ok: false, reason: "missing" }
  }

  return {
    ok: true,
    accessToken: await symmetricDecrypt({
      key: encryptionKey(),
      data: row.accessToken,
    }),
    connection: row,
  }
}

/**
 * A usable access token, refreshing first if the stored one is about to die.
 *
 * The only function here that decrypts a token meant for use —
 * `peekAccessToken` reads without refreshing, for diagnostics. Everything
 * that publishes goes through this one, which is what makes "never publish
 * on a revoked connection" a property of the code rather than a rule callers
 * have to remember.
 *
 * Returns a result rather than throwing, following lib/mail.ts — and with the
 * same warning attached: an unread result is a swallowed exception.
 */
export async function getAccessToken(
  userId: string,
  channel: ConnectableChannel
): Promise<AccessResult> {
  const row = await getConnectionRow(userId, channel)

  if (!row) {
    return { ok: false, reason: "missing" }
  }

  if (row.state === "revoked") {
    return { ok: false, reason: "revoked" }
  }

  const expiresAt = row.accessTokenExpiresAt?.getTime() ?? null
  const stale = expiresAt !== null && expiresAt - Date.now() < REFRESH_MARGIN_MS

  if (!stale) {
    return {
      ok: true,
      accessToken: await symmetricDecrypt({
        key: encryptionKey(),
        data: row.accessToken,
      }),
      connection: row,
    }
  }

  // LinkedIn: nothing to refresh with. This is the expected end of a 60-day
  // life, not a failure, and the daily cron will already have nudged.
  if (!isRefreshable(channel) || !row.refreshToken) {
    await markConnectionState(row.id, "needs_reauth")
    return { ok: false, reason: "needs_reauth" }
  }

  try {
    const tokens = await postToken(
      channel,
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: await symmetricDecrypt({
          key: encryptionKey(),
          data: row.refreshToken,
        }),
      })
    )

    const [updated] = await db
      .update(channelConnection)
      .set({
        accessToken: await symmetricEncrypt({
          key: encryptionKey(),
          data: tokens.accessToken,
        }),
        // X rotates the refresh token on every use. Persisting the new one is
        // not an optimisation — drop it and the connection dies at the next
        // refresh, hours later, for no visible reason.
        ...(tokens.refreshToken
          ? {
              refreshToken: await symmetricEncrypt({
                key: encryptionKey(),
                data: tokens.refreshToken,
              }),
            }
          : {}),
        accessTokenExpiresAt: tokens.expiresAt,
        ...(tokens.scope ? { scope: tokens.scope } : {}),
        state: "active" as const,
        lastError: null,
        lastErrorAt: null,
        updatedAt: new Date(),
      })
      .where(eq(channelConnection.id, row.id))
      .returning()

    return { ok: true, accessToken: tokens.accessToken, connection: updated }
  } catch (error) {
    const revoked = error instanceof TokenError && error.isRevoked
    await markConnectionState(
      row.id,
      revoked ? "revoked" : "needs_reauth",
      error instanceof Error ? error.message : String(error)
    )
    return { ok: false, reason: revoked ? "revoked" : "needs_reauth" }
  }
}

/* ── Disconnecting ────────────────────────────────────────────────────────── */

/**
 * Tell the platform first, then forget locally.
 *
 * The order is deliberate and the failure is swallowed on purpose: if the
 * revoke call fails we still delete our row, because the alternative is a
 * person who pressed Disconnect and still has a live connection. A token we
 * failed to revoke expires on its own; a row we refused to delete does not.
 */
export async function disconnect(
  userId: string,
  channel: ConnectableChannel
): Promise<void> {
  const row = await getConnectionRow(userId, channel)

  if (!row) {
    return
  }

  if (channel === "x") {
    try {
      const c = config(channel)
      await fetch("https://api.x.com/2/oauth2/revoke", {
        method: "POST",
        headers: authHeaders(c),
        body: new URLSearchParams({
          token: await symmetricDecrypt({
            key: encryptionKey(),
            data: row.accessToken,
          }),
          client_id: c.clientId!,
          token_type_hint: "access_token",
        }),
        signal: AbortSignal.timeout(PLATFORM_TIMEOUT_MS),
      })
    } catch (error) {
      console.error(
        "[channels] X revoke failed, deleting locally anyway",
        error
      )
    }
  }

  // LinkedIn has no revoke endpoint on the self-serve path. The person can
  // remove us at Settings & Privacy → Data Privacy → Permitted Services, and
  // the daily cron notices when they do.

  // Deleted by (user, channel) rather than by the single row we just revoked.
  // The unique index should mean these are the same set — this is the belt to
  // its braces, because the one thing this function must never do is report a
  // disconnection it did not perform. A credential left behind here is one
  // that can still post in someone's name.
  await db
    .delete(channelConnection)
    .where(
      and(
        eq(channelConnection.userId, userId),
        eq(channelConnection.channel, channel)
      )
    )
}
