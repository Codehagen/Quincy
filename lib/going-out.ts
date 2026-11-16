import type { ApprovalPreview } from "./draft-writes"
import type { Version } from "./drafts"
import type { Entry } from "./lineup"
import type { SendNowResult } from "./publish-run"
import type { ApprovalPlacement } from "./scheduling"

/**
 * When does it go out, and what state is it in — said once.
 *
 * plans/030 found this sentence computed three ways: `when()` in
 * components/drafts/draft-pane.tsx, `receiptFor()` in
 * the old chat draft card (since deleted), and the state flags in `EntryRow`
 * (components/lineup/lineup-parts.tsx). Three copies drift, and the drift
 * this guards against already happened once: a row that said "Approved" and
 * nothing else after a refresh, for writing that had no time.
 *
 * Two steps, both pure and type-only in their imports so a client card can
 * call them:
 *
 * 1. `goingOut*()` reads one of the three shapes the app holds (a `Version`
 *    plus what this session just did, a lineup `Entry`, a chat
 *    `ApprovalPreview`) into one `GoingOut` union.
 * 2. `goingOutLine()` says a `GoingOut` in words, with the time apart so a
 *    card can set it in Mono, and the actions the state allows.
 *
 * The old pages are not rewired yet; they move to this when they move to the
 * kit (plan 029: a page moves whole).
 */

export type GoingOut =
  /** Quincy wrote it and you have not decided. Nothing has a time. */
  | { kind: "writing" }
  /** Approved, with a queued time. `at` is already in the reader's zone. */
  | { kind: "scheduled"; at: string; beyondThisWeek: boolean }
  /** Approved, but this channel has no standing slot at all. */
  | { kind: "no-slot" }
  /** Approved, the channel has slots, and every one in the horizon is taken. */
  | { kind: "slots-full" }
  /** Approved before the slot existed, so placement never ran for it. */
  | { kind: "slot-came-later" }
  /** Approved, and the reader holds no placement (a chat snapshot). */
  | { kind: "approved" }
  /** Claimed by a sender. Nobody can say yet whether it went. */
  | { kind: "sending" }
  /** It went out. `at` is a formatted time or "just now". */
  | { kind: "published"; at: string; url: string | null }
  /** It tried and did not go. `error` is the platform's words, never ours. */
  | { kind: "failed"; error: string | null }

export type GoingOutKind = GoingOut["kind"]

/** What the session knows that the server row does not show yet. */
export type GoingOutSession = {
  /** What the approval you just made returned. */
  placement?: ApprovalPlacement
  /** What Post now just returned. */
  posted?: SendNowResult
  /**
   * How to say `placement.at`. Injected so the result is the same on the
   * server, on the client and in a test. The default matches draft-pane.tsx.
   */
  formatAt?: (at: Date, beyondThisWeek: boolean) => string
}

/** The fields of a `Version` this needs. A full `Version` fits. */
export type GoingOutVersion = Pick<Version, "state" | "goingOut" | "hasSlot" | "sent">

