import { randomBytes } from "node:crypto"
import { createIdGenerator } from "ai"
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto"
import { and, desc, eq, sql } from "drizzle-orm"

import { db } from "./db"
import {
  brainPage,
  sourceConnection,
  sourceItem,
  usageEvent,
} from "./schema-app"
import { markBroken, recordArrival } from "./source-connections"
import {
  isOpenQuestion,
  readShippedQuestion,
  type ShippedQuestion,
} from "./shipped-work"
import { MAX_ANSWER_CHARS } from "./shipped-outcome"
import { coveredThemes, themePattern, THEMES } from "./story-gaps"
import { hhmmIn, resolveTimeZone } from "./timezone"
import { user } from "./schema"

/**
 * The calendar, read and never written. See plans/027, 4d.
 *
 * **What is stored, per event, and nothing else:** the event id, its title, its
 * start, its end, how many people were invited, and whether the owner organised
 * it. That is the whole row.
 *
 * **What is never stored:** attendee names, attendee email addresses, the
 * description, the location, the conferencing link, the response statuses, the
 * organiser's address, and the calendar's other events. The description is read
 * — once, in memory, to decide whether the meeting touches a story the owner
 * keeps — and is dropped with the response. Nothing else in the product can
 * reach it, because nothing else in the product ever holds it.
 *
 * **Read-only, structurally.** The grant asked for is
 * `calendar.events.readonly`, which cannot create, move, cancel or respond to
 * anything; there is no code path here that issues a write to Google, and the
 * scope means one could not be added by accident. Quincy does not appear on
 * anybody's invitation, and the people in the room never learn it read the
 * title.
 *
 * What it buys is one question. A meeting that ended in the last hour and whose
 * title touches a story the owner already keeps earns a single line on
 * /sources: *"You had 'Pricing call with Acme' at 14:00 and you keep a story
 * about pricing. What happened?"* The answer becomes a riff. Nothing drafts,
 * nothing schedules, nothing publishes.
 *
 * The restraint is the feature. docs/vision.md puts the scarce resource at
 * "original thought with a receipt attached — maybe two or three genuinely new
 * things to say in a week", and a calendar has thirty meetings in it. A source
 * that turned each into a prompt would be the backlog lib/story-gaps.ts already
 * refuses to build: one open question at a time, or nothing.
 *
 * **No model call anywhere in this file.** The match is a vocabulary and a
 * word count, so the hourly cron costs nothing but Google's quota — which is
 * metered anyway, at zero, because AGENTS.md is right that a ceiling nobody
 * can see is a ceiling nobody can check.
 */

const newConnectionId = createIdGenerator({ prefix: "sc", size: 16 })
const newItemId = createIdGenerator({ prefix: "si", size: 16 })

/* ── Names and endpoints ──────────────────────────────────────────────────
   Verified against Google's own reference on 2026-08-27, not from memory.
   ──────────────────────────────────────────────────────────────────────── */

/**
 * The value in `source_connection.source` and in `source_item.source`.
 *
 * `google-calendar` rather than `calendar`, matching the rule
 * `SOURCE_ITEM_SOURCES` already follows for `hacker-news` and `github-repo`:
 * the platform is named, so a second calendar provider later is a second value
 * rather than an ambiguity inside one namespace.
 */
export const CALENDAR_SOURCE = "google-calendar" as const

/**
 * The one scope, quoted exactly.
 *
 * `https://www.googleapis.com/auth/calendar.events.readonly` — "View events on
 * all your calendars". The narrowest scope that can answer "what did you have
 * on at two o'clock", and narrower than `calendar.readonly`, which would also
 * hand over the calendar list and its settings. `calendar.events` is the same
 * read plus every write, and asking for a write we will never make is how a
 * consent screen stops being believed.
 *
 * Frozen for the reason `ChannelConfig.scopes` gives: adding one invalidates
 * every grant issued before it and sends everybody back through consent.
 */
export const CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.readonly"

const AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const TOKEN_URL = "https://oauth2.googleapis.com/token"
const REVOKE_URL = "https://oauth2.googleapis.com/revoke"
const EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events"

/** The same bound lib/channels.ts puts on every platform call, and for the
 *  same reason: a hung socket must not eat a sequential cron's whole budget. */
const CALENDAR_TIMEOUT_MS = 10_000

export const CALENDAR_COOKIE = "quincy_calendar_connect"

/** The round trip is a redirect and back. Ten minutes is generous. */
export const CALENDAR_COOKIE_MAX_AGE = 600

/* ── The ceiling, and the cooldown ────────────────────────────────────────
   Both, not either — AGENTS.md "Money". Nobody triggers this, which is exactly
   why it needs the second one: Vercel Cron fires at-least-once and a redeploy
   can replay a schedule.
   ──────────────────────────────────────────────────────────────────────── */

/**
 * How far back one run looks: sixty minutes, matching the hourly schedule.
 *
 * The window is the *schedule*, not a preference. A longer one would re-read
 * meetings a previous run already stored — free at Google and not free here,
 * because every re-read is another chance to ask about an afternoon that has
 * already passed. A shorter one would drop meetings that ended in the gap.
 */
export const CALENDAR_WINDOW_MS = 60 * 60 * 1000

/**
 * The ceiling, and it counts the thing being *bought* rather than the thing
 * being kept — the distinction AGENTS.md draws.
 *
 * One page of at most fifty events per user per run, and there is no
 * pagination loop in this file for a `nextPageToken` to unroll. Fifty meetings
 * inside one hour is not a calendar, it is a synchronisation bug, and the
 * honest answer to one is to read fifty and stop.
 */
export const CALENDAR_PAGE_SIZE = 50

/**
 * The cooldown, on the connection rather than on a person, stored as
 * `meta.lastReadAt` and claimed by a conditional UPDATE.
 *
 * Fifty minutes rather than sixty so an hourly schedule that drifts a few
 * minutes later each run never skips a whole hour — the same reasoning
 * `METRICS_COOLDOWN_MS` uses for twenty hours against a daily job.
 */
export const CALENDAR_COOLDOWN_MS = 50 * 60 * 1000

