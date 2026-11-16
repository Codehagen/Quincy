import { randomBytes, timingSafeEqual } from "node:crypto"
import { createIdGenerator } from "ai"
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto"
import { and, eq } from "drizzle-orm"

import { db } from "./db"
import { sourceConnection } from "./schema-app"

/**
 * The write API for `source_connection`. See plans/019.
 *
 * Narrow on purpose, the way lib/brain.ts is: nothing outside this module
 * touches the table, and **the decrypted signing secret never leaves it**.
 * `verifySignature` takes the raw body and the header and answers a boolean,
 * rather than handing a caller the secret to compare with — a function that
 * returns a credential is one every future call site can misuse, and this one
 * would be misused by comparing with `===`.
 *
 * The parallel is lib/channels.ts, which decrypts in exactly one function
 * (`getAccessToken`) and hands every other caller a `SafeConnection` with the
 * token columns absent by construction. Same discipline, smaller surface.
 */

const newConnectionId = createIdGenerator({ prefix: "sc", size: 16 })

/**
 * How much entropy is in the URL.
 *
 * 32 bytes, base64url — 43 characters, 256 bits. Larger than the 16-byte ids
 * elsewhere in the app because those identify a row to someone who is already
 * authenticated, and this one *is* the authentication: it is the only thing
 * distinguishing a real Circleback delivery from a stranger who guessed a
 * path. `randomBytes` rather than `createIdGenerator`, which is built for
 * collision resistance rather than unguessability.
 */
function newToken(): string {
  return randomBytes(32).toString("base64url")
}

function encryptionKey(): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) {
    // The same refusal lib/channels.ts makes, for the same reason: a webhook
    // secret in the clear is not an acceptable fallback, and a deployment
    // missing the key should fail loudly at the first write rather than store
    // something it cannot later be trusted to have protected.
    throw new Error(
      "BETTER_AUTH_SECRET is not set. Source webhook secrets are encrypted " +
        "with it, and storing one in the clear is not an acceptable fallback."
    )
  }
  return secret
}

export type SourceConnection = typeof sourceConnection.$inferSelect

/**
 * What a caller outside this module is allowed to see.
 *
 * `signingSecret` is absent by construction, and `token` is present — it has
 * to be, because the whole connect flow is showing it to the user once. That
 * asymmetry is the interesting part: the token is a secret the user must read,
 * and the signing secret is one nobody ever needs to read again after it is
 * stored.
 *
 * Built by naming what may leave rather than by deleting what may not, so a
 * secret column added later is absent here by default. See plans/README.md on
 * plan 012's scope defect — adding a column to a table with an `Omit`-based
 * safe type makes that column *required* in the object built below, so this
 * function is part of the cost of every future column.
 */
export type SafeSourceConnection = Omit<SourceConnection, "signingSecret"> & {
  /** Whether the provider's secret has been pasted back yet. Not the secret. */
  verified: boolean
}

export function toSafeSourceConnection(
  row: SourceConnection
): SafeSourceConnection {
  return {
    id: row.id,
    userId: row.userId,
    source: row.source,
    token: row.token,
    state: row.state,
    lastItemAt: row.lastItemAt,
    lastErrorAt: row.lastErrorAt,
    lastError: row.lastError,
    // Safe to hand out: it holds the provider's own identifiers — an
    // installation id, a public login — and never a credential. If a provider
    // ever needs a secret kept per connection, that is `signingSecret` or a
    // column of its own, not a key in here.
    meta: row.meta,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    verified: row.signingSecret !== null,
  }
}

/**
 * What a GitHub connection knows about itself.
 *
 * Read off `meta` at every use rather than trusted: this is jsonb, so the
 * database will hand back whatever was written, including from a version of
 * the code that wrote a different shape.
 */
export type GithubConnectionMeta = {
  /** The App installation. The only thing identifying an inbound delivery. */
  installationId: number
  /** The account the app is installed on — a user login or an org name. */
  account: string
  /** "User" | "Organization". Decides whether `login` could be inferred. */
  accountType: string
  /**
   * Whose merges count. Equal to `account` for a personal installation, where
   * the account *is* the person; empty on an organisation until the user says
   * which login is theirs, because an org name is not a author name and
   * guessing one would draft a post about a colleague's work.
   */
  login: string
}

