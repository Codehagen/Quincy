"use client"

import * as React from "react"
import { flushSync } from "react-dom"
import { Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import type { Version } from "@/lib/drafts"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { SourceMark } from "@/components/sources/source-mark"

import {
  Clamp,
  Counter,
  DiscardVersion,
  DuplicateNotice,
  Fold,
  useFocusOnAppear,
  useModifier,
  useRow,
} from "./draft-parts"

/**
 * One channel's version of a piece, as a row in the ledger.
 *
 * **Gutter with an inset separator**, chosen against three other row layouts on
 * the whole production table. The channel sits in a fixed 7rem margin and every
 * text starts on one shared left edge — fixed rather than intrinsic because "X"
 * and "LinkedIn" are three characters apart, and an intrinsic column would
 * stagger the very edge this layout exists to hold straight.
 *
 * The rule between rows starts where the text starts. That keeps the margin a
 * margin: a line crossing both columns turns the stack into table rows, where an
 * inset one reinforces the shared edge it is drawn from. It is drawn at
 * `--border-hairline` — the project's own divider token, 1px and 0.5px at 192dpi,
 * defined in globals.css and used nowhere until this. A plain `border-t` on a
 * retina screen draws at twice this weight.
 *
 * ## The motion, three questions first
 *
 * **Should it animate?** Approving is the page's primary action, run maybe five
 * to twenty times a day. That is "occasional", not the hundreds-per-day band
 * where animation has to be removed outright. So yes, but modestly.
 *
 * **What is the purpose?** State indication, and preventing a jarring change.
 * The row is built so nothing moves — but the two states are not *exactly* the
 * same height (a textarea is not a paragraph, and an Approve row is not a Reopen
 * row), so without a transition the residual few pixels snap. Small unexplained
 * jumps are precisely what reads as broken.
 *
 * **Which easing and how fast?** The element is neither entering nor leaving; it
 * is morphing in place. The view transition it rides on is the product's own —
 * 200ms move, 140ms cross-fade, on the curve in app/globals.css — and the
 * asymmetry is deliberate: the fade should finish before the move does, or you
 * see two states co-existing at the end of the gesture.
 *
 * ## The blur, and why the status slot is a grid
 *
 * The margin's counter ("62 / 280") becoming a tick and the word "Approved" is a
 * cross-fade between two visibly different objects in the same box, which is
 * exactly the case `filter: blur(2px)` exists for: without it you see two things
 * overlapping, with it the eye reads one thing changing.
 *
 * Both states stay mounted in one grid cell rather than swapping, which buys
 * three things at once. The slot's height is the taller of the two and never
 * changes, so the margin cannot shove the text column around. It is a CSS
 * transition rather than keyframes, so approving and undoing quickly retargets
 * instead of restarting. And it needs no view-transition name of its own —
 * `::view-transition-*` is a document-level tree, and scoping a blur to one
 * element inside it is far more machinery than a grid and two opacities.
 */
export type GutterRowProps = {
  version: Version
  draftId: string
  idea: string
  /** True when discarding this one takes the whole piece with it. */
  isLast: boolean
  /** Set when this row appeared because of something you pressed. */
  takeFocus: boolean
  /** The label of a sibling with byte-identical text, when there is one. */
  twin?: string
  onApprove: (text: string) => void
  onDiscard: () => void
  onReopen: () => void
}

export function GutterRow({
  version,
  draftId,
  idea,
  isLast,
  takeFocus,
  twin,
  onApprove,
  onDiscard,
  onReopen,
}: GutterRowProps) {
  const editor = useRow(version, draftId)
  const modifier = useModifier()
  const approved = version.state === "approved"

  /**
   * True for the one frame between pressing Approve and the state committing,
   * during which the field is replaced by its own text.
   *
   * **This is the fix for the box that flashed around the text.** Measured, not
   * guessed: with the row's `view-transition-name` removed the artefact
   * disappears; isolating the two snapshots shows it only in the *old* one; and
   * hiding the textarea before capture removes it entirely. It is not a border,
   * a focus ring or a stray outline — all three compute to zero at the moment
   * `startViewTransition` runs. It is the live `<textarea>`'s own compositing
   * layer edge being painted into the snapshot, which is why it traces the field
   * exactly and carries its `border-radius`.
   *
   * A view transition captures whatever is on screen when it starts, so the only
   * way to keep a form control out of the picture is for it not to be there.
   * `flushSync` is what makes that ordering real — without it React batches the
   * swap past the snapshot and nothing changes.
   *
   * It also makes the morph better on its own terms: both snapshots are now
   * static prose in the same place, so the cross-fade has almost nothing to do.
   */
  const [committing, setCommitting] = React.useState(false)

  // Reopening means you want to edit, so focus lands in the field rather than on
  // a button — except on touch, where focusing a textarea throws the keyboard
  // over half the screen for something you did not ask for.
  const fieldRef = useFocusOnAppear<HTMLTextAreaElement>(
    takeFocus &&
      !approved &&
      typeof window !== "undefined" &&
      !("ontouchstart" in window)
  )
  const reopenRef = useFocusOnAppear<HTMLButtonElement>(takeFocus && approved)

  /**
   * Between the text and the controls, in both states.
   *
   * Under the version it describes, so you read the writing and are then told
   * what is wrong with it — but *above* Approve, which is the part that matters.
   * Rendered after the action row it read as a footnote to a decision you had
   * already made: the one warning on this page whose entire purpose is stopping
   * a press was sitting underneath the button it was trying to stop. The fold
   * line is placed on the same argument and has been all along.
   */
  const notice = twin ? <DuplicateNotice twin={twin} label={version.label} /> : null

  return (
    <div
      className="flex gap-4"
      // **No `view-transition-name` here.** The wrapper in draft-pane.tsx already
      // carries `pane-row-{i}`, and a named descendant is lifted out of its
      // ancestor's snapshot — so naming this too produced two overlapping groups
      // with different geometry, one of them nearly empty. That is the blink. One
      // name per row, on the element the stagger targets.
    >
      {/* The margin. Fixed width, so every text column starts at the same x
          whatever the channel is called. */}
      <div className="flex w-28 shrink-0 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <SourceMark id={version.channel} label={version.label} className="size-5" />
          {/* h3 under the piece's h2. The channel is the name of the thing this
              row contains, which is what a heading is for. */}
          <h3
            className={cn(
              "text-card-title transition-colors duration-150 ease-out",
              approved && "text-muted-foreground"
            )}
          >
            {version.label}
          </h3>
        </div>

        {/* Both states, one cell. See the note above: stable height, blurred
            cross-fade, interruptible. */}
        <div className="grid [&>*]:col-start-1 [&>*]:row-start-1">
          <div
            aria-hidden={approved}
            className={cn(
              "transition-[opacity,filter] duration-200 ease-out",
              approved
                ? "pointer-events-none opacity-0 blur-[2px]"
                : "opacity-100 blur-none"
            )}
          >
            <Counter
              used={editor.used}
              limit={editor.limit}
              over={editor.over}
              messageId={editor.overId}
            />
          </div>
          <div
            aria-hidden={!approved}
            className={cn(
              "transition-[opacity,filter] duration-200 ease-out",
              approved
                ? "opacity-100 blur-none"
                : "pointer-events-none opacity-0 blur-[2px]"
            )}
          >
            <p className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
              <HugeiconsIcon aria-hidden="true" icon={Tick02Icon} className="size-3.5" />
              Approved
            </p>
          </div>
        </div>
      </div>

      {/* The text column. The rule starts here rather than at the row's edge, so
          the margin stays a margin and the line reinforces the shared edge
          instead of crossing it. `group-first/row` because "am I the first row"
          is a fact only the stack knows. */}
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-2",
          "border-t border-border pt-6 [border-top-width:var(--border-hairline)]",
          "group-first/row:border-t-0 group-first/row:pt-0"
        )}
      >
        {approved ? (
          <>
            {/* Recedes by token, never by `opacity` — opacity would make this
                text's contrast depend on whatever sits behind the pane, and it
                is still writing that is about to be published in your name. */}
            <Clamp text={editor.text}>
              {() => (
                <p className="text-body text-pretty whitespace-pre-wrap text-muted-foreground transition-colors duration-150 ease-out">
                  {editor.text}
                </p>
              )}
            </Clamp>
            {notice}
            <Button
              ref={reopenRef}
              type="button"
              variant="ghost"
              size="sm"
              className="-mx-2 self-start text-muted-foreground"
              // Reopening puts the field back, so the pre-commit swap has to be
              // undone with it — otherwise the row would return to edit mode
              // showing prose you cannot type into.
              onClick={() => {
                setCommitting(false)
                onReopen()
              }}
            >
              Reopen
            </Button>
          </>
        ) : (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              /**
               * Drop focus before the transition starts.
               *
               * `startViewTransition` snapshots the page as it is when it is
               * called. Submitting with ⌘+Enter — or after typing — leaves the
               * field focused, so its `ring-3` and `ring-offset-2` are baked
               * into the "before" snapshot and then scaled and cross-faded
               * across the morph. A focus ring is transient UI, not part of the
               * design of either state; it should never be in a snapshot.
               *
               * Nothing is lost by blurring: the field is about to stop
               * existing, and `useFocusOnAppear` places focus on Reopen
               * deliberately once the new state is mounted, which is the handoff
               * a keyboard user actually needs.
               */
              ;(document.activeElement as HTMLElement | null)?.blur()
              // Take the control out of the frame first, then start the
              // transition. Order is the whole trick.
              flushSync(() => setCommitting(true))
              onApprove(editor.text)
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault()
                e.currentTarget.requestSubmit()
              }
            }}
          >
            {/* A real `<label>`, `sr-only` because the channel name renders as a
                visible heading beside it — but it exists, because a placeholder
                is not a label and this field has no placeholder at all. */}
            <label htmlFor={editor.id} className="sr-only">
              {version.label} version of “{idea}”
            </label>
            <Clamp text={editor.text}>
              {({ onFocus }) =>
                committing ? (
                  // Same text, same place, same colour as the field it replaces
                  // — it should be indistinguishable on screen. The only thing
                  // that changes is that there is no longer a form control for
                  // the snapshot to draw an edge around.
                  <p className="text-body text-pretty whitespace-pre-wrap">
                    {editor.text}
                  </p>
                ) : (
                  <Textarea
                    id={editor.id}
                    ref={fieldRef}
                    name={editor.id}
                    value={editor.text}
                    onChange={(e) => editor.setText(e.target.value)}
                    onFocus={onFocus}
                    // `aria-invalid` only once actually over, never while typing
                    // towards the ceiling. Reward early, punish late.
                    aria-invalid={editor.over > 0 || undefined}
                    aria-describedby={editor.describedBy}
                    // A post is prose in the user's own voice and often not in
                    // English; the browser's dictionary flags half of it.
                    // Autocomplete has nothing useful to offer a body of text.
                    spellCheck={false}
                    autoComplete="off"
                    // No border and no horizontal padding: the caret has to land
                    // on the same x as the approved version's first character,
                    // or the alignment breaks the moment you approve one. The
                    // focus ring survives that — it is drawn outside the box, so
                    // with an offset it reads clearly and still moves nothing.
                    className="resize-none rounded-sm border-0 bg-transparent px-0 text-body focus-visible:border-0 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:bg-transparent"
                  />
                )
              }
            </Clamp>

            <Fold text={editor.text} channel={version.channel} id={editor.foldId} />
            {notice}

            <div className="flex items-center gap-2">
              <Button type="submit" aria-label={`Approve the ${version.label} version`}>
                Approve
              </Button>
              {/* Rendered, not hidden in a tooltip a keyboard cannot reach. */}
              <p className="hidden text-caption text-muted-foreground sm:block">
                {modifier}+Enter
              </p>
              <DiscardVersion
                label={version.label}
                idea={idea}
                isLast={isLast}
                className="ml-auto"
                onDiscard={onDiscard}
              />
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