/**
 * And the aggregate one. The route dies at 300 seconds and the loop is
 * sequential; an unbounded query does not mean "read everybody", it means
 * "read an unpredictable prefix".
 */
export const MAX_USERS_PER_RUN = 50

/**
 * The meter label. Non-model spend uses `usage_event.model` as a label so
 * /credits can say where the quota went, the same stretch `x:read`,
 * `x:metrics` and `github:read` already make.
 *
 * **The money is zero and the row is written anyway.** What this path spends
 * is Google's per-project quota, and a quota nobody can see is a ceiling
 * nobody can check.
 */
export const CALENDAR_READ_LABEL = "calendar:read"

/* ── OAuth ────────────────────────────────────────────────────────────────
   Deliberately not lib/channels.ts. That module is shaped by publishing — it
   keys on `ConnectableChannel`, mints starter slots on connect, and its
   `SafeConnection` names columns this table does not have. A read-only source
   that never publishes borrows its *discipline* (one encryption primitive, one
   decrypting function, a result rather than a throw) and none of its shape.
   ──────────────────────────────────────────────────────────────────────── */

export function isCalendarEnabled(): boolean {
  return Boolean(
    process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim()
  )
}

function baseUrl(): string {
  const url = process.env.BETTER_AUTH_URL
  if (!url) {
    throw new Error(
      "BETTER_AUTH_URL is not set. The OAuth redirect URI is derived from it, " +
        "and a mismatch with the registered callback fails the exchange."
    )
  }
  return url.replace(/\/$/, "")
}

export function calendarRedirectUri(): string {
  return `${baseUrl()}/api/connect/google-calendar/callback`
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url")
}

export function randomCalendarToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)))
}

/** S256. `plain` is in Google's spec and puts the verifier on the wire, which
 *  is the one thing PKCE exists to prevent. */
async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  )
  return base64url(new Uint8Array(digest))
}

export type CalendarHandshake = { state: string; codeVerifier: string }

/**
 * The consent URL, plus the secrets the callback needs to finish.
 *
 * Three parameters here are load-bearing and none is decoration:
 *
 * - **`access_type=offline`** is the only thing that yields a refresh token.
 *   Without it the grant dies in an hour and an hourly cron has nothing to
 *   read with.
 * - **`prompt=consent`** because Google issues a refresh token on the *first*
 *   authorization only. Somebody who disconnects and reconnects would
 *   otherwise come back with an access token and no refresh token, and the
 *   connection would work for one hour and then look broken for no reason
 *   anybody could see.
 * - **PKCE**, S256, on a flow that also has a client secret. Google's
 *   authorization endpoint accepts `code_challenge` and the belt costs one
 *   hash; a stolen code with no verifier is worthless.
 *
 * The handshake goes in an httpOnly cookie rather than the database, for the
 * reason lib/channels.ts gives: short-lived, scoped to one browser, and a row
 * would need its own sweep for abandoned flows.
 */
export async function beginCalendarConnect(): Promise<{
  url: string
  handshake: CalendarHandshake
}> {
  if (!isCalendarEnabled()) {
    throw new Error("Google Calendar is not configured.")
  }

  const state = randomCalendarToken()
  const codeVerifier = randomCalendarToken()

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
    redirect_uri: calendarRedirectUri(),
    scope: CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: await codeChallenge(codeVerifier),
    code_challenge_method: "S256",
  })

  return {
    url: `${AUTHORIZATION_URL}?${params.toString()}`,
    handshake: { state, codeVerifier },
  }
}

export type CalendarTokens = {
  accessToken: string
  /** Null on a refresh, which Google does not rotate. */
  refreshToken: string | null
  expiresAt: Date | null
}

/**
 * A token response, parsed defensively.
 *
 * Google answers 200 with a body rather than a status for some failures, so
 * the absence of `access_token` is treated as a failure here rather than
 * asserted away downstream.
 */
function parseTokens(payload: Record<string, unknown>): CalendarTokens {
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
  }
}

async function postToken(
  body: URLSearchParams,
  fetchImpl: typeof fetch = fetch
): Promise<CalendarTokens> {
  body.set("client_id", process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "")
  body.set("client_secret", process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? "")

  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(CALENDAR_TIMEOUT_MS),
  })

  const text = await response.text()

  if (!response.ok) {
    // The body carries the OAuth error code — `invalid_grant` is "the person
    // removed us", and the sweep branches on it.
    throw new CalendarTokenError(
      `Google token request failed (${response.status}): ${text.slice(0, 300)}`,
      text
    )
  }

  return parseTokens(JSON.parse(text) as Record<string, unknown>)
}

export class CalendarTokenError extends Error {
  readonly body: string

  constructor(message: string, body: string) {
    super(message)
    this.name = "CalendarTokenError"
    this.body = body
  }

  /** The grant is gone — revoked at Google, or the refresh token expired. */
  get isRevoked(): boolean {
    return this.body.includes("invalid_grant")
  }
}

export async function exchangeCalendarCode(
  { code, codeVerifier }: { code: string; codeVerifier: string },
  fetchImpl: typeof fetch = fetch
): Promise<CalendarTokens> {
  return postToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: calendarRedirectUri(),
      code_verifier: codeVerifier,
    }),
    fetchImpl
  )
}

/**
 * An access token from the stored refresh token.
 *
 * **Nothing caches the access token**, and that is the decision rather than an
 * omission. It lives an hour, this job runs hourly, so a cached one is expired
 * on arrival every time — storing it would add a second credential at rest to
 * save a request that has to be made anyway.
 */
export async function refreshCalendarAccess(
  refreshToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<CalendarTokens> {
  return postToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    fetchImpl
  )
}

/**
 * Tell Google first, then forget locally — lib/channels.ts's `disconnect`
 * ordering, and the failure is swallowed for the same reason: a person who
 * pressed Disconnect and still has a live grant is the worse outcome. A token
 * we failed to revoke expires; a row we refused to delete does not.
 *
 * Revoking the refresh token revokes the access tokens minted from it, which
 * is why this is the one sent.
 */
