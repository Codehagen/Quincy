import { createHmac } from "node:crypto"

import type { PublishResult } from "./publisher"

/**
 * Instagram, as a channel beside X and LinkedIn.
 *
 * New Meta apps do not offer "API setup with Instagram login". They offer
 * API setup with Unified login, which is Facebook Login for Business: one
 * configuration id, the Meta app id and secret, and a system-user token on
 * graph.facebook.com. There is no separate Instagram app id.
 *
 * The dialog is still one redirect. The person signs in, picks a business
 * portfolio, and shares one Instagram professional account. We store that
 * account. A Page is not required, and we do not send a scope list — the
 * configuration is the scope list, and sending `scope` is what new apps
 * reject.
 *
 * A system-user token configured to never expire has no refresh grant. A
 * missing `expires_in` is that case, not a token we forgot to extend.
 *
 * The timeout matches `PLATFORM_TIMEOUT_MS` in lib/channels.ts. It lives
 * here so this file does not import that one: channels.ts imports this.
 */

const TIMEOUT_MS = 10_000

/**
 * What the Facebook Login for Business configuration must grant.
 *
 * These are not the Instagram Login names (`instagram_business_*`). Unified
 * login's supported list is the `instagram_*` set. The code does not send
 * them; the dashboard configuration does.
 */
export const INSTAGRAM_CONFIG_PERMISSIONS = [
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
] as const

/** Meta's published caption ceiling. Also `CHANNEL_RULES.instagram.limit`. */
export const INSTAGRAM_HASHTAG_LIMIT = 30
export const INSTAGRAM_MENTION_LIMIT = 20

/**
 * Under the platform's 100 API-published posts per rolling day, so a bug
 * cannot spend the whole allowance. Containers are capped at 400; this
 * number is inside both.
 */
export const INSTAGRAM_DAILY_CAP = 25

/**
 * How often a person can press Post now on Instagram.
 *
 * The same ten minutes as `MANUAL_RUN_COOLDOWN_MS`. The scheduled sweep
 * does not use it: two slots an hour apart are an instruction, not a mash.
 * A claim is not this — a claim ends when the call ends, and Post now on
 * the next draft would otherwise go out immediately.
 */
export const INSTAGRAM_MANUAL_COOLDOWN_MS = 10 * 60 * 1000

const GRAPH_HOST = "https://graph.facebook.com"
const STATUS_WAIT_MS = 400
const STATUS_TRIES = 2

export function instagramGraphVersion(
  env: Record<string, string | undefined> = process.env
): string {
  const version = env.META_GRAPH_VERSION?.trim()
  return version && /^v\d+\.\d+$/.test(version) ? version : "v25.0"
}

function graph(
  path: string,
  env: Record<string, string | undefined> = process.env
): string {
  const suffix = path.startsWith("/") ? path : `/${path}`
  return `${GRAPH_HOST}/${instagramGraphVersion(env)}${suffix}`
}

/** Proof that a server call was made with the app secret. Omitted when the secret is unset. */
function withProof(
  url: string,
  accessToken: string,
  env: Record<string, string | undefined>
): string {
  const secret = env.META_APP_SECRET
  if (!secret) return url
  const signed = new URL(url)
  signed.searchParams.set(
    "appsecret_proof",
    createHmac("sha256", secret).update(accessToken).digest("hex")
  )
  return signed.toString()
}

