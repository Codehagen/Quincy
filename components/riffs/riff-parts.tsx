"use client"

import * as React from "react"
import Link from "next/link"
import {
  Alert01Icon,
  ArrowRight01Icon,
  Delete02Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { useRouter } from "next/navigation"

import {
  archiveRiff,
  discardAngle,
  draftAngle,
} from "@/app/(app)/riffs/actions"
import type { Angle, Riff } from "@/lib/riffs"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SourceMark } from "@/components/sources/source-mark"

/**
 * The pieces a riff card is built from.
 *
 * Lives here rather than inside the page so `app/prototypes/riffs` can mount
 * the **production** components against its own fixtures — what got reviewed is
 * what ships, not a copy that drifts from it within a week.
 *
 * Three rules from design-foundations drive most of what is here:
 *
 * - **Prose gets a measure.** An angle is a sentence someone has to read, so it
 *   caps at 60ch. The rest of the app is chrome and does not need one; this
 *   surface is the exception because it is the only place the product shows you
 *   writing rather than labels.
 * - **One primary action per view.** "Draft this" is it. Everything else —
 *   discard, open the source, ask for more — is ghost or text. Three equal
 *   buttons would mean no next step.
 * - **Every state is designed.** `working` is a skeleton that holds the card's
 *   real shape rather than a spinner that collapses it, so angles arriving does
 *   not move the page under your cursor.
 */

/**
 * Provenance. The line only a sources model can draw.
 *
 * Also the riff card's accessible name: the `id` here is what each `<article>`
 * points `aria-labelledby` at. Four unnamed articles announce as "article,
 * article, article, article", and the page's only heading is its own title, so
 * without this there is nothing to navigate a list of distinct things by.
 * "Voice notes 2 hours ago" is the right length for a name — the scrap is a
 * paragraph and would be read out in full every time.
 */
export function Provenance({
  riff,
  id,
  className,
  dateInGroupHeading = false,
}: {
  riff: Riff
  id?: string
  className?: string
  /**
   * Set when the riff sits under a day heading that already says when.
   *
   * The page groups by `capturedAt`, so inside a group headed "Today" every
   * provenance line would end in "· Today" — the same duplication the Fold
   * prototype was caught on, one level up.
   *
   * The date does not leave, it goes `sr-only`. This `<p>` is the article's
   * accessible name via `aria-labelledby`, and deleting the date outright
   * would announce five of today's voice riffs as "article, Voice notes" five
   * times, with nothing to tell them apart — a heading a sighted reader can
   * see is not one a screen reader gets for free inside each article.
   */
  dateInGroupHeading?: boolean
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <SourceMark
        id={riff.sourceId}
        label={riff.sourceLabel}
        className="size-6"
      />
      <p id={id} className="text-caption text-muted-foreground">
        {/* A typed riff carries no source — see `TYPED_SOURCE`. Without a
            fallback the line renders as a bare middot and a date, and the
            article's accessible name loses the one word saying where the
            material came from. The label is display-only: nothing is written to
            `source_id`, so /sources still lists only things you can connect. */}
        {riff.sourceLabel || "Written here"}
        {dateInGroupHeading ? (
          <span className="sr-only"> {riff.capturedAt}</span>
        ) : (
          <>
            {/* Middot as a real character, never three dots or a hyphen
                standing in for one. Hidden from the name, so the article reads
                as "Voice notes 2 hours ago" rather than
                "Voice notes middot". */}
            <span aria-hidden="true"> · </span>
            {riff.capturedAt}
          </>
        )}
        {/* Whose post this came out of, on the same line rather than its own.
            On /drafts it earns a second line because the question there is
            "should this go out under my name". Here the scrap is directly
            below and is visibly somebody else's writing, so the line only has
            to name them and link the receipt. */}
        {riff.adaptedFrom ? (
          <>
            <span aria-hidden="true"> · </span>
            {riff.adaptedFrom.url ? (
              <a
                href={riff.adaptedFrom.url}
                target="_blank"
                rel="noreferrer noopener"
                className="underline underline-offset-4 hover:text-foreground"
              >
                {riff.adaptedFrom.handle
                  ? `@${riff.adaptedFrom.handle}`
                  : "the post"}
              </a>
            ) : (
              `@${riff.adaptedFrom.handle}`
            )}
          </>
        ) : null}
      </p>
    </div>
  )
}