export async function revokeCalendarToken(
  refreshToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  await fetchImpl(REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refreshToken }),
    signal: AbortSignal.timeout(CALENDAR_TIMEOUT_MS),
  })
}

/* ── Storage ──────────────────────────────────────────────────────────────── */

function encryptionKey(): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) {
    throw new Error(
      "BETTER_AUTH_SECRET is not set. The calendar refresh token is encrypted " +
        "with it, and storing one in the clear is not an acceptable fallback."
    )
  }
  return secret
}

/**
 * The refresh token lives in `signing_secret`, encrypted, and this is where
 * that decision is written down.
 *
 * `source_connection` has two places a value could go and only one of them is
 * allowed to hold a credential. lib/source-connections.ts says it plainly about
 * `meta`: "it holds the provider's own identifiers — an installation id, a
 * public login — and never a credential. If a provider ever needs a secret kept
 * per connection, that is `signing_secret` or a column of its own." `meta` is
 * also handed out by `toSafeSourceConnection`, so a token in there would reach
 * the browser.
 *
 * So: `signing_secret`, `symmetricEncrypt` from better-auth/crypto keyed off
 * `BETTER_AUTH_SECRET` — one key and one algorithm in the system rather than
 * two, the same primitive `channel_connection.access_token` and Circleback's
 * webhook secret already use. The column is nullable and its safe view exposes
 * only `verified: signingSecret !== null`, which reads correctly here too: a
 * calendar connection with no token is one that cannot read.
 *
 * A column of its own was the alternative and was refused: it is one database
 * that is also production (AGENTS.md), and a migration to hold a value an
 * existing encrypted column already fits is a schema change bought with a
 * production write.
 */
export async function saveCalendarConnection(input: {
  userId: string
  refreshToken: string
}): Promise<void> {
  const encrypted = await symmetricEncrypt({
    key: encryptionKey(),
    data: input.refreshToken,
  })

  const now = new Date()

  await db
    .insert(sourceConnection)
    .values({
      id: newConnectionId(),
      userId: input.userId,
      source: CALENDAR_SOURCE,
      /**
       * Random, and never used to route anything.
       *
       * The column is `not null` and globally unique because Circleback's
       * token appears in a webhook path. There is no inbound request here —
       * Quincy calls Google, never the other way round — so this is entropy
       * filling a required column rather than a credential, and it is
       * deliberately *not* derived from anything at Google (see
       * `githubInstallationToken`, which is derived precisely because a
       * delivery has to resolve by it).
       */
      token: `gcal_${randomBytes(24).toString("base64url")}`,
      signingSecret: encrypted,
      // `waiting`: connected, and no meeting has been read yet. lib/sources.ts
      // is explicit that this must not look like `arriving`.
      state: "waiting",
      meta: {},
    })
    .onConflictDoUpdate({
      target: [sourceConnection.userId, sourceConnection.source],
      set: {
        // The token column is deliberately absent: reconnecting is a new grant,
        // not a new row, and rotating a value nothing resolves by would be
        // churn. A reconnect *is* a repair, so the error state clears.
        signingSecret: encrypted,
        state: "waiting",
        lastErrorAt: null,
        lastError: null,
        updatedAt: now,
      },
    })
}

/**
 * The decrypted refresh token, or null.
 *
 * The only function in this module that decrypts, matching `getAccessToken`'s
 * discipline next door: everything user-facing goes through
 * `getSourceConnection`, whose safe view has no secret column on it at all.
 */
export async function readCalendarRefreshToken(
  userId: string
): Promise<string | null> {
  const [row] = await db
    .select({ signingSecret: sourceConnection.signingSecret })
    .from(sourceConnection)
    .where(
      and(
        eq(sourceConnection.userId, userId),
        eq(sourceConnection.source, CALENDAR_SOURCE)
      )
    )
    .limit(1)

  if (!row?.signingSecret) return null

  return symmetricDecrypt({ key: encryptionKey(), data: row.signingSecret })
}

/* ── The window ───────────────────────────────────────────────────────────── */

export type CalendarWindow = { timeMin: Date; timeMax: Date }

/**
 * The hour that just ended, as Google's two bounds.
 *
 * Google's semantics are the part worth stating, because they are not the
 * obvious ones: `timeMin` is an exclusive lower bound on an event's **end**,
 * and `timeMax` an exclusive upper bound on its **start**. So this pair asks
 * for "everything that overlapped the last hour" — which includes a meeting
 * still in progress, and `hasEnded` below is what drops those. Filtering at
 * Google is not possible; filtering here is.
 *
 * Absolute instants, not wall clocks. The window is a property of the
 * schedule, and a per-user zone here would mean two users' hours ending at
 * different moments for the same cron tick. The user's zone appears exactly
 * once, in `questionFor`, where the clock is being read back to them.
 */
export function calendarWindow(
  now: Date,
  windowMs: number = CALENDAR_WINDOW_MS
): CalendarWindow {
  return { timeMin: new Date(now.getTime() - windowMs), timeMax: now }
}

/* ── The event ────────────────────────────────────────────────────────────── */

/**
 * One meeting, as much of it as Quincy is allowed to know.
 *
 * `description` is on this type and is **not** on `StoredEvent` below. That
 * split is the privacy boundary made structural: the description exists for
 * the length of one match and cannot reach a row, because the row's type has
 * nowhere to put it.
 */
export type CalendarEvent = {
  eventId: string
  title: string
  /** Read for the match, dropped with the response. Never stored. */
  description: string
  startAt: Date
  endAt: Date
  /** A count. Never a name and never an address. */
  attendees: number
  /** Whether the owner called this meeting. */
  organised: boolean
}

/** What lands in `source_item.meta`. The whole of it. */
export type StoredEvent = {
  eventId: string
  startAt: string
  endAt: string
  attendees: number
  organised: boolean
}

/**
 * Event kinds that are not meetings, and are dropped before anything reads
 * them.
 *
 * Google marks these itself. A birthday, a focus-time block, an
 * out-of-office and a working-location entry all have titles that match themes
 * beautifully and none of them is a room somebody said something in. Asking
 * "what happened?" about a focus block is the question that teaches a person
 * to stop reading the questions.
 */