export function readGithubMeta(
  meta: Record<string, unknown>
): GithubConnectionMeta {
  return {
    installationId:
      typeof meta.installationId === "number" ? meta.installationId : 0,
    account: typeof meta.account === "string" ? meta.account : "",
    accountType: typeof meta.accountType === "string" ? meta.accountType : "",
    login: typeof meta.login === "string" ? meta.login : "",
  }
}

/**
 * The routing key for a GitHub App installation.
 *
 * A GitHub App has **one** webhook URL across every installation, so the
 * per-user token cannot appear in the path the way Circleback's does — the
 * body's `installation.id` is what says whose merge this is. Deriving the
 * token from it keeps that lookup on the existing unique index instead of
 * adding a second resolution path and a second index to `source_connection`.
 *
 * It is therefore **not a secret**, unlike every other value in that column,
 * and nothing may treat it as one: an installation id is visible to anyone who
 * can see the installation. That is fine here and it is why the GitHub route
 * verifies the app-level signature before it resolves anything — the URL is
 * public by design, so the signature is the whole of the authentication rather
 * than half of it.
 */
export function githubInstallationToken(installationId: number): string {
  return `ghi_${installationId}`
}

/**
 * Start a connection. Idempotent per (user, source) — and deliberately not a
 * token rotation.
 *
 * Someone who opens the connect panel twice must get the same URL, because the
 * first one may already be pasted into a Circleback automation and minting a
 * new one would silently stop their meetings arriving. Rotation is what
 * `disconnectSource` followed by this is for, which is a thing you do on
 * purpose rather than by revisiting a page.
 */
export async function connectSource(
  userId: string,
  source: string
): Promise<SafeSourceConnection> {
  const existing = await readConnection(userId, source)
  if (existing) return toSafeSourceConnection(existing)

  /**
   * `onConflictDoNothing`, then read back — not select-then-insert.
   *
   * The first version checked and then inserted, which is a race with a unique
   * index at the end of it: two Connect presses a few milliseconds apart both
   * see no row, both insert, and the loser gets a raw 23505 thrown out of a
   * server action. The read above stays because it is the common path and
   * saves a write; this is what makes losing the race a no-op instead.
   *
   * The HTTP driver has no interactive transactions (see the cooldown claim in
   * lib/corpus-x.ts, which is the same constraint solved the same way), so a
   * single conditional statement is the whole of the concurrency control
   * available here.
   */
  const [row] = await db
    .insert(sourceConnection)
    .values({
      id: newConnectionId(),
      userId,
      source,
      token: newToken(),
      // `waiting`, not `arriving`. Nothing has come through, and the whole
      // argument in lib/sources.ts is that those two must not look alike.
      state: "waiting",
    })
    .onConflictDoNothing()
    .returning()

  if (row) return toSafeSourceConnection(row)

  /**
   * Lost the race, so somebody else's insert won and their token is the real
   * one. Re-read rather than retry: the row now exists and this call's job is
   * to return it, not to own it.
   */
  const winner = await readConnection(userId, source)

  if (!winner) {
    // Neither inserted nor readable. Nothing sensible is left to return, and a
    // fabricated token would be a URL that resolves to nobody.
    throw new Error("Could not create the source connection.")
  }

  return toSafeSourceConnection(winner)
}

async function readConnection(
  userId: string,
  source: string
): Promise<SourceConnection | null> {
  const [row] = await db
    .select()
    .from(sourceConnection)
    .where(
      and(
        eq(sourceConnection.userId, userId),
        eq(sourceConnection.source, source)
      )
    )
    .limit(1)

  return row ?? null
}

/**
 * Record a GitHub App installation against a user. See plans/021.
 *
 * Not `connectSource`, and the difference is the whole reason this exists:
 * `connectSource` mints a random token and refuses to change one that exists,
 * because rotating a Circleback URL silently stops meetings arriving. Here the
 * token is *derived* from the installation, so re-running with a new
 * installation id is not a rotation — it is the user having uninstalled and
 * reinstalled the app, and the row has to follow them.
 *
 * Upserts on `(user_id, source)`. Two conflicts are possible and only one is
 * benign:
 *
 * - **Same user, reinstalling.** The unique key on `(user_id, source)` catches
 *   it, and the update below is correct: new installation, same person.
 * - **A different user claiming an installation that is already connected.**
 *   The unique key on `token` catches that one, and it must not be swallowed —
 *   silently moving somebody's installation to another Quincy account is how
 *   one user's merges start drafting posts for another. It answers `taken`.
 */