/**
 * The raw material, verbatim.
 *
 * Quoted rather than paraphrased and never truncated: this is the user's own
 * sentence, and a scrap you cannot read in full is a scrap you cannot judge the
 * angles against. Card radius is 20px against 16px padding, so this derives to
 * 4px.
 */
export function Scrap({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="rounded-xs bg-muted/50 px-3 py-2">
      {/* `whitespace-pre-line` keeps the blank lines the author wrote.

          Every scrap before GitHub was one paragraph — a voice note is one
          person talking, and a meeting passage is joined turns — so a single
          `<p>` was enough and newlines collapsing was invisible. A pull request
          description is five paragraphs, and they arrived as one wall of text.

          `pre-line` rather than several `<p>` elements, because the card clamps
          this with `[&_p]:line-clamp-4`: one paragraph per element would clamp
          each of them to four lines instead of the quotation as a whole.

          Safe against soft wraps: `flattenMarkdown` in lib/shipped-work.ts
          already collapses newlines *inside* a paragraph, so what reaches here
          is only the breaks between them. */}
      <p className="max-w-[60ch] text-caption text-pretty whitespace-pre-line">
        {children}
      </p>
    </blockquote>
  )
}

/**
 * The slot beside the shape tag, and what used to be in it.
 *
 * `SHAPE_NOTE` lived here until 2026-08-10 and mapped each shape to four fixed
 * words — "One idea, no setup", "Needs the numbers" — which explained the
 * *category* directly in front of `angle.why`, the one line that is about the
 * user's own material. Joined by a middot, the two read as one sentence, so
 * people started on a definition of "Short post" and never learned that the
 * rest was about them. Two readers reported exactly that.
 *
 * Commit 729f039 had already caught the repetition and answered it with
 * `explainShape`, which showed the gloss once per distinct shape in a riff.
 * That reduced the count and left the confusion, because position was the
 * problem. The gloss is gone, and what replaces it is a fact the card had
 * never stated: how many drafts the button writes.
 *
 * The condition each shape is right for still exists, and still does real work
 * — `SHAPE_GUIDE` in lib/adapt.ts, where it steers the model that picks.
 *
 * **The noun is "post" for every shape, and that is not laziness.** The first
 * cut of this line named the artefact each shape implies — thread, deck,
 * piece — and every one of those was a promise the product cannot keep today.
 * `generateDraft` writes one `draft_version.body` per channel and lib/drafting
 * says so outright: "every version is a single post: this plan does not add a
 * threaded or multi-part body format." A Carousel is the sharpest case. It maps
 * to LinkedIn and Instagram, Instagram is not in `CONNECTABLE_CHANNELS`, and
 * the two Carousel angles ever drafted both produced one LinkedIn text row.
 * "writes 1 deck" would have been the card lying about the thing this whole
 * change exists to state honestly.
 *
 * So the shape tag carries the ambition and this number carries the outcome.
 * The day slides, threads or long-form become real artefacts, this is where
 * their nouns go.
 */