const NOT_A_MEETING = new Set([
  "birthday",
  "focusTime",
  "outOfOffice",
  "workingLocation",
])

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function asDate(value: unknown): Date | null {
  const raw = asString(value)
  if (!raw) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * One item from `events.list`, checked rather than asserted.
 *
 * Returns null for everything this feature has no use for, and each null is a
 * decision:
 *
 * - **No `dateTime`.** An all-day entry carries `date` instead, and an all-day
 *   entry did not end at a moment — "you had 'Conference' at 00:00" is a
 *   question about a clock nobody looked at.
 * - **`status: "cancelled"`.** A meeting that did not happen.
 * - **A kind Google says is not a meeting.** See `NOT_A_MEETING`.
 * - **No title.** The question is built out of the title; without one there is
 *   nothing to ask about.
 */
export function parseCalendarEvent(raw: unknown): CalendarEvent | null {
  if (!raw || typeof raw !== "object") return null

  const event = raw as Record<string, unknown>

  const eventId = asString(event.id)
  if (!eventId) return null

  if (asString(event.status) === "cancelled") return null

  const eventType = asString(event.eventType)
  if (eventType && NOT_A_MEETING.has(eventType)) return null

  const start = event.start as Record<string, unknown> | undefined
  const end = event.end as Record<string, unknown> | undefined

  const startAt = asDate(start?.dateTime)
  const endAt = asDate(end?.dateTime)
  if (!startAt || !endAt) return null

  const title = asString(event.summary).trim()
  if (!title) return null

  const organizer = event.organizer as Record<string, unknown> | undefined

  return {
    eventId,
    title,
    description: asString(event.description).trim(),
    startAt,
    endAt,
    // Length only. The array holds addresses, names and response statuses, and
    // this is the one number taken off it.
    attendees: Array.isArray(event.attendees) ? event.attendees.length : 0,
    organised: organizer?.self === true,
  }
}

/** Ended, rather than merely overlapping the window. See `calendarWindow`. */
export function hasEnded(event: CalendarEvent, now: Date): boolean {
  return event.endAt.getTime() <= now.getTime()
}

/**
 * The row's `meta`, built by naming what may be kept.
 *
 * Built additively rather than by deleting from the parsed event, the way
 * `toSafeConnection` is: a field added to `CalendarEvent` later is absent here
 * by default instead of leaking until somebody remembers to exclude it. That is
 * the whole guarantee this file makes about the description.
 */
export function storedEventFrom(event: CalendarEvent): StoredEvent {
  return {
    eventId: event.eventId,
    startAt: event.startAt.toISOString(),
    endAt: event.endAt.toISOString(),
    attendees: event.attendees,
    organised: event.organised,
  }
}

/* ── The match ────────────────────────────────────────────────────────────
   A meeting earns a question when it touches a story the owner already keeps.
   Not a gap — a story. lib/story-gaps.ts asks about what the bank is missing;
   this asks about what the bank already has and what just happened to it.
   ──────────────────────────────────────────────────────────────────────── */

export type StoryPage = { title: string; data: unknown }

export type ThemeMatch = {
  /** The word the question uses: "pricing", "open source". */
  theme: string
  /**
   * How it was found. `vocabulary` is a curated theme from lib/story-gaps.ts
   * that a story page covers; `overlap` is the story's own words.
   */
  via: "vocabulary" | "overlap"
  /** Words shared with the story. Two is the floor for `overlap`. */
  overlap: number
}

/**
 * Two shared words.
 *
 * One is a coincidence: every story mentions "the", most mention "product",
 * and a calendar full of "Product sync" would match all of them. Three is a
 * bar a two-word theme ("open source", "pricing") can never clear. Two is the
 * smallest number that requires the meeting and the story to be about the same
 * thing rather than about the same vocabulary.
 */
export const MIN_THEME_WORDS = 2

/**
 * Words too common to carry a match, plus the meeting-room vocabulary.
 *
 * The second half matters more than the first. "call", "sync", "meeting",
 * "weekly" and "1:1" appear in half of everybody's calendar and in the title of
 * any story about how a company runs, so leaving them in makes "Weekly sync"
 * match a story about weekly reviews on a word neither of them is about.
 */
const STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "your", "our", "about", "from", "that",
  "this", "what", "when", "how", "why", "was", "were", "has", "have", "had",
  "not", "but", "all", "any", "are", "its", "his", "her", "their", "them",
  "call", "calls", "sync", "meeting", "meet", "chat", "catch", "standup",
  "weekly", "monthly", "daily", "quarterly", "review", "session", "check",
  "intro", "kickoff", "followup", "follow", "quick", "team", "notes",
])

/**
 * Case-folded words, three characters or more, stopwords dropped.
 *
 * Unicode-aware on purpose: the owner's calendar is in Norwegian as often as
 * in English, and `\w` would cut "årsmøte" in half.
 *
 * Exported for the test.
 */
export function themeWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word))

  return new Set(words)
}

/**
 * The story's own subject, as words. Title, `theme` and `useFor`.
 *
 * `point`, `hook` and `quotes` are deliberately not read, for the reason
 * `coveredThemes` gives about the same fields: they are sentences, and a
 * sentence about shipping contains half the vocabulary in the bank. The three
 * fields here are the ones that say what a story is *for*.
 */
function storyWords(story: StoryPage): { theme: string; words: Set<string> } {
  const data = (story.data ?? {}) as { theme?: unknown; useFor?: unknown }
  const useFor = Array.isArray(data.useFor) ? data.useFor.join(" ") : ""
  const theme = typeof data.theme === "string" ? data.theme.trim() : ""

  return {
    theme: theme || story.title,
    words: themeWords(`${story.title} ${theme} ${useFor}`),
  }
}

