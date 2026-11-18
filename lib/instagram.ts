import type { PublishResult } from "./publisher"

/**
 * Instagram, as a channel beside X and LinkedIn.
 *
 * Login is Instagram API with Instagram Login (Business Login), not
 * Facebook Login. Quincy's connect round-trip is one account and one
 * redirect. Facebook Login would add a Page picker and a second id, and
 * nothing else in this codebase has a place to put either.
 *
 * A long-lived token lasts about 60 days and is refreshed by sending the
 * access token back — there is no refresh_token. The secret on the
 * short-to-long exchange travels in the query string, which is why this
 * file owns that call instead of the shared form-body helper.
 *
 * The timeout matches `PLATFORM_TIMEOUT_MS` in lib/channels.ts. It lives
 * here so this file does not import that one: channels.ts imports this.
 */

const TIMEOUT_MS = 10_000

export const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_insights",
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

const GRAPH_HOST = "https://graph.instagram.com"
const STATUS_WAIT_MS = 400
const STATUS_TRIES = 2

export function instagramGraphVersion(
  env: NodeJS.ProcessEnv = process.env
): string {
  const version = env.INSTAGRAM_GRAPH_VERSION?.trim()
  return version && /^v\d+\.\d+$/.test(version) ? version : "v22.0"
}

function graph(path: string, env?: NodeJS.ProcessEnv): string {
  const suffix = path.startsWith("/") ? path : `/${path}`
  return `${GRAPH_HOST}/${instagramGraphVersion(env)}${suffix}`
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

/** A personal Instagram account cannot publish. Said so the callback can name it. */
export class InstagramAccountError extends Error {
  readonly code = "not_professional" as const

  constructor() {
    super(
      "Instagram connected a personal account. Publishing needs a professional account — Business or Creator."
    )
    this.name = "InstagramAccountError"
  }
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

/**
 * The short-lived response is `{ data: [{ access_token, user_id, permissions }] }`.
 * A flat body is accepted too — older samples returned one.
 */
export function readShortLived(payload: unknown): {
  accessToken: string
  scope: string | null
} {
  const root = asRecord(payload)
  const row = Array.isArray(root?.data) ? asRecord(root.data[0]) : root
  const accessToken = row?.access_token
  if (typeof accessToken !== "string" || !accessToken) {
    throw new Error("Instagram token response contained no access_token.")
  }
  const permissions = row?.permissions
  const scope =
    typeof permissions === "string"
      ? permissions
          .split(/[\s,]+/)
          .filter(Boolean)
          .join(" ")
      : null
  return { accessToken, scope }
}

function readLongLived(
  payload: unknown,
  fallbackScope: string | null
): InstagramTokens {
  const root = asRecord(payload)
  const accessToken = root?.access_token
  if (typeof accessToken !== "string" || !accessToken) {
    throw new Error(
      "Instagram long-lived token response contained no access_token."
    )
  }
  const expiresIn = root?.expires_in
  return {
    accessToken,
    refreshToken: null,
    expiresAt:
      typeof expiresIn === "number"
        ? new Date(Date.now() + expiresIn * 1000)
        : null,
    scope: fallbackScope,
  }
}

async function readBody(response: Response): Promise<string> {
  return response.text()
}

/**
 * Code for a short-lived token, then that token for a 60-day one.
 *
 * The short-lived token is not what we store. It dies in an hour, and a
 * connection that looks connected and cannot post tomorrow is worse than
 * a connect that fails in front of the person.
 */
export async function exchangeInstagramCode({
  code,
  redirectUri,
  clientId,
  clientSecret,
  fetchImpl = fetch,
}: {
  code: string
  redirectUri: string
  clientId: string
  clientSecret: string
  fetchImpl?: FetchLike
}): Promise<InstagramTokens> {
  const form = new FormData()
  form.set("client_id", clientId)
  form.set("client_secret", clientSecret)
  form.set("grant_type", "authorization_code")
  form.set("redirect_uri", redirectUri)
  form.set("code", stripAuthorizationCode(code))

  const short = await fetchImpl(
    "https://api.instagram.com/oauth/access_token",
    {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }
  )
  const shortBody = await readBody(short)
  if (!short.ok) {
    throw new InstagramTokenError(
      `Instagram token request failed (${short.status}): ${shortBody.slice(0, 300)}`,
      shortBody
    )
  }

  let shortJson: unknown
  try {
    shortJson = JSON.parse(shortBody)
  } catch {
    throw new Error("Instagram token response was not JSON.")
  }
  const minted = readShortLived(shortJson)

  const params = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: clientSecret,
    access_token: minted.accessToken,
  })
  const long = await fetchImpl(
    `https://graph.instagram.com/access_token?${params.toString()}`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) }
  )
  const longBody = await readBody(long)
  if (!long.ok) {
    throw new InstagramTokenError(
      `Instagram long-lived token exchange failed (${long.status}): ${longBody.slice(0, 300)}`,
      longBody
    )
  }
  try {
    return readLongLived(JSON.parse(longBody), minted.scope)
  } catch (cause) {
    throw new Error(
      cause instanceof Error
        ? cause.message
        : "Instagram long-lived token was unreadable."
    )
  }
}