export async function connectGithubInstallation(
  userId: string,
  meta: GithubConnectionMeta
): Promise<{ ok: true } | { ok: false; message: string }> {
  const token = githubInstallationToken(meta.installationId)

  const claimed = await resolveByToken(token)

  if (claimed && claimed.userId !== userId) {
    return {
      ok: false,
      message:
        "That GitHub installation is already connected to another Quincy " +
        "account. Uninstall it there first, or install on a different account.",
    }
  }

  /**
   * The pre-check above is a read, so it is a race, and the loser must not be
   * a 500.
   *
   * Two accounts claiming the same installation within the same moment both see
   * no row and both insert; the second violates the unique index on `token`,
   * which arrives as Postgres 23505 out of the driver. Left unhandled that is
   * an unhandled rejection inside a redirect handler — a blank error page at
   * the end of an OAuth-shaped flow, for a case with a perfectly good answer.
   *
   * The database is the authority here rather than the read: catching the
   * violation and reporting `taken` gives the same answer the pre-check gives,
   * and it is the answer that cannot be raced. The pre-check stays because it
   * is the common path and produces the message without an exception.
   */
  try {
    await insertGithubConnection(userId, token, meta)
  } catch (cause) {
    if (isUniqueViolation(cause)) {
      return {
        ok: false,
        message:
          "That GitHub installation is already connected to another Quincy " +
          "account. Uninstall it there first, or install on a different account.",
      }
    }
    throw cause
  }

  return { ok: true }
}

/**
 * Postgres 23505, whatever the driver wrapped it in.
 *
 * The Neon HTTP driver surfaces the server's `code` on the error object, but
 * not always at the top level and not with a stable class to `instanceof`, so
 * this reads defensively rather than asserting a shape.
 */
function isUniqueViolation(cause: unknown): boolean {
  if (!cause || typeof cause !== "object") return false
  const error = cause as { code?: unknown; cause?: unknown }
  if (error.code === "23505") return true
  return isUniqueViolation(error.cause)
}

async function insertGithubConnection(
  userId: string,
  token: string,
  meta: GithubConnectionMeta
): Promise<void> {
  await db
    .insert(sourceConnection)
    .values({
      id: newConnectionId(),
      userId,
      source: "github",
      token,
      // `waiting`, not `arriving`: the app is installed and no pull request has
      // merged yet. Those two states looking alike is the complaint
      // lib/sources.ts exists to answer, and an install is exactly the moment
      // they diverge — everything is wired and nothing has happened.
      state: "waiting",
      meta,
    })
    .onConflictDoUpdate({
      target: [sourceConnection.userId, sourceConnection.source],
      set: {
        token,
        meta,
        // Deliberately reset. A reinstall is a new installation id, so anything
        // the old one recorded — an error about a login that no longer applies,
        // an arrival from a repo they have since removed — is about a
        // connection that no longer exists.
        state: "waiting",
        lastItemAt: null,
        lastErrorAt: null,
        lastError: null,
        updatedAt: new Date(),
      },
    })
}

/**
 * Say which login is yours, on an organisation installation.
 *
 * Merged into `meta` rather than replacing it, because everything else in there
 * came from GitHub and this is the one field a person supplies. Lower-cased on
 * the way in: GitHub logins are case-insensitive and compare exactly, so
 * storing "Codehagen" and receiving "codehagen" would silently drop every
 * merge — a failure that looks exactly like the app not being installed.
 */