/**
 * Does this meeting touch a story the owner keeps?
 *
 * Two rules, in order, and the first is why there are two.
 *
 * **The curated vocabulary first.** lib/story-gaps.ts already holds a table of
 * themes with their inflections — `pricing | price | prices | priced |
 * paywall` — and `coveredThemes` already answers "which of these does a story
 * page cover". A meeting called "Pricing call with Acme" shares *no* word with
 * a story titled "The day we tripled the price", so a bare word count misses
 * exactly the case this feature was specified with. Matching through the
 * vocabulary is what makes "pricing" and "price" the same subject.
 *
 * **Then the story's own words.** The vocabulary is finite by design, and a
 * theme not in it is one Quincy cannot recognise — so a plain case-folded
 * overlap against the story's title, theme and `useFor` catches the ones the
 * table has never heard of, at two words or more.
 *
 * Title and description together, because the title is often a room name and
 * the agenda is in the body. The description is read here and stored nowhere.
 */
export function matchStoryTheme(
  text: string,
  stories: StoryPage[]
): ThemeMatch | null {
  if (stories.length === 0) return null

  const covered = coveredThemes(stories)

  for (const theme of THEMES) {
    if (!covered.has(theme.id)) continue
    if (new RegExp(themePattern(theme, "\\b"), "i").test(text)) {
      return { theme: theme.id, via: "vocabulary", overlap: MIN_THEME_WORDS }
    }
  }

  const words = themeWords(text)
  let best: ThemeMatch | null = null

  for (const story of stories) {
    const subject = storyWords(story)
    let overlap = 0
    for (const word of subject.words) {
      if (words.has(word)) overlap += 1
    }

    if (overlap < MIN_THEME_WORDS) continue
    if (best && overlap <= best.overlap) continue

    best = { theme: subject.theme, via: "overlap", overlap }
  }

  return best
}

/* ── The question ─────────────────────────────────────────────────────────── */

/** Long enough to name the meeting and ask, short enough to be one sentence.
 *  The same bound `MAX_QUESTION_CHARS` puts on the merge question. */
export const MAX_CALENDAR_QUESTION_CHARS = 240

/**
 * "You had 'Pricing call with Acme' at 14:00 and you keep a story about
 * pricing. What happened?"
 *
 * Three specifics, all doing work: the title is how they find the hour again,
 * the clock is how they remember it, and the theme is why Quincy is asking
 * rather than being nosy. A generic "how did your meeting go" is the prompt
 * every tool in the field opens with and is answered by nobody.
 *
 * **The clock is theirs, not the server's** — `user.timezone` through
 * `resolveTimeZone`, the same read `shippedQuestionText` makes. A question
 * that says 12:00 about something somebody did at 14:00 is a question about
 * somebody else's day.
 *
 * Curly quotes around the title, matching the rest of the product's prose, and
 * because a straight quote inside a sentence that already has one reads as a
 * bug.
 */
export function questionFor(input: {
  title: string
  startAt: Date
  theme: string
  timezone: string | null | undefined
}): string {
  const when = hhmmIn(input.startAt, resolveTimeZone(input.timezone))

  return `You had “${input.title}” at ${when} and you keep a story about ${input.theme}. What happened?`.slice(
    0,
    MAX_CALENDAR_QUESTION_CHARS
  )
}

export type OpenCalendarQuestion = {
  sourceItemId: string
  question: ShippedQuestion
  /** The meeting's title, so the row can say what it is asking about. */
  about: string
}

/**
 * The calendar question waiting on this user, or null.
 *
 * The same shape as `openShippedQuestion` and deliberately a *separate*
 * ceiling: a merge question and a meeting question are about different work,
 * and collapsing them would mean a busy afternoon of merges silently ate the
 * one thing the calendar had to ask. Two open questions is the most anybody
 * can be holding, and each source can only ever hold one.
 *
 * The answer key is checked in SQL rather than in TypeScript so a user with a
 * hundred answered meetings does not pull a hundred rows across the wire.
 */
export async function openCalendarQuestion(
  userId: string
): Promise<OpenCalendarQuestion | null> {
  const [row] = await db
    .select({
      id: sourceItem.id,
      title: sourceItem.body,
      meta: sourceItem.meta,
    })
    .from(sourceItem)
    .where(
      and(
        eq(sourceItem.userId, userId),
        eq(sourceItem.source, CALENDAR_SOURCE),
        sql`${sourceItem.meta} ? 'question'`,
        sql`coalesce(${sourceItem.meta} -> 'question' ->> 'answer', '') = ''`
      )
    )
    .orderBy(desc(sourceItem.createdAt))
    .limit(1)

  if (!row) return null

  const question = readShippedQuestion(row.meta?.question)
  if (!question || !isOpenQuestion(question)) return null

  return { sourceItemId: row.id, question, about: row.title }
}

/**
 * The one question, written only when there is no other one open.
 *
 * **The ceiling is the product**, the same sentence `recordShippedQuestion`
 * carries: a page that asks about five meetings is a form, and a form is what
 * nobody fills in. The read before the write is safe to lose — the worst
 * outcome of a race is two questions.
 *
 * Returns false when it wrote nothing, so the run can count "asked" apart from
 * "already asking".
 */
export async function recordCalendarQuestion(input: {
  userId: string
  sourceItemId: string
  text: string
}): Promise<boolean> {
  if (!input.text) return false

  if (await openCalendarQuestion(input.userId)) return false

  const question: ShippedQuestion = {
    text: input.text,
    askedAt: new Date().toISOString(),
  }

  await db
    .update(sourceItem)
    .set({
      // `meta || {…}` against the live row, never a snapshot — lib/shipped-meta.ts
      // makes the argument at length and it holds here for the same reason:
      // the row's own facts were written a moment ago by the same run.
      meta: sql`${sourceItem.meta} || ${JSON.stringify({ question })}::jsonb`,
    })
    .where(
      and(
        eq(sourceItem.id, input.sourceItemId),
        eq(sourceItem.userId, input.userId)
      )
    )

  return true
}

export type AnsweredCalendarQuestion = {
  sourceItemId: string
  answer: string
  /** The meeting the answer belongs to. Becomes the riff's source label. */
  title: string
}