/**
 * One angle.
 *
 * The hook is the content and gets `text-card-title`; the shape and the
 * reasoning recede. Hierarchy by subtraction — making the hook prominent means
 * quieting everything around it rather than bolding it harder.
 *
 * **The row was decided at /prototypes/angle on 2026-08-10**, after two
 * readers said they could not tell what the card was going to draft. Layout is
 * unchanged from what shipped; three things about the text changed.
 *
 * - The static gloss is deleted. The block directly above has the argument.
 * - `why` moved off the tag row onto its own line, and gained a speaker. It
 *   averaged 167 characters and reached 325 in `riff_angle` on the day of the
 *   decision, so it is a paragraph, and a paragraph that starts on a row of
 *   labels is read as a label.
 * - The count took the gloss's slot. `CHANNELS_FOR_SHAPE` maps a short post to
 *   two channels and `targetsFor` writes one version per channel, so most
 *   angles here produce **two posts**. The card had never said so.
 *
 * Three layouts were built against the same real rows and rejected:
 *
 * - **Preview** drew the hook inside a plate under the account's own name and
 *   handle, answering "what will it draft" by resemblance. It won the question
 *   and lost on height: a plate per angle makes a four-angle riff a scroll.
 *   Worth reviving if the answer ever needs to be a picture.
 * - **Plain** deleted the tag and the marks and stated the outcome in words
 *   only. It read well and took the shape vocabulary — the words /drafts and
 *   /channels are built on — off the one page that teaches it.
 * - **Pick one** collapsed the angles to hooks with one open at a time. It is
 *   the right answer to a riff with four 250-character arguments on it, and
 *   the wrong one to a riff with one. It is the same idea as the Fold variant
 *   parked in app/(app)/riffs/page.tsx, and it should return with it, at the
 *   same trigger: roughly ten riffs on a real account.
 */
export function AngleCard({
  angle,
  onQuiet = false,
  meta,
  writes,
  children,
}: {
  angle: Angle
  /** Set inside a two-pane layout, where the card already sits on a card. */
  onQuiet?: boolean
  /**
   * Beside the shape tag, before the reasoning.
   *
   * A slot rather than a `channels` prop, because what belongs next to the
   * shape is "one more fact of the same size as the shape" and the card has no
   * business knowing that today's fact is a set of platform marks. It exists
   * because the destination genuinely belongs *there*: `Thread` and the X mark
   * are the same kind of statement about what this angle becomes, and pushing
   * the mark below the reasoning — the only place `children` could put it —
   * separated the two halves of one thought.
   */
  meta?: React.ReactNode
  /**
   * How many drafts "Draft this" writes, for this account and this shape.
   *
   * From `writesPerShape` in lib/drafting.ts, which counts `targetsFor` — the
   * function that does the writing — so the row cannot promise a post to a
   * channel the account has not connected.
   *
   * Resolved on the server and passed down, never derived here: it depends on
   * live connections, and a client component has no business fetching those
   * per angle. Same reasoning as `gaps` on `RiffCard`.
   *
   * Optional, and the line simply does not render when it is absent. A card
   * mounted outside /riffs — the prototypes frame — has no account to answer
   * for, and a guess would be worse than silence.
   */
  writes?: number
  /** The card's actions, so a variant can decide where the decision lives. */
  children?: React.ReactNode
}) {
  const drafted = angle.status === "drafted"

  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-lg p-3",
        onQuiet ? "bg-muted/40" : "bg-card shadow-xs",
        // A decided angle recedes. It is not removed: a riff whose angles
        // vanish one at a time leaves you no way to see what you already chose,
        // and deciding twice is how a triage surface loses your trust.
        //
        // It recedes by *surface and token*, never by opacity. `opacity-70`
        // was the first attempt and measured 4.87:1 on the hook — it passes,
        // but only because of what happens to sit behind it, which is the
        // exact reason design-foundations says to dim with a token instead.
        // Dropping the elevation and moving the hook to muted-foreground lands
        // at a value that is the same wherever the card is placed.
        //
        // **No entrance animation, deliberately.**
        //
        // There was one: a 40ms stagger, which is the right treatment for
        // angles *arriving* — the `working` → `ready` moment, where motion
        // carries information. It is the wrong treatment for page load. When
        // you open /riffs the angles are already sitting in their resting
        // position; nothing arrived, you navigated. With four riffs that was
        // ~360ms of movement before the page was still, every visit, on a page
        // you open several times a day. Motion on load is what makes a product
        // feel slow rather than alive.
        //
        // The `index` prop went with it rather than lingering unused: an
        // argument kept for a feature that does not exist yet is one lint
        // warning away from being deleted by someone who does not know why it
        // was there. Re-adding it costs one line.
        drafted && "bg-muted/40 shadow-none"
      )}
    >
      <p
        className={cn(
          "max-w-[60ch] text-card-title text-pretty",
          drafted && "text-muted-foreground"
        )}
      >
        {angle.hook}
      </p>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {/* A tag, not a badge: it names a category rather than counting
            anything. Kept as text on a quiet fill rather than an outlined pill,
            so it does not compete with the hook above it.

            Kind and shape share one tag rather than taking two, and that is
            the `SHAPE_NOTE` lesson applied before it could be repeated: a
            second element on this row is a second thing to read before
            `angle.why`, which is the line that is actually about the user.
            They belong together anyway — "Announcement · Short post" is one
            statement of what this would be, and it reads as one because it is
            one. Kind first: it is the part a person choosing between angles
            cares about, where shape mostly decides where it can go.

            Empty kind renders the shape alone, which is every angle written
            before the column existed. No placeholder and no "Uncategorised" —
            an unknown is not a category. */}
        <span className="rounded-xs bg-muted px-1.5 py-0.5 text-caption text-muted-foreground">
          {angle.kind ? `${angle.kind} · ${angle.shape}` : angle.shape}
        </span>
        {meta}
        {/* What the button does, in three words. The marks beside it say
            where; this says how many, which is the part nobody could guess —
            a short post reaching two channels is written twice, once for
            each, and the card has never said so. Lower case because it reads
            as one more item in the row rather than a sentence of its own. */}
        {writes === undefined ? null : (
          <p className="text-caption text-muted-foreground">
            {writes === 0
              ? "no channel for this yet"
              : `writes ${writes} post${writes === 1 ? "" : "s"}`}
          </p>
        )}
      </div>

      {/* Quincy's argument, on its own line and with a speaker.

          It averaged 167 characters and reached 325 in the `riff_angle` table
          on 2026-08-10. That is a paragraph, and a paragraph that begins on a
          row of labels reads as an overflow of the labels — which is how two
          readers came to think "One idea, no setup · you didn't just state an
          opinion here…" was one continuous claim about their voice note.

          Three words in the foreground weight name the speaker. No rule and no
          box: nothing else inside this tile has a divider, and adding one would
          make the fix louder than the thing it fixes. */}
      <p className="max-w-[60ch] text-caption text-pretty text-muted-foreground">
        <span className="font-medium text-foreground">Why this one — </span>
        {angle.why}
      </p>

      {drafted ? <Drafted fellBack={angle.fellBack === true} /> : children}
    </li>
  )
}