export async function setGithubLogin(
  userId: string,
  login: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const trimmed = login.trim().replace(/^@/, "").toLowerCase()

  if (!trimmed) {
    return { ok: false, message: "Enter the GitHub username whose merges count." }
  }

  if (!/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/.test(trimmed)) {
    return { ok: false, message: "That is not a GitHub username." }
  }

  const row = await readConnection(userId, "github")

  if (!row) return { ok: false, message: "GitHub is not connected." }

  await db
    .update(sourceConnection)
    .set({ meta: { ...row.meta, login: trimmed }, updatedAt: new Date() })
    .where(eq(sourceConnection.id, row.id))

  return { ok: true }
}

/**
 * Store the provider's webhook secret.
 *
 * Trimmed, because this arrives by paste and a trailing newline out of a
 * clipboard would make every signature fail with nothing on screen explaining
 * why. Validated on the prefix for the same reason: `whsec_` is a cheap way to
 * catch someone pasting the URL back into the wrong box, which is the likeliest
 * mistake in a two-field form where both fields are opaque strings.
 */
export async function setSigningSecret(
  userId: string,
  source: string,
  secret: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const trimmed = secret.trim()

  if (!trimmed) {
    return { ok: false, message: "Paste the signing secret from Circleback." }
  }

  if (!trimmed.startsWith("whsec_")) {
    return {
      ok: false,
      message: "That does not look like a Circleback signing secret.",
    }
  }

  const encrypted = await symmetricEncrypt({
    key: encryptionKey(),
    data: trimmed,
  })

  const updated = await db
    .update(sourceConnection)
    .set({ signingSecret: encrypted, updatedAt: new Date() })
    .where(
      and(
        eq(sourceConnection.userId, userId),
        eq(sourceConnection.source, source)
      )
    )
    .returning({ id: sourceConnection.id })

  if (updated.length === 0) {
    return { ok: false, message: "That source is not connected." }
  }

  return { ok: true }
}

/**
 * The webhook's first act: who is this?
 *
 * Returns the whole row, secret included, because the only caller is the route
 * and its very next act is verification. Not exported beyond that by
 * convention but by necessity — `verifySignature` below is what the route
 * actually calls, and it takes the row rather than the secret.
 */
export async function resolveByToken(
  token: string
): Promise<SourceConnection | null> {
  if (!token) return null

  const [row] = await db
    .select()
    .from(sourceConnection)
    .where(eq(sourceConnection.token, token))
    .limit(1)

  return row ?? null
}

/**
 * Is this body from the provider?
 *
 * HMAC-SHA256 over the **raw bytes**, hex, compared in constant time.
 *
 * Three things here are load-bearing and none of them are optional:
 *
 * - **The body must be the raw text.** Any reparse — `request.json()`, a
 *   framework body parser, a re-`JSON.stringify` — changes the bytes and every
 *   signature fails. app/api/webhooks/resend/route.ts carries the same warning.
 * - **`timingSafeEqual`, not `===`.** Circleback's own documented sample uses
 *   `===`. It is wrong in the ordinary way and we are not copying it.
 * - **No secret means no.** Circleback treats signing as optional; we do not.
 *   An unsigned body is a stranger asserting what you said in a meeting, and
 *   acting on that is worse than dropping it. This is the same call
 *   app/api/webhooks/resend/route.ts makes on a far lower-stakes payload.
 *
 * There is no timestamp header in Circleback's scheme, so this cannot bound a
 * replay the way Svix's does. Replay defence is structural instead — the
 * unique index on `source_item` makes a redelivered meeting a no-op. See
 * plans/019 decision 5.
 */