/**
 * Store the answer, and hand back what the riff needs.
 *
 * **Conditional on the question still being open**, in the `where` rather than
 * in a branch above it — `answerShippedQuestion`'s rule, and it exists for the
 * same reason: two submits of one form must write one answer and start one
 * riff, and a read-then-write lets both through. `RETURNING` is what tells the
 * caller which of the two it was.
 */
export async function answerCalendarQuestion(input: {
  userId: string
  sourceItemId: string
  answer: string
}): Promise<AnsweredCalendarQuestion | null> {
  const answer = input.answer
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_ANSWER_CHARS)
  if (!answer) return null

  const patch = JSON.stringify({
    answer,
    answeredAt: new Date().toISOString(),
  })

  const [row] = await db
    .update(sourceItem)
    .set({
      // Nested merge, so `text` and `askedAt` survive. `||` at the top level
      // would drop the question wholesale.
      meta: sql`${sourceItem.meta} || jsonb_build_object('question', (${sourceItem.meta} -> 'question') || ${patch}::jsonb)`,
    })
    .where(
      and(
        eq(sourceItem.id, input.sourceItemId),
        // The ownership check. The id travels to the browser and comes back.
        eq(sourceItem.userId, input.userId),
        eq(sourceItem.source, CALENDAR_SOURCE),
        sql`${sourceItem.meta} ? 'question'`,
        sql`coalesce(${sourceItem.meta} -> 'question' ->> 'answer', '') = ''`
      )
    )
    .returning({ id: sourceItem.id, title: sourceItem.body })

  if (!row) return null

  return { sourceItemId: row.id, answer, title: row.title }
}

/* ── The read ─────────────────────────────────────────────────────────────── */

export type CalendarPage = {
  events: CalendarEvent[]
  /** What Google returned before parsing. What the meter counts. */
  eventsRead: number
  /** True when Google had another page this run will not buy. */
  more: boolean
  failure?: { reason: "unauthorised" | "rejected"; message: string }
}

/**
 * One page of `events.list`, and only one.
 *
 * The parameters are Google's, verified against the reference rather than
 * remembered:
 *
 * - `singleEvents=true` expands a recurring series into instances. Without it
 *   a weekly one-to-one arrives once, as the rule that generates it, with no
 *   start time that means anything.
 * - `orderBy=startTime` is only legal alongside `singleEvents=true`, which is
 *   the pairing that makes the cap take the *earliest* fifty rather than an
 *   arbitrary fifty.
 * - `maxResults` is the ceiling. Google's own default is 250 and its maximum
 *   2500; fifty is this feature's number and the loop that would follow
 *   `nextPageToken` does not exist.
 *
 * `primary` is the only calendar read. A person's shared and subscribed
 * calendars are largely other people's — holidays, a team's rota, a partner's
 * schedule — and none of them is a room this person was in.
 */