/** Refresh the long-lived token. It must be at least a day old and not yet expired. */
export async function refreshInstagramAccess(
  accessToken: string,
  fetchImpl: FetchLike = fetch
): Promise<InstagramTokens> {
  const params = new URLSearchParams({
    grant_type: "ig_refresh_token",
    access_token: accessToken,
  })
  const response = await fetchImpl(
    `https://graph.instagram.com/refresh_access_token?${params.toString()}`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) }
  )
  const body = await readBody(response)
  if (!response.ok) {
    throw new InstagramTokenError(
      `Instagram token refresh failed (${response.status}): ${body.slice(0, 300)}`,
      body
    )
  }
  try {
    return readLongLived(JSON.parse(body), null)
  } catch (cause) {
    throw new Error(
      cause instanceof Error
        ? cause.message
        : "Instagram refresh response was unreadable."
    )
  }
}

export type InstagramProfile = {
  externalId: string
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
}

export function isProfessionalAccount(accountType: unknown): boolean {
  return accountType === "BUSINESS" || accountType === "MEDIA_CREATOR"
}

export async function fetchInstagramProfile(
  accessToken: string,
  fetchImpl: FetchLike = fetch,
  env: NodeJS.ProcessEnv = process.env
): Promise<InstagramProfile> {
  const response = await fetchImpl(
    `${graph("/me", env)}?fields=user_id,username,name,profile_picture_url,account_type`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }
  )
  const body = await readBody(response)
  if (!response.ok) {
    throw new Error(
      `Instagram profile lookup failed (${response.status}): ${body.slice(0, 200)}`
    )
  }
  const profile = JSON.parse(body) as {
    user_id?: string
    id?: string
    username?: string
    name?: string
    profile_picture_url?: string
    account_type?: string
  }
  if (profile.account_type && !isProfessionalAccount(profile.account_type)) {
    throw new InstagramAccountError()
  }
  const externalId = profile.user_id ?? profile.id
  if (!externalId) throw new Error("Instagram returned no account id.")
  return {
    externalId,
    handle: profile.username ? `@${profile.username.replace(/^@/, "")}` : null,
    displayName: profile.name ?? profile.username ?? null,
    avatarUrl: profile.profile_picture_url ?? null,
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
    const response = await fetchImpl(`${graph("/me", env)}?fields=user_id`, {
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
  await fetchImpl(graph("/me/permissions", env), {
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
    await fetchImpl(graph(`/${igUserId}/media`, env), {
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
      await fetchImpl(`${graph(`/${containerId}`, env)}?fields=status_code`, {
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
    await fetchImpl(graph(`/${igUserId}/media_publish`, env), {
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
    await fetchImpl(`${graph(`/${mediaId}`, env)}?fields=permalink`, {
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
    `${graph(`/${mediaId}/insights`, env)}?metric=${metric}`,
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