export async function verifySignature(
  connection: SourceConnection,
  rawBody: string,
  signature: string | null
): Promise<boolean> {
  if (!connection.signingSecret) return false
  if (!signature) return false

  const secret = await symmetricDecrypt({
    key: encryptionKey(),
    data: connection.signingSecret,
  })

  const { createHmac } = await import("node:crypto")
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex")

  const provided = signature.trim().toLowerCase()

  // Length is checked first because `timingSafeEqual` throws on a mismatch
  // rather than returning false. The length of a hex digest is not a secret,
  // so leaking it through an early return costs nothing.
  if (provided.length !== expected.length) return false

  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

/**
 * Material arrived. Moves the row to `arriving` and clears any error.
 *
 * The error is cleared on success rather than left for a human to dismiss: a
 * connection that broke last Tuesday and has worked every day since is not
 * broken, and a page that still says so is a page people learn to ignore.
 */
export async function recordArrival(connectionId: string): Promise<void> {
  await db
    .update(sourceConnection)
    .set({
      state: "arriving",
      lastItemAt: new Date(),
      lastErrorAt: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(sourceConnection.id, connectionId))
}

/**
 * Something arrived and could not be used.
 *
 * Deliberately **does not** set `state: "broken"`. One malformed payload is not
 * a broken connection, and `broken` is the state lib/sources.ts reserves for
 * the thing that "should be able to interrupt you" — a credential that has
 * stopped working. Recording the error without the state change is what lets
 * the page say "one meeting could not be read" instead of "reconnect
 * Circleback", which would be a lie with a button on it.
 */
export async function recordSourceError(
  connectionId: string,
  message: string
): Promise<void> {
  await db
    .update(sourceConnection)
    .set({
      lastErrorAt: new Date(),
      lastError: message.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(eq(sourceConnection.id, connectionId))
}

/**
 * Stopped at the provider's end, and expected to come back.
 *
 * Added by plans/021 for GitHub's `installation.suspend`, which an
 * organisation owner can apply and lift at will. The first version of that
 * handler deleted the row, treating suspend as uninstall — which is wrong in
 * the direction that loses material silently: `unsuspend` then restores the
 * installation on GitHub's side while Quincy has forgotten it exists, so every
 * later merge resolves to nobody and is dropped with a 200. The user's only
 * clue is cards that stop appearing.
 *
 * `paused` is the state lib/sources.ts already argues for and `/sources`
 * already renders, and it keeps `lastItemAt` so the row can still say when
 * material last arrived. Deletion stays reserved for `deleted`, where the
 * installation genuinely no longer exists.
 */
export async function pauseSource(
  connectionId: string,
  message: string
): Promise<void> {
  await db
    .update(sourceConnection)
    .set({
      state: "paused",
      lastErrorAt: new Date(),
      lastError: message.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(eq(sourceConnection.id, connectionId))
}

/**
 * The pause lifted. Back to whichever state the history justifies.
 *
 * `arriving` only if something has actually arrived before — otherwise
 * `waiting`, because a connection that was suspended before its first merge
 * has still never handed anything over, and lib/sources.ts is explicit that
 * those two must not look alike.
 */
export async function resumeSource(connectionId: string): Promise<void> {
  const [row] = await db
    .select({ lastItemAt: sourceConnection.lastItemAt })
    .from(sourceConnection)
    .where(eq(sourceConnection.id, connectionId))
    .limit(1)

  if (!row) return

  await db
    .update(sourceConnection)
    .set({
      state: row.lastItemAt ? "arriving" : "waiting",
      lastErrorAt: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(sourceConnection.id, connectionId))
}

/**
 * The credential stopped working — a signature that cannot verify, a secret
 * that was rotated upstream. This is the interrupting state.
 */
export async function markBroken(
  connectionId: string,
  message: string
): Promise<void> {
  await db
    .update(sourceConnection)
    .set({
      state: "broken",
      lastErrorAt: new Date(),
      lastError: message.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(eq(sourceConnection.id, connectionId))
}

export async function getSourceConnection(
  userId: string,
  source: string
): Promise<SafeSourceConnection | null> {
  const row = await readConnection(userId, source)
  return row ? toSafeSourceConnection(row) : null
}

export async function listSourceConnections(
  userId: string
): Promise<SafeSourceConnection[]> {
  const rows = await db
    .select()
    .from(sourceConnection)
    .where(eq(sourceConnection.userId, userId))

  return rows.map(toSafeSourceConnection)
}

/**
 * Remove the connection, which is also how a token is rotated.
 *
 * The row goes rather than moving to a `disconnected` state, because a URL
 * that no longer resolves is the strongest possible revocation: the webhook
 * answers 404 to anyone still holding it, including whoever leaked it. A state
 * column would leave the row addressable and require every read path to
 * remember to filter.
 */
export async function disconnectSource(
  userId: string,
  source: string
): Promise<void> {
  await db
    .delete(sourceConnection)
    .where(
      and(
        eq(sourceConnection.userId, userId),
        eq(sourceConnection.source, source)
      )
    )
}
