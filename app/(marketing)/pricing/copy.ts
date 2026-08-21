import {
  BookOpen01Icon,
  Link03Icon,
  Mic01Icon,
  Note01Icon,
  PencilEdit02Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"

/**
 * A named thing a step touches — a channel you connect, or a kind of material
 * that arrives. Rendered by the same rule
 * `components/sources/source-mark.tsx` follows: a real brand mark if
 * `components/channels/platform-mark.tsx` has one, otherwise a hugeicon.
 *
 * **This list is a promise, so it holds only what works.** Naming a platform on
 * a pricing page is telling somebody their account will connect.
 */
export type Mark = {
  /** Matches a `PATHS` key in platform-mark.tsx when a brand mark exists. */
  id: string
  label: string
  /** Used only when there is no brand mark for `id`. */
  icon?: IconSvgElement
}

export type Step = {
  icon: IconSvgElement
  label: string
  body: string
  marks?: readonly Mark[]
}

/**
 * The pricing page's words, and where each one comes from.
 *
 * **Every claim here is read out of the shipped system.** A pricing page is the
 * one surface where a wrong sentence is a refund request, so the sources are
 * named inline and the things that are *not* true yet are listed at the bottom
 * rather than quietly omitted.
 *
 * Chosen from `app/prototypes/pricing` — see plans/020 for the four directions
 * and why this one won.
 */

/** The one plan. Written the way it is read, not as a number and a unit. */
export const PRICE = {
  figure: "$49",
  period: "a month",
  /** Stated because the seller is Norwegian and the charge is not in kroner. */
  currency: "US dollars, billed monthly",
} as const

/**
 * The first day, as the five things a person actually does.
 *
 * **The order is the flow's, and the reversal in step two is the product.** You
 * never describe yourself to Quincy. You connect an account, it reads what you
 * already published, and *it* writes the description — then you correct it, and
 * the correction is permanent. A sequence that opened with "write down how you
 * sound" would be selling a worse product than the one that exists.
 *
 * The chain, in code:
 *
 * 1. `channel_connection` — OAuth.
 * 2. `lib/corpus-x.ts` — one press on /sources reads your own timeline into
 *    `source_item`, verbatim, interpreting nothing. Metered: X removed its free
 *    tier in February 2026, so every page is bought at ~$0.005 a post.
 * 3. `lib/voice.ts` — the single model call in that pipeline, same press. It
 *    emits a `portrait` ("specific enough that a stranger could pick their post
 *    out of a lineup"), rules stated as frequencies rather than absolutes, and
 *    stories carrying verbatim quotes and proof URLs. Written as
 *    `provenance: "published"`.
 * 4. `lib/voice.ts:240`, inheriting `lib/heartbeat.ts:195` verbatim — a page
 *    whose provenance is `user` is yours, and no later compile overwrites it.
 * 5. `riff` → `draft` → the approval gate in `app/api/chat`.
 *
 * Steps 2 and 3 are one row because they are one press: `importFromX()` imports
 * and compiles in a single action, and splitting them would invent a step
 * nobody takes.
 *
 * **Deliberately not claimed.** Scheduling: `scheduled_post` is empty. Sources
 * beyond your own channels: `source_connection` is empty and `lib/sources.ts`
 * returns `{}` for every real account. And the connector-fed version of step
 * four — bookmarks and meetings arriving on their own — is the intended design
 * and does not work: `bookmarks-to-posts` is scheduled, has run five times, and
 * has failed five times (403 from the bookmarks endpoint, an API-tier problem
 * rather than a bug a retry clears). Step four therefore stands on voice notes,
 * which produce 6 of the 10 riffs in production today.
 *
 * Rewrite step four the day one bookmarks run returns `ok`. It is the better
 * sentence and it will be true then.
 */
export const SEQUENCE: readonly Step[] = [
  {
    icon: Link03Icon,
    label: "You connect the accounts you already post from",
    body: "Quincy learns each channel’s real ceiling and its real fold, so a draft is written against the limit rather than trimmed to it afterwards.",
    /**
     * **Two, because there are two.** `ConnectableChannel` in lib/channels.ts
     * is a union of exactly `"x" | "linkedin"`, and both are live in
     * production. platform-mark.tsx carries marks for nine more — Threads,
     * Bluesky, Instagram, Mastodon, Substack, TikTok, YouTube, Kit, GitHub —
     * and putting any of them here would tell a stranger their account
     * connects when there is no OAuth config, no scope set and no publisher
     * for it. The one number a reader takes from this row is "does it do
     * mine", and getting that wrong is the most expensive error on the page.
     *
     * LinkedIn is worth a footnote at promotion time: it issues no
     * programmatic refresh token to non-partners, so a connection genuinely
     * ends every 60 days and the person has to come back. Not stated here —
     * a renewal detail is a settings-page fact, not a pricing one — but it is
     * the sort of thing that belongs in the answer if anyone asks.
     */
    marks: [
      { id: "x", label: "X" },
      { id: "linkedin", label: "LinkedIn" },
    ],
  },
  {
    icon: BookOpen01Icon,
    label: "It reads those posts back and writes your portrait",
    body: "Not a form you fill in. Quincy reads what you have already published and writes down how you sound — the habits it can evidence, and the stories you keep returning to, each one carrying the posts that prove it.",
  },
  {
    icon: PencilEdit02Icon,
    label: "You correct the parts it got wrong",
    body: "And it never touches those pages again. A line you rewrite is yours, and every later pass writes around it rather than over it.",
  },
  {
    icon: Mic01Icon,
    label: "You talk, and it turns up as material",
    body: "Quincy takes the voice note as it is, ramble and all, and finds the angles in it worth taking — then writes each channel on its own terms and in your voice. Not one string pasted into five boxes.",
    /**
     * **These three are the `riff.source_id` values that exist**, and their
     * counts are why they are ordered this way: `voice` 6, `notes` 2, `x` 2.
     * Nothing here is aspirational.
     *
     * The register at /sources lists nine more — Granola, Fathom, Slack, Loom,
     * email, photos, Notion, calendar, RSS — and every one of them is dark:
     * `source_connection` has zero rows, `lib/sources.ts` returns `{}` for
     * every real account, and no rhythm runs that would read them. Meetings
     * (plans/019) and shipped work (plans/021) are written and unbuilt. They
     * belong on this row the day one of them produces a riff.
     */
    marks: [
      { id: "voice", label: "A voice note", icon: Mic01Icon },
      { id: "notes", label: "Anything you paste", icon: Note01Icon },
      { id: "x", label: "A post worth answering" },
    ],
  },
  {
    /**
     * The same tick `components/drafts/draft-card.tsx` marks an approved draft
     * with. The last step on this page and the control it describes inside the
     * product are the same act, so they are the same mark — a stranger who
     * signs up meets this glyph again on the surface where it does the work.
     */
    icon: Tick02Icon,
    label: "You approve, and only then does it go",
    body: "It stops. Every version waits, and there is no switch anywhere that turns that off.",
  },
] as const

/**
 * The refusals, carried over from the Contract direction in the marketing
 * round. A pricing page is where somebody decides whether to trust you with
 * their name, which is the question a list of refusals answers.
 */
export const REFUSALS = [
  {
    never: "Never posts anything you have not read",
    because:
      "Autoposting would have to be a decision made on purpose, not a default that arrives in a release note.",
  },
  {
    never: "Never cites a number you have not confirmed",
    because:
      "A figure in a post has to trace to something you can point at, or it is a liability with your name on it.",
  },
  {
    never: "Never invents a source",
    because:
      "One fabricated quote costs more trust than a year of good posts earns.",
  },
  {
    never: "Never shows you a follower chart",
    because:
      "Reach now follows the post, not the account. A follower line is a vanity number with a story attached to it.",
  },
  {
    never: "Never runs a thousand faceless accounts in your name",
    because:
      "The volume argument is right, and farming anonymous handles is still not what you hired a Head of Content for.",
  },
] as const

/**
 * The three questions a stranger actually has at a price — when am I charged,
 * what happens if I do nothing, and how do I leave.
 *
 * Sourced from `docs/billing.md` and `lib/entitlement.ts`. Two things are
 * deliberately absent: there is no tax statement, because Codebase AS has no
 * MVA or Stripe Tax handling and $49 is currently the charged amount; and there
 * is no "cancel and pay nothing more" flourish, because cancelling ends the
 * renewal and does not refund the period already paid for.
 */
export const QUESTIONS = [
  {
    q: "When does the card come out?",
    a: "After the free day, and only if you choose to continue. Quincy does not ask for one to start — the day begins when you verify your email, not when you sign up.",
  },
  {
    q: "What happens if I do nothing when the day ends?",
    a: "The account goes read-only. Your brain, your drafts and your conversations are all still there to read. What stops is the spending, not the access.",
  },
  {
    q: "Can I cancel?",
    a: "In the billing portal, in one press. The subscription runs to the end of the period you have already paid for and then stops.",
  },
] as const