/** Meta appends `#_` to the redirect. The fragment never reaches us; a proxy that folds it into the query does. */
export function stripAuthorizationCode(code: string): string {
  return code.replace(/#_$/, "").replace(/#$/, "")
}

export function grantLooksRevoked(body: string): boolean {
  return body.includes("invalid_grant") || /"code"\s*:\s*190\b/.test(body)
}

export class InstagramTokenError extends Error {
  readonly body: string

  constructor(message: string, body: string) {
    super(message)
    this.name = "InstagramTokenError"
    this.body = body
  }

  get isRevoked(): boolean {
    return grantLooksRevoked(this.body)
  }
}

/**
 * The consent screen shared no account, or more than one.
 *
 * Quincy stores one Instagram account per person. The Meta dialog is the
 * picker; we do not add a second one.
 */
export class InstagramConnectError extends Error {
  readonly code: "no_instagram_account" | "several_instagram_accounts"

  constructor(code: "no_instagram_account" | "several_instagram_accounts") {
    super(
      code === "no_instagram_account"
        ? "Instagram did not share a professional account."
        : "Instagram shared more than one account."
    )
    this.name = "InstagramConnectError"
    this.code = code
  }
}

export type SharedInstagramAccount = { id: string; username?: string }

/**
 * One shared account is the connection. None, or more than one, is a
 * refusal — including a single row that says another page exists.
 */
export function chooseInstagramAccount(
  accounts: SharedInstagramAccount[],
  more = false
): SharedInstagramAccount {
  const account = accounts[0]
  if (!account?.id) throw new InstagramConnectError("no_instagram_account")
  if (more || accounts.length > 1) {
    throw new InstagramConnectError("several_instagram_accounts")
  }
  return account
}

/**
 * The authorize URL for a system-user configuration.
 *
 * `config_id` replaces `scope`. `override_default_response_type` is required
 * so the dialog returns a code rather than a token in the fragment.
 */
export function instagramAuthorizeUrl({
  appId,
  configId,
  redirectUri,
  state,
  version = "v25.0",
}: {
  appId: string
  configId: string
  redirectUri: string
  state: string
  version?: string
}): string {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    config_id: configId,
    override_default_response_type: "true",
  })
  return `https://www.facebook.com/${version}/dialog/oauth?${params.toString()}`
}

export type InstagramTokens = {
  accessToken: string
  refreshToken: null
  expiresAt: Date | null
  scope: string | null
}

type FetchLike = typeof fetch

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null
}

/** The code exchange on graph.facebook.com. A missing expires_in is a non-expiring system-user token. */
export function readTokenResponse(payload: unknown): {
  accessToken: string
  expiresAt: Date | null
} {
  const root = asRecord(payload)
  const accessToken = root?.access_token
  if (typeof accessToken !== "string" || !accessToken) {
    throw new Error("Instagram token response contained no access_token.")
  }
  const expiresIn = root?.expires_in
  return {
    accessToken,
    expiresAt:
      typeof expiresIn === "number" && expiresIn > 0
        ? new Date(Date.now() + expiresIn * 1000)
        : null,
  }
}

async function readBody(response: Response): Promise<string> {
  return response.text()
}

/**
 * Exchange the code for the system-user token, then read which permissions
 * were actually granted. A permissions failure does not fail the connect —
 * the token is the credential, and a later call is what proves a missing grant.
 */