/**
 * What "Draft this" leaves behind.
 *
 * A statement plus a way to follow it, not a toast that disappears before you
 * look up. The link is the only thing on a decided angle you can still press,
 * which is the point: the decision is made, the writing happens elsewhere.
 *
 * **`fellBack` is the sentence this card was missing.** A tick and "In Drafts"
 * is a promise that something got written, and on 2026-08-08 it was made over a
 * draft whose body was this exact hook — the model failed twice, the fallback
 * did its job, and the card said nothing. The claim now matches what is
 * actually waiting: same row, same place, no dialog and nothing to dismiss,
 * because the draft does exist and going to look at it is still the next move.
 *
 * Not `destructive`. Nothing was lost and nothing is broken — there is a draft,
 * it is just your own line rather than Quincy's paragraph. Red here would
 * teach people to flinch at a row that mostly means "your turn".
 */
function Drafted({ fellBack }: { fellBack: boolean }) {
  return (
    <div className="flex flex-col gap-1 pt-1">
      <div className="flex items-center gap-2">
        <p className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
          <HugeiconsIcon
            aria-hidden="true"
            icon={fellBack ? Alert01Icon : Tick02Icon}
            className="size-3.5"
          />
          In Drafts
        </p>
        <Link
          href="/drafts"
          className="text-caption text-foreground underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-current"
        >
          Open it
        </Link>
      </div>
      {fellBack ? (
        <p className="max-w-[60ch] text-caption text-pretty text-muted-foreground">
          Quincy could not write this one. The draft is your hook, waiting for
          you.
        </p>
      ) : null}
    </div>
  )
}