function defaultFormatAt(at: Date, beyondThisWeek: boolean): string {
  return at.toLocaleString(undefined, {
    weekday: beyondThisWeek ? "short" : "long",
    ...(beyondThisWeek ? { day: "numeric", month: "short" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * One channel version of a draft, as Drafts and the DraftCard hold it.
 *
 * Server truth first, session memory second — the order `when()` settled on.
 * What already happened (published, sending, failed) beats any plan; what you
 * just pressed beats a row the page has not re-read.
 */
export function goingOutOfVersion(
  version: GoingOutVersion,
  session: GoingOutSession = {}
): GoingOut {
  const { placement, posted, formatAt = defaultFormatAt } = session

  if (version.sent?.state === "published") {
    return { kind: "published", at: version.sent.at, url: version.sent.url }
  }
  if (posted) {
    return posted.ok
      ? { kind: "published", at: "just now", url: posted.url }
      : { kind: "failed", error: posted.message }
  }
  if (version.sent?.state === "sending") return { kind: "sending" }
  if (version.sent?.state === "failed") {
    return { kind: "failed", error: version.sent.error }
  }
  if (version.goingOut) {
    return { kind: "scheduled", at: version.goingOut, beyondThisWeek: false }
  }
  if (placement?.scheduled) {
    return {
      kind: "scheduled",
      at: formatAt(placement.at, placement.beyondThisWeek),
      beyondThisWeek: placement.beyondThisWeek,
    }
  }
  // Writing is checked after the session: an approval the page has not
  // re-read still reads `writing` on the row.
  if (version.state === "writing" && !placement) return { kind: "writing" }
  if (placement && !placement.scheduled && placement.reason === "slots-full") {
    return { kind: "slots-full" }
  }
  if (version.hasSlot) return { kind: "slot-came-later" }
  return { kind: "no-slot" }
}

/**
 * One scheduled post in the week. `day` is the Day's label ("Today", "Thu"),
 * because `Entry.time` is the hour only.
 */
export function goingOutOfEntry(
  entry: Pick<Entry, "state" | "time" | "url" | "error">,
  day?: string
): GoingOut {
  const at = day ? `${day} ${entry.time}` : entry.time
  switch (entry.state) {
    case "queued":
      return { kind: "scheduled", at, beyondThisWeek: false }
    case "sending":
      return { kind: "sending" }
    case "published":
      return { kind: "published", at, url: entry.url }
    case "failed":
      return { kind: "failed", error: entry.error }
  }
}

/**
 * The receipt in the chat after Approve. A failed preview says nothing about
 * a time, so it reads as approved with no placement, as `receiptFor()` did.
 */
export function goingOutOfPreview(preview: ApprovalPreview | null): GoingOut {
  if (!preview || !preview.ok) return { kind: "approved" }
  if ("goingOut" in preview) {
    return {
      kind: "scheduled",
      at: preview.goingOut,
      beyondThisWeek: preview.beyondThisWeek,
    }
  }
  return preview.reason === "slots-full" ? { kind: "slots-full" } : { kind: "no-slot" }
}

export type GoingOutLine = {
  /** Words before the time. The whole sentence when `at` is null. */
  before: string
  /** The time, for Mono. Null when the state has none. */
  at: string | null
  /** Words after the time, with the full stop. Empty when there are none. */
  after: string
  /** The whole sentence, for a plain string (aria, a title, a test). */
  text: string
  /**
   * `wrong` for a post that did not go. Not red: refusals are ink
   * (docs/design/states.md). It decides `role="status"` and the time's tone.
   */
  tone: "plain" | "quiet" | "wrong"
  /** The live post, once there is one. */
  url: string | null
  /** Reopen / Undo applies: approved, and nothing is out or in flight. */
  undoable: boolean
  /** Post now applies: approved, nothing out, nothing in flight. */
  postable: boolean
  /** "Give it a time" applies: a slot exists and this has none. */
  placeable: boolean
}

function line(
  parts: Pick<GoingOutLine, "before" | "tone"> &
    Partial<Omit<GoingOutLine, "text" | "before" | "tone">>
): GoingOutLine {
  const at = parts.at ?? null
  const after = parts.after ?? ""
  const text = at ? `${parts.before} ${at}${after}` : `${parts.before}${after}`
  return {
    before: parts.before,
    at,
    after,
    text,
    tone: parts.tone,
    url: parts.url ?? null,
    undoable: parts.undoable ?? false,
    postable: parts.postable ?? false,
    placeable: parts.placeable ?? false,
  }
}

/**
 * Says a `GoingOut`. `channel` is the display name ("LinkedIn"): a slot made
 * for X does nothing for a LinkedIn version, so the sentence names which.
 */
export function goingOutLine(g: GoingOut, channel: string): GoingOutLine {
  switch (g.kind) {
    case "writing":
      return line({ before: "Nothing goes out until you approve it.", tone: "quiet" })
    case "scheduled":
      return line({
        before: "Goes out",
        at: g.at,
        after: g.beyondThisWeek ? ", past the week Lineup shows." : ".",
        tone: "plain",
        undoable: true,
        postable: true,
      })
    case "no-slot":
      return line({
        before: `No ${channel} slot yet, so it has no time. Give it one on Lineup, or send it now.`,
        tone: "quiet",
        undoable: true,
        postable: true,
      })
    case "slots-full":
      return line({
        before: `Every ${channel} slot is taken for the next two weeks. Free one on Lineup, or send it now.`,
        tone: "quiet",
        undoable: true,
        postable: true,
      })
    case "slot-came-later":
      return line({
        before: "Approved before that slot existed, so it has no time yet.",
        tone: "quiet",
        undoable: true,
        postable: true,
        placeable: true,
      })
    case "approved":
      return line({ before: "Approved.", tone: "plain", undoable: true })
    case "sending":
      return line({
        before: "Quincy is sending this one. Check the account before you try again.",
        tone: "quiet",
      })
    case "published":
      return line({ before: "Posted", at: g.at, after: ".", tone: "plain", url: g.url })
    case "failed":
      return line({
        before: g.error ?? "It did not go out.",
        tone: "wrong",
        undoable: true,
        postable: true,
      })
  }
}