export async function exchangeInstagramCode({
  code,
  redirectUri,
  clientId,
  clientSecret,
  fetchImpl = fetch,
  env = process.env,
}: {
  code: string
  redirectUri: string
  clientId: string
  clientSecret: string
  fetchImpl?: FetchLike
  env?: Record<string, string | undefined>
}): Promise<InstagramTokens> {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code: stripAuthorizationCode(code),
  })
  const response = await fetchImpl(
    `${graph("/oauth/access_token", env)}?${params.toString()}`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) }
  )
  const body = await readBody(response)
  if (!response.ok) {
    throw new InstagramTokenError(
      `Instagram token request failed (${response.status}): ${body.slice(0, 300)}`,
      body
    )
  }
  let minted: ReturnType<typeof readTokenResponse>
  try {
    minted = readTokenResponse(JSON.parse(body))
  } catch (cause) {
    throw new Error(
      cause instanceof Error ? cause.message : "Instagram token response was not JSON."
    )
  }

  let scope: string | null = null
  try {
    const grants = await fetchImpl(
      withProof(`${graph("/me/permissions", env)}`, minted.accessToken, env),
      {
        headers: { Authorization: `Bearer ${minted.accessToken}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    )
    if (grants.ok) {
      const parsed = (await grants.json()) as {
        data?: { permission?: string; status?: string }[]
      }
      const granted = (parsed.data ?? [])
        .filter((entry) => entry.status === "granted" && entry.permission)
        .map((entry) => entry.permission as string)
      if (granted.length > 0) scope = granted.join(" ")
    }
  } catch {
    scope = null
  }

  return {
    accessToken: minted.accessToken,
    refreshToken: null,
    expiresAt: minted.expiresAt,
    scope,
  }
}

export type InstagramProfile = {
  externalId: string
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
  /**
   * App-scoped Facebook user id from `GET /me`. This is the id Meta puts
   * in a data-deletion `signed_request`, and it is not `externalId`. Null
   * when that call fails: connect still proceeds, and the callback cannot
   * find the row until a later connect stores one.
   */
  metaUserId: string | null
}

async function graphGet(
  path: string,
  accessToken: string,
  fetchImpl: FetchLike,
  env: Record<string, string | undefined>
): Promise<{ ok: boolean; status: number; body: string; json: Record<string, unknown> | null }> {
  const response = await fetchImpl(withProof(graph(path, env), accessToken, env), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const body = await readBody(response)
  let json: Record<string, unknown> | null = null
  try {
    json = asRecord(JSON.parse(body))
  } catch {
    json = null
  }
  return { ok: response.ok, status: response.status, body, json }
}

export async function fetchInstagramProfile(
  accessToken: string,
  fetchImpl: FetchLike = fetch,
  env: Record<string, string | undefined> = process.env
): Promise<InstagramProfile> {
  const listed = await graphGet(
    "/me/assigned_instagram_accounts?fields=id,username&limit=2",
    accessToken,
    fetchImpl,
    env
  )
  if (!listed.ok) {
    throw new Error(
      `Instagram account lookup failed (${listed.status}): ${listed.body.slice(0, 200)}`
    )
  }
  const data = Array.isArray(listed.json?.data) ? listed.json.data : []
  const accounts = data.flatMap((entry) => {
    const row = asRecord(entry)
    return typeof row?.id === "string" ? [{ id: row.id, username: typeof row.username === "string" ? row.username : undefined }] : []
  })
  // `limit=2` is the whole question: zero, one, or more than one. A cursor
  // left on a final page of one is not a second account.
  const chosen = chooseInstagramAccount(accounts, accounts.length > 1)

  const profile = await graphGet(
    `/${chosen.id}?fields=id,username,name,profile_picture_url`,
    accessToken,
    fetchImpl,
    env
  )
  if (!profile.ok) {
    throw new Error(
      `Instagram profile lookup failed (${profile.status}): ${profile.body.slice(0, 200)}`
    )
  }
  const username = typeof profile.json?.username === "string" ? profile.json.username : chosen.username
  const name = typeof profile.json?.name === "string" ? profile.json.name : null
  const picture = typeof profile.json?.profile_picture_url === "string" ? profile.json.profile_picture_url : null
  return {
    externalId: chosen.id,
    handle: username ? `@${username.replace(/^@/, "")}` : null,
    displayName: name ?? username ?? null,
    avatarUrl: picture,
    metaUserId: await readMetaUserId(accessToken, fetchImpl, env),
  }
}

/**
 * The person who signed in, not the Instagram account they shared.
 *
 * A failed lookup does not fail the connect. Publishing needs the
 * professional account id; the deletion callback needs this one, and a
 * missing value means that later request finds no row rather than that
 * the connection itself is refused.
 */
async function readMetaUserId(
  accessToken: string,
  fetchImpl: FetchLike,
  env: Record<string, string | undefined>
): Promise<string | null> {
  try {
    const me = await graphGet("/me?fields=id", accessToken, fetchImpl, env)
    const id = me.json?.id
    const asString =
      typeof id === "string" ? id : typeof id === "number" ? String(id) : ""
    return me.ok && /^\d{1,32}$/.test(asString) ? asString : null
  } catch {
    return null
  }
}

export type Liveness =
  | { live: true }
  | { live: false; status: number; body: string }
  | { live: "unknown"; error: string }

export async function probeInstagram(
  accessToken: string,
  fetchImpl: FetchLike = fetch,
  env: NodeJS.ProcessEnv = process.env
): Promise<Liveness> {
  try {
    const response = await fetchImpl(withProof(`${graph("/me", env)}?fields=id`, accessToken, env), {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (response.ok) return { live: true }
    const body = (await response.text()).slice(0, 300)
    // 400 + code 190 is how an expired Instagram token reports itself.
    // Anything else at 400 is a bad request, not a withdrawn grant.
    if (
      response.status === 401 ||
      response.status === 403 ||
      (response.status === 400 && grantLooksRevoked(body))
    ) {
      return { live: false, status: response.status, body }
    }
    return {
      live: "unknown",
      error: `Instagram answered ${response.status}: ${body}`,
    }
  } catch (cause) {
    return {
      live: "unknown",
      error: cause instanceof Error ? cause.message : String(cause),
    }
  }
}

/** Best-effort. A failed revoke still deletes the local row. */
export async function revokeInstagram(
  accessToken: string,
  fetchImpl: FetchLike = fetch,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  await fetchImpl(withProof(graph("/me/permissions", env), accessToken, env), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
}

const HASHTAG = /#[\p{L}\p{N}_]+/gu
const MENTION = /@[\w.]+/g

export function countHashtags(text: string): number {
  HASHTAG.lastIndex = 0
  return text.match(HASHTAG)?.length ?? 0
}

export function countMentions(text: string): number {
  MENTION.lastIndex = 0
  return text.match(MENTION)?.length ?? 0
}

/** A problem the platform will reject, or null when the caption can be sent. */
export function captionProblem(text: string): string | null {
  const hashtags = countHashtags(text)
  if (hashtags > INSTAGRAM_HASHTAG_LIMIT) {
    return `The caption has ${hashtags} hashtags. Instagram stops at ${INSTAGRAM_HASHTAG_LIMIT}.`
  }
  const mentions = countMentions(text)
  if (mentions > INSTAGRAM_MENTION_LIMIT) {
    return `The caption has ${mentions} @mentions. Instagram stops at ${INSTAGRAM_MENTION_LIMIT}.`
  }
  return null
}

export function instagramCardPath(postId: string): string {
  return `/api/media/instagram/${postId}.jpg`
}

export function postIdFromCardFile(file: string): string | null {
  const match = /^sch_[0-9a-f]{24}\.jpg$/.exec(file)
  return match ? file.slice(0, -".jpg".length) : null
}

function isPublicHttps(url: URL): boolean {
  if (url.protocol !== "https:") return false
  const host = url.hostname.toLowerCase()
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0"
  ) {
    return false
  }
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) return false
  return true
}

/**
 * The URL Meta's servers will fetch. Null when this deployment is not on
 * the public internet — a localhost card is a publish that fails after we
 * have already created a container.
 */
export function publicInstagramImageUrl(
  postId: string,
  env: Record<string, string | undefined> = process.env
): string | null {
  const origin = env.BETTER_AUTH_URL?.replace(/\/$/, "")
  if (!origin) return null
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return null
  }
  if (!isPublicHttps(url)) return null
  return `${origin}${instagramCardPath(postId)}`
}

/** Milliseconds of cooldown still to wait. Zero means Post now may proceed. */
export function instagramManualWait(lastAt: Date | null, now: Date): number {
  if (!lastAt) return 0
  const left = INSTAGRAM_MANUAL_COOLDOWN_MS - (now.getTime() - lastAt.getTime())
  return left > 0 ? left : 0
}

export function overInstagramDailyCap(alreadyOut: number): boolean {
  return alreadyOut >= INSTAGRAM_DAILY_CAP
}

function altText(caption: string): string {
  const chars = [...caption]
  return chars.length <= 1000 ? caption : chars.slice(0, 1000).join("")
}

async function jsonOrText(response: Response): Promise<{
  ok: boolean
  status: number
  body: string
  json: Record<string, unknown> | null
}> {
  const body = await response.text()
  let json: Record<string, unknown> | null = null
  try {
    const parsed = JSON.parse(body) as unknown
    json = asRecord(parsed)
  } catch {
    json = null
  }
  return { ok: response.ok, status: response.status, body, json }
}

function refused(status: number, body: string): PublishResult {
  const reason = grantLooksRevoked(body)
    ? "needs_reauth"
    : status === 401
      ? "needs_reauth"
      : status === 429
        ? "rate-limited"
        : "rejected"
  return {
    ok: false,
    reason,
    message: `Instagram refused the post (${status}): ${body.slice(0, 300)}`,
  }
}

/**
 * Container, then publish.
 *
 * An image container is often `FINISHED` immediately. One extra look, after
 * a short wait, covers the case where it is not. Stopping there — rather
 * than polling for a minute — keeps a stuck container from holding the
 * sweep. Nothing has been published until `media_publish` answers, so a
 * timeout here is a refusal the person can retry, not an unconfirmed post.
 */
export async function publishInstagramImage({
  igUserId,
  accessToken,
  caption,
  imageUrl,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  env = process.env,
}: {
  igUserId: string
  accessToken: string
  caption: string
  imageUrl: string
  fetchImpl?: FetchLike
  sleep?: (ms: number) => Promise<void>
  env?: NodeJS.ProcessEnv
}): Promise<PublishResult> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  }
  const created = await jsonOrText(
    await fetchImpl(withProof(graph(`/${igUserId}/media`, env), accessToken, env), {
      method: "POST",
      headers,
      body: JSON.stringify({
        image_url: imageUrl,
        caption,
        alt_text: altText(caption),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  )
  if (!created.ok) return refused(created.status, created.body)
  const containerId = created.json?.id
  if (typeof containerId !== "string" || !containerId) {
    return {
      ok: false,
      reason: "rejected",
      message:
        "Instagram did not return a container id, so nothing was published.",
    }
  }

  let status = ""
  for (let attempt = 0; attempt < STATUS_TRIES; attempt++) {
    if (attempt > 0) await sleep(STATUS_WAIT_MS)
    const check = await jsonOrText(
      await fetchImpl(withProof(`${graph(`/${containerId}`, env)}?fields=status_code`, accessToken, env), {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    )
    if (!check.ok) return refused(check.status, check.body)
    status =
      typeof check.json?.status_code === "string" ? check.json.status_code : ""
    if (status === "FINISHED") break
    if (status === "ERROR" || status === "EXPIRED") {
      return {
        ok: false,
        reason: "rejected",
        message: `Instagram could not prepare the image (${status}). Nothing was published.`,
      }
    }
  }
  if (status !== "FINISHED") {
    return {
      ok: false,
      reason: "rejected",
      message:
        "Instagram had not finished the image yet. Nothing was published — try again.",
    }
  }

  const published = await jsonOrText(
    await fetchImpl(withProof(graph(`/${igUserId}/media_publish`, env), accessToken, env), {
      method: "POST",
      headers,
      body: JSON.stringify({ creation_id: containerId }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  )
  if (!published.ok) return refused(published.status, published.body)
  const mediaId = published.json?.id
  if (typeof mediaId !== "string" || !mediaId) {
    return {
      ok: false,
      reason: "unconfirmed",
      message:
        "Instagram accepted the publish but returned no id. The post has most likely gone out — check the account before retrying.",
    }
  }

  const link = await jsonOrText(
    await fetchImpl(withProof(`${graph(`/${mediaId}`, env)}?fields=permalink`, accessToken, env), {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  )
  const permalink = link.json?.permalink
  return {
    ok: true,
    externalId: mediaId,
    url:
      typeof permalink === "string" && permalink
        ? permalink
        : "https://www.instagram.com/",
  }
}

export type InsightCounts = {
  impressions: number
  likes: number
  replies: number
  reposts: number
  bookmarks: number
  quotes: number
}

function insightValue(entry: Record<string, unknown>): number | null {
  const total = asRecord(entry.total_value)
  if (
    typeof total?.value === "number" &&
    Number.isFinite(total.value) &&
    total.value >= 0
  ) {
    return total.value
  }
  const values = entry.values
  if (!Array.isArray(values)) return null
  const first = asRecord(values[0])
  const value = first?.value
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null
}

/**
 * One media object's insights, mapped onto the columns `post_metric` already
 * has. `views` is the impression count: Meta retired `impressions`.
 * Shares stand in for reposts, saves for bookmarks. There is no quote
 * count, and a missing metric stays 0 — the same rule as an X field the
 * payload did not carry.
 */
export function insightsFromPayload(payload: unknown): InsightCounts | null {
  const root = asRecord(payload)
  if (!Array.isArray(root?.data)) return null
  const byName = new Map<string, number>()
  for (const entry of root.data) {
    const row = asRecord(entry)
    if (!row || typeof row.name !== "string") continue
    const value = insightValue(row)
    if (value !== null) byName.set(row.name, value)
  }
  if (byName.size === 0) return null
  return {
    impressions: byName.get("views") ?? byName.get("reach") ?? 0,
    likes: byName.get("likes") ?? 0,
    replies: byName.get("comments") ?? 0,
    reposts: byName.get("shares") ?? 0,
    bookmarks: byName.get("saved") ?? 0,
    quotes: 0,
  }
}

/** Posts measured per connection per run. One call each, no second page. */
export const INSTAGRAM_METRICS_CAP = 25

export async function fetchInstagramInsights(
  mediaId: string,
  accessToken: string,
  fetchImpl: FetchLike = fetch,
  env: NodeJS.ProcessEnv = process.env
): Promise<
  | { ok: true; counts: InsightCounts }
  | { ok: false; status: number; body: string }
> {
  const metric = "views,likes,comments,shares,saved,reach"
  const response = await fetchImpl(
    withProof(`${graph(`/${mediaId}/insights`, env)}?metric=${metric}`, accessToken, env),
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }
  )
  const body = await response.text()
  if (!response.ok)
    return { ok: false, status: response.status, body: body.slice(0, 300) }
  try {
    const counts = insightsFromPayload(JSON.parse(body))
    if (!counts)
      return { ok: false, status: response.status, body: "no insight values" }
    return { ok: true, counts }
  } catch {
    return {
      ok: false,
      status: response.status,
      body: "insights were not JSON",
    }
  }
}