export async function collectCalendarPage({
  fetchImpl,
  accessToken,
  window,
  pageSize = CALENDAR_PAGE_SIZE,
}: {
  fetchImpl: typeof fetch
  accessToken: string
  window: CalendarWindow
  pageSize?: number
}): Promise<CalendarPage> {
  const params = new URLSearchParams({
    timeMin: window.timeMin.toISOString(),
    timeMax: window.timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(Math.min(CALENDAR_PAGE_SIZE, Math.max(1, pageSize))),
  })

  let response: Response
  try {
    response = await fetchImpl(`${EVENTS_URL}?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(CALENDAR_TIMEOUT_MS),
    })
  } catch (cause) {
    console.error("[calendar] fetch failed:", cause)
    return {
      events: [],
      eventsRead: 0,
      more: false,
      failure: { reason: "rejected", message: String(cause) },
    }
  }

  const body = await response.text()

  if (!response.ok) {
    return {
      events: [],
      eventsRead: 0,
      more: false,
      failure: {
        // 401 and 403 are verdicts about the credential; everything else is
        // Google having a bad day, and a bad day upstream is not consent
        // withdrawn down here. 429 especially — see `probeLiveness`.
        reason:
          response.status === 401 || response.status === 403
            ? "unauthorised"
            : "rejected",
        message: body.slice(0, 300),
      },
    }
  }

  let page: { items?: unknown[]; nextPageToken?: string }
  try {
    page = JSON.parse(body)
  } catch {
    return {
      events: [],
      eventsRead: 0,
      more: false,
      failure: { reason: "rejected", message: body.slice(0, 300) },
    }
  }

  const items = Array.isArray(page.items) ? page.items : []

  return {
    events: items
      .map(parseCalendarEvent)
      .filter((event): event is CalendarEvent => event !== null),
    eventsRead: items.length,
    more: typeof page.nextPageToken === "string" && page.nextPageToken !== "",
  }
}

/* ── The store, injectable ────────────────────────────────────────────────
   `PostMetricsDeps`'s shape and for its reason: the decisions worth verifying
   are "does the cooldown cool", "is one page one page", "is an unfinished
   meeting kept out" and "does an address ever reach a row" — and none of them
   should need Google to be reachable to check. There is exactly one production
   database, so a live verification of this file is not available either.
   ──────────────────────────────────────────────────────────────────────── */

export type CalendarConnection = {
  id: string
  userId: string
  /** For the clock in the question. Null falls back to UTC. */
  timezone: string | null
}

export type CalendarStoredRow = {
  sourceItemId: string
  event: CalendarEvent
}

export type CalendarDeps = {
  fetch: typeof fetch
  /** Live connections, longest-unread first. */
  listDue: (limit: number) => Promise<CalendarConnection[]>
  /** The atomic claim. False means the cooldown is still running. */
  claim: (connectionId: string, now: Date) => Promise<boolean>
  /** The decrypted refresh token, or null for a connection with none. */
  refreshToken: (userId: string) => Promise<string | null>
  refresh: (refreshToken: string) => Promise<CalendarTokens>
  /** The user's story pages, for the match. */
  stories: (userId: string) => Promise<StoryPage[]>
  /** Rows that did not already exist. A redelivered meeting is a no-op. */
  store: (
    userId: string,
    events: CalendarEvent[]
  ) => Promise<CalendarStoredRow[]>
  ask: (input: {
    userId: string
    sourceItemId: string
    text: string
  }) => Promise<boolean>
  /** Material arrived: the connection moves off `waiting`. */
  arrived: (connectionId: string) => Promise<void>
  /** The grant is gone. The interrupting state — see lib/sources.ts. */
  broken: (connectionId: string, message: string) => Promise<void>
  meter: (userId: string, eventsRead: number) => Promise<void>
}

export type CalendarRun = {
  /** Connections the query offered, after the cap. */
  due: number
  /** Connections that took the claim and bought a page. */
  read: number
  /** Held back by the fifty-minute claim. */
  cooldown: number
  /** No refresh token, or one Google would not honour. */
  unavailable: number
  /** Events Google returned. What the meter counted. */
  eventsRead: number
  /** Meetings that had ended and were stored. */
  stored: number
  /** Questions written. At most one per user, and usually none. */
  asked: number
  /** Refused by Google, or threw. Per user, never fatal to the run. */
  failed: number
  /** More connections were waiting than `MAX_USERS_PER_RUN` allows. */
  truncated: boolean
  /** At least one user had a second page this run would not buy. */
  capped: boolean
}

/**
 * The hourly read. Called by /api/cron/calendar.
 *
 * Fails soft per user, like the sweeps beside it: one refused connection must
 * not end the run for everybody behind it, and nothing was written for that
 * user, so the next hour picks it up unchanged.
 *
 * Sequential, one connection at a time, for the reason `refreshPostMetrics`
 * gives — a pool would turn fifty users into fifty simultaneous requests from
 * one serverless IP, which is how a job gets rate-limited and then reads the
 * 429 as everybody's calendar being empty.
 */
export async function readCalendars({
  deps,
  now = new Date(),
  maxUsers = MAX_USERS_PER_RUN,
}: {
  deps: CalendarDeps
  now?: Date
  maxUsers?: number
}): Promise<CalendarRun> {
  const offered = await deps.listDue(maxUsers)
  const truncated = offered.length > maxUsers
  const batch = truncated ? offered.slice(0, maxUsers) : offered

  if (truncated) {
    console.error(
      `[calendar] run capped at ${maxUsers} users — more were waiting. ` +
        "Raise the cap or move to a cursor."
    )
  }

  const run: CalendarRun = {
    due: batch.length,
    read: 0,
    cooldown: 0,
    unavailable: 0,
    eventsRead: 0,
    stored: 0,
    asked: 0,
    failed: 0,
    truncated,
    capped: false,
  }

  const window = calendarWindow(now)

  for (const connection of batch) {
    try {
      if (!(await deps.claim(connection.id, now))) {
        run.cooldown += 1
        continue
      }

      const refreshToken = await deps.refreshToken(connection.userId)

      if (!refreshToken) {
        run.unavailable += 1
        continue
      }

      let access: CalendarTokens
      try {
        access = await deps.refresh(refreshToken)
      } catch (cause) {
        /**
         * **A refresh failure marks the row and does not throw.**
         *
         * `broken` is the state lib/sources.ts reserves for a credential that
         * has stopped working — "the one thing on this page that should be able
         * to interrupt you" — and it is what /sources renders as a Reconnect.
         * Throwing here would take down the run for every user behind this one
         * to report a fact about one grant, and the fact would still not be on
         * screen anywhere.
         *
         * Both causes land in the same state on purpose. A revoked grant and an
         * expired refresh token are the same sentence to the person holding
         * them: reconnect. The distinction is kept in `last_error`, where a
         * human can read it, rather than in a second state nothing renders
         * differently.
         */
        run.unavailable += 1
        await deps.broken(
          connection.id,
          cause instanceof CalendarTokenError && cause.isRevoked
            ? "Google says the calendar grant was withdrawn. Reconnect to read meetings again."
            : cause instanceof Error
              ? cause.message
              : String(cause)
        )
        continue
      }

      const page = await collectCalendarPage({
        fetchImpl: deps.fetch,
        accessToken: access.accessToken,
        window,
      })

      // Metered before anything is judged, and metered on a refusal that still
      // returned rows: the quota was spent at Google regardless of what happens
      // next here.
      if (page.eventsRead > 0) {
        run.eventsRead += page.eventsRead
        await deps.meter(connection.userId, page.eventsRead)
      }

      if (page.failure) {
        run.failed += 1
        if (page.failure.reason === "unauthorised") {
          run.unavailable += 1
          await deps.broken(
            connection.id,
            "Google refused the calendar read. Reconnect to read meetings again."
          )
        }
        console.error(
          `[calendar] ${connection.id} refused (${page.failure.reason}): ${page.failure.message}`
        )
        continue
      }

      run.read += 1
      if (page.more) run.capped = true

      // Only what has finished. A meeting still in progress overlaps the window
      // and Google returns it; asking "what happened?" about a room somebody is
      // still sitting in is the question that makes the feature feel like
      // surveillance rather than memory.
      const ended = page.events.filter((event) => hasEnded(event, now))

      if (ended.length === 0) continue

      const rows = await deps.store(connection.userId, ended)
      run.stored += rows.length

      if (rows.length === 0) continue

      await deps.arrived(connection.id)

      /**
       * One question, and the newest meeting gets it.
       *
       * `ask` refuses to write a second while the first is unanswered, so the
       * loop below is bounded by that rather than by a counter here — but it
       * still stops at the first success, because a run that kept trying would
       * be asking `ask` the same question once per meeting and the answer would
       * be no every time.
       */
      const stories = await deps.stories(connection.userId)

      if (stories.length === 0) continue

      for (const row of [...rows].reverse()) {
        const match = matchStoryTheme(
          `${row.event.title} ${row.event.description}`,
          stories
        )
        if (!match) continue

        const asked = await deps.ask({
          userId: connection.userId,
          sourceItemId: row.sourceItemId,
          text: questionFor({
            title: row.event.title,
            startAt: row.event.startAt,
            theme: match.theme,
            timezone: connection.timezone,
          }),
        })

        if (asked) run.asked += 1
        break
      }
    } catch (cause) {
      run.failed += 1
      console.error(`[calendar] ${connection.id} read failed:`, cause)
    }
  }

  return run
}

/* ── The live wiring ──────────────────────────────────────────────────────── */

/**
 * Connections that might be due, longest-unread first.
 *
 * `broken` rows are excluded and stay excluded until somebody reconnects:
 * reading a grant Google has already refused buys a guaranteed failure every
 * hour, forever. `paused` is excluded for the same reason it is elsewhere —
 * somebody asked for it to stop.
 *
 * The cooldown is filtered here *and* claimed below. This bounds the query;
 * the claim is what makes the rule hold.
 */
async function listDueCalendars(limit: number): Promise<CalendarConnection[]> {
  return db
    .select({
      id: sourceConnection.id,
      userId: sourceConnection.userId,
      timezone: user.timezone,
    })
    .from(sourceConnection)
    .innerJoin(user, eq(user.id, sourceConnection.userId))
    .where(
      and(
        eq(sourceConnection.source, CALENDAR_SOURCE),
        sql`${sourceConnection.state} not in ('broken', 'paused')`,
        sql`coalesce((${sourceConnection.meta} ->> 'lastReadAt')::timestamptz, to_timestamp(0)) < now() - ${sql.raw(`interval '${Math.round(CALENDAR_COOLDOWN_MS / 1000)} seconds'`)}`
      )
    )
    .orderBy(
      sql`(${sourceConnection.meta} ->> 'lastReadAt')::timestamptz asc nulls first`
    )
    .limit(limit + 1)
}

/**
 * One conditional UPDATE, atomic on the row — the only shape that holds
 * without sessions, advisory locks or interactive transactions on the Neon
 * HTTP driver.
 *
 * The claim is taken before the token is refreshed and before anything is
 * read, so a run that fails afterwards still consumed its window. Releasing it
 * on failure would reopen the gap two concurrent cron invocations walk
 * through, and fifty minutes is one skipped hour, not a broken feature.
 */
async function claimCalendar(
  connectionId: string,
  now: Date
): Promise<boolean> {
  const claimed = await db
    .update(sourceConnection)
    .set({
      meta: sql`${sourceConnection.meta} || ${JSON.stringify({ lastReadAt: now.toISOString() })}::jsonb`,
      updatedAt: now,
    })
    .where(
      and(
        eq(sourceConnection.id, connectionId),
        sql`coalesce((${sourceConnection.meta} ->> 'lastReadAt')::timestamptz, to_timestamp(0)) < ${new Date(now.getTime() - CALENDAR_COOLDOWN_MS).toISOString()}::timestamptz`
      )
    )
    .returning({ id: sourceConnection.id })

  return claimed.length > 0
}

/** The story pages, read directly. Only the two fields the match reads. */
async function readStoryPages(userId: string): Promise<StoryPage[]> {
  return db
    .select({ title: brainPage.title, data: brainPage.data })
    .from(brainPage)
    .where(and(eq(brainPage.userId, userId), eq(brainPage.kind, "story")))
}

/**
 * The meetings that are new, written and handed back.
 *
 * `onConflictDoNothing` on `(user, source, external_id)` is what makes a
 * re-read of an overlapping window free, and `RETURNING` is what tells the
 * caller which rows are actually new — a question about a meeting stored an
 * hour ago would be Quincy asking twice.
 *
 * `body` holds the title. It is the one field the corpus query and /riffs can
 * both read without knowing this source exists, and it is the reason
 * `compileVoice` must never be pointed at this source: a meeting title is not
 * writing.
 */
async function storeCalendarEvents(
  userId: string,
  events: CalendarEvent[]
): Promise<CalendarStoredRow[]> {
  if (events.length === 0) return []

  const written = await db
    .insert(sourceItem)
    .values(
      events.map((event) => ({
        id: newItemId(),
        userId,
        source: CALENDAR_SOURCE,
        externalId: event.eventId,
        // No URL. A calendar link resolves only for somebody already signed in
        // to that account, so it is not a receipt and not a destination.
        url: "",
        // The end, not the start: this row exists because the meeting is over.
        postedAt: event.endAt,
        body: event.title,
        meta: { ...storedEventFrom(event) },
      }))
    )
    .onConflictDoNothing()
    .returning({ id: sourceItem.id, externalId: sourceItem.externalId })

  const byExternalId = new Map(events.map((event) => [event.eventId, event]))

  return written.flatMap((row) => {
    const event = byExternalId.get(row.externalId)
    return event ? [{ sourceItemId: row.id, event }] : []
  })
}

/**
 * What the calendar reads cost, recorded where /credits can say so.
 *
 * Zero money, counted in events, one row per page rather than one per event —
 * the same call `recordGithubReads` makes, for the same reason: fifty
 * zero-cost rows an hour would bury the model calls on the same page.
 */
async function recordCalendarReads(
  userId: string,
  eventsRead: number
): Promise<void> {
  if (eventsRead <= 0) return

  try {
    await db.insert(usageEvent).values({
      id: `use_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
      userId,
      model: CALENDAR_READ_LABEL,
      // Free in money, counted in events. Stored where the token counts go so
      // one row answers "how much was bought".
      inputTokens: eventsRead,
      costMicros: 0,
    })
  } catch (cause) {
    // The meetings are already stored. Failing the run because the meter
    // failed would lose the material to keep the books, which is backwards.
    console.error("[calendar] read cost not recorded:", cause)
  }
}

export const LIVE_CALENDAR_DEPS: CalendarDeps = {
  fetch,
  listDue: listDueCalendars,
  claim: claimCalendar,
  refreshToken: readCalendarRefreshToken,
  refresh: (token) => refreshCalendarAccess(token),
  stories: readStoryPages,
  store: storeCalendarEvents,
  ask: recordCalendarQuestion,
  // `recordArrival` and `markBroken` rather than a second pair of writers here:
  // lib/source-connections.ts owns every write to `state`, which is the column
  // deciding whether /sources says reconnect. Two places setting it is how the
  // two places drift.
  arrived: recordArrival,
  broken: markBroken,
  meter: recordCalendarReads,
}