/** The one way out of a refusal. Inherits the destructive colour rather than
 *  sitting in it as a filled button — the fix is offered, not sold. */
function RefusalLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="text-caption text-destructive underline decoration-destructive/40 underline-offset-4 hover:decoration-current"
    >
      {children}
    </Link>
  )
}

/**
 * One angle's actions.
 *
 * **Deliberately not brass.** Each angle is its own post, so the decision
 * belongs here rather than on the riff — but three angles means three of these
 * on one card, and three filled primaries stacked is the textbook way to end up
 * with no clear next step. More than that, brass on one of them would mean
 * Quincy had picked, and picking is the whole job this page hands to you. So
 * the riff card has no primary action at all: the three hooks are the emphasis,
 * and the buttons stay quiet under them.
 *
 * Discard sits at the far edge with real space between them. Proximity implies
 * equivalence, and drafting and discarding are not equivalent in either
 * direction.
 */
export function AngleActions({ angle }: { angle: Angle }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  /**
   * The refusal, held until something else happens.
   *
   * `draftAngle` has always returned a sentence on `ok: false` and this
   * component has always thrown it away — press "Draft this" with a spent free
   * day and the button said "Drafting…", came back, and nothing moved. That is
   * the most likely failure on the page, because it is the one that fires on
   * the happy path the day a trial ends.
   *
   * State rather than a toast, and it stays put: this is about money, and
   * somebody who looks away and back needs it to still be there. The
   * `written`/`fellBack` half of the receipt is deliberately *not* handled
   * here — a successful draft makes this angle decided, which unmounts this
   * component mid-render, so that half is derived server-side and rendered by
   * `<Drafted />`. See `Angle.fellBack`.
   */
  const [refused, setRefused] = React.useState<{
    reason: string
    message: string
  } | null>(null)
  const label = angle.hook

  return (
    <div className="flex flex-col gap-2 pt-1">
      {/* `role="status"`, matching AdaptBox and RecordBox: it appears without
          focus moving, so a screen reader is told rather than left to find it.
          The live region is the wrapper and is always mounted — announcing
          from an element that arrives with its own text is unreliable. */}
      <div role="status" aria-live="polite">
        {refused ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2">
            {/* The action's own sentence, unedited. It is the only thing that
                knows which of the four causes happened. */}
            <p className="max-w-[60ch] text-caption text-pretty text-destructive">
              {refused.message}
            </p>
            {/* One link, chosen by cause. A lapsed subscription is fixed on
                the billing page and a shape with nowhere to land is fixed on
                /channels; "No such angle." has no fix, so it gets no link
                rather than a button that goes somewhere unrelated. */}
            {refused.reason === "entitlement" ? (
              <RefusalLink href="/settings/billing">See plans</RefusalLink>
            ) : refused.reason === "no-channel" ? (
              <RefusalLink href="/channels">Connect a channel</RefusalLink>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {/* Wired at last. This shipped with no handler because /drafts was a
            placeholder and a drafted angle had nowhere to land; it lands in a
            real table now.

            `disabled` while the write is in flight, and the label says what is
            happening — forms-and-inputs asks for both, and without the first a
            double click makes two drafts out of one angle. */}
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          aria-label={`Draft: ${label}`}
          onClick={() =>
            startTransition(async () => {
              // Clear first: a second press that fails for a second reason
              // should not read as the first message never having gone.
              setRefused(null)
              // The id and nothing else. Hook, shape and provenance are read
              // from the row server-side — see `getOwnedAngle`. A client that
              // could name the hook could get anything written under this
              // account's name.
              const result = await draftAngle({ angleId: angle.id })

              if (!result.ok) {
                setRefused({ reason: result.reason, message: result.message })
                // No refresh. Nothing was written, so re-reading the page
                // would cost a round trip to render the same angle back.
                return
              }

              // The angle re-renders as decided because /riffs re-reads which
              // hooks have drafts. `refresh` is what pulls that down.
              router.refresh()
            })
          }
        >
          {pending ? "Drafting…" : "Draft this"}
          <HugeiconsIcon
            aria-hidden="true"
            data-icon="inline-end"
            icon={ArrowRight01Icon}
          />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          className="ml-auto text-muted-foreground"
          aria-label={`Discard: ${label}`}
          onClick={() =>
            startTransition(async () => {
              setRefused(null)
              const result = await discardAngle({ angleId: angle.id })
              if (!result.ok) {
                setRefused({ reason: "gone", message: result.message })
                return
              }
              // The row is gone server-side; this is what removes the card.
              router.refresh()
            })
          }
        >
          <HugeiconsIcon aria-hidden="true" icon={Delete02Icon} />
          {pending ? "Discarding…" : "Discard"}
        </Button>
      </div>
    </div>
  )
}

/**
 * Steering, which is the only kind of editing this page allows.
 *
 * Riffs is where you judge and Drafts is where you write; two editors would
 * dissolve that line and have you writing before you had decided, which is the
 * thing this surface exists to prevent. What does belong is telling Quincy it
 * read the material wrong — direction, not text.
 *
 * A real `<form>`, so Enter submits. A real `<label>`, because a placeholder
 * disappears at the exact moment the reminder is needed — and it is `sr-only`
 * rather than absent, since the button beside it already names the action for
 * anyone who can see it.
 */
export function Steer({ riffId }: { riffId: string }) {
  const [open, setOpen] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const formId = `steer-${riffId}`
  const inputId = `${formId}-input`

  // Focus follows disclosure. A field that appears without focus makes you
  // reach for the mouse to use the thing you just asked for.
  React.useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  /**
   * Closing has to hand focus back.
   *
   * `hidden` removes the input from the accessibility tree, so a close that
   * only flips state leaves focus on an element that no longer exists and the
   * browser drops it to `<body>` — measured. A keyboard user then tabs from the
   * top of the document, having lost the riff they were working on. Returning
   * focus to the trigger is the whole contract of a disclosure.
   */
  const close = React.useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [])

  return (
    <div className="flex flex-col gap-2">
      {/* Collapsed by default, and that is the whole point of the change: three
          permanently open forms cost six of this page's twenty-two tab stops
          for an action you only reach for when the angles missed. The
          capability stays, the standing chrome goes.

          The trigger is also what names the field now. A placeholder is not a
          label — it leaves at the moment the reminder is needed — and this
          button says the same words, permanently, above it. */}
      <Button
        ref={triggerRef}
        variant="ghost"
        size="sm"
        className="self-start text-muted-foreground"
        aria-expanded={open}
        aria-controls={formId}
        onClick={() => (open ? close() : setOpen(true))}
      >
        Ask for another angle
      </Button>

      {/* Rendered always, `hidden` when closed: the attribute takes it out of
          both the tab order and the accessibility tree, which keeps
          `aria-controls` pointing at something that actually exists. Toggling
          the element in and out of the DOM would leave that reference dangling
          half the time. */}
      <form
        id={formId}
        hidden={!open}
        className="flex items-center gap-2"
        onSubmit={(e) => e.preventDefault()}
        // Escape closes, the same key that dismisses every other transient
        // thing in the app. Scoped to the form so it never swallows an Escape
        // meant for something else.
        onKeyDown={(e) => {
          if (e.key === "Escape") close()
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Ask Quincy for a different angle on this
        </label>
        <Input
          id={inputId}
          ref={inputRef}
          name="steer"
          placeholder="More like… / less like…"
          className="h-8"
        />
        <Button variant="ghost" size="sm" type="submit">
          Ask
        </Button>
      </form>
    </div>
  )
}

/**
 * The riff-level way out.
 *
 * Relabels once something has been taken, because "Nothing here" and "discard
 * what is left" are different sentences and the button should say which one it
 * is about to do. Ghost and full-width-adjacent rather than destructive-red:
 * dropping a riff loses nothing that was ever written.
 */
export function RiffFooter({
  riffId,
  anyDrafted,
}: {
  riffId: string
  anyDrafted: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      className="self-start text-muted-foreground"
      onClick={() =>
        startTransition(async () => {
          // No confirmation dialog, because nothing is destroyed: `archiveRiff`
          // sets a state and `getRiffs` filters it. A dialog in front of a
          // reversible action trains people to dismiss dialogs.
          await archiveRiff({ riffId })
          router.refresh()
        })
      }
    >
      {pending ? "Clearing…" : anyDrafted ? "Discard the rest" : "Nothing here"}
    </Button>
  )
}

/**
 * `working` — Quincy has the scrap and is still reading it.
 *
 * A skeleton rather than a spinner, and one shaped like the angles that will
 * replace it: the card keeps its height, so the list does not jump when they
 * land. Three bars because three angles is the usual result; being roughly
 * right about the shape is the entire value of a skeleton.
 */
export function AnglesPending({ stuck = false }: { stuck?: boolean }) {
  /**
   * Stopping the shimmer was not enough, and the first version shipped it.
   *
   * A skeleton is a *promise about shape* — three angle-sized bars say "three
   * angles are coming and they will sit here". Holding that promise under a
   * sentence that says Quincy has probably lost it makes the card argue with
   * itself, and the picture wins: people read layout before prose. Freezing
   * the pulse only made it a promise that had stopped moving.
   *
   * So once it is stuck the skeleton goes entirely and the message becomes the
   * whole content. Nothing is being waited for, so nothing should be shaped
   * like the thing that is not coming.
   */
  if (stuck) {
    return (
      <div
        role="status"
        className="rounded-lg border border-border bg-muted/40 px-3 py-3"
      >
        <p className="text-caption text-muted-foreground">
          This is taking longer than it should. Quincy may have lost it —
          recording again is the surest fix.
        </p>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col gap-2"
      role="status"
      aria-label="Quincy is reading this"
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[4.5rem] animate-pulse rounded-lg bg-muted/60"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
      {/* The status is spelled out, not left to the shimmer. A skeleton says
          "something is coming"; it does not say what or why. */}
      <p className="px-1 text-caption text-muted-foreground">
        Quincy is reading this. Angles usually land within a minute.
      </p>
    </div>
  )
}

/**
 * `failed` — Quincy tried to read it and could not.
 *
 * A terminal state with a reason, which is the whole argument for having one.
 * The previous plan deferred two-phase riffs precisely because a skeleton that
 * can hang forever with no retry is worse than a wait you can see the end of;
 * voice made `working` reachable by a row nobody is watching, so this is that
 * end.
 *
 * **The transcript survives a failure and is shown above this**, which is why
 * there is no "your words are gone" apology here — `completeSpokenRiff` stores
 * the scrap before it asks for angles, so the common failure (angles, not
 * transcription) leaves the expensive, unrepeatable half intact. Nobody can
 * say the same thing twice.
 */
export function RiffFailed({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-3"
    >
      <p className="text-caption text-destructive">
        {message || "Quincy could not read this one."}
      </p>
      {/* No retry button. There is nothing to retry with: the audio is deleted
          as soon as it is transcribed (see workflows/run-voice-riff.ts), so a
          button here could only re-run a model over a transcript that is
          already on screen. Recording again is the honest next step and the
          control for it is in the page header. */}
    </div>
  )
}

/**
 * `NoRiffs` lived here until 2026-08-08 and is deliberately gone.
 *
 * It was a card carrying a heading, an explanation and three next steps —
 * Record, Adapt, and a ghost link to /sources. Two of those three are now
 * permanently on screen in `Instrument`, directly above where the card used to
 * render, so the empty state had become decoration around a duplicate of the
 * control above it. The explanation moved into the page as a sentence and the
 * source link went with it; see app/(app)/riffs/page.tsx.
 */
