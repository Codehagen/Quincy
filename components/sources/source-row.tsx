import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@/lib/utils"
import type { Connection, Source } from "@/lib/sources"
import { Button } from "@/components/ui/button"
import { SourceMark } from "@/components/sources/source-mark"

/**
 * One row of the sources register.
 *
 * Lives here rather than inside the page so the connected states can be
 * rendered somewhere before they exist in the database. `app/prototypes/sources`
 * mounts this exact component against fixtures; the page mounts it against real
 * data, which today is `connection: null` for every source. That is the only
 * honest way to design a state you cannot yet produce — the alternative is
 * fixtures in the production page, and a fixture that ships is a lie.
 *
 * **No brass anywhere.** `--signal*` means "this rhythm is running", and a
 * source is not a rhythm: material arriving is not the same event as something
 * acting on it. Colouring both the same is what would make a page of
 * connected-but-unread sources read as healthy.
 *
 * `broken` is the exception to the page's neutrality, and deliberately so. A
 * source whose token expired stops feeding a rhythm silently, and silence is
 * exactly the failure mode this page exists to break. It is the only state that
 * gets `destructive`, and it is also the only state that changes the action
 * button — which is what carries the signal on a phone, where the status column
 * is not rendered.
 */

const STATE_LABEL: Record<Connection["state"], string> = {
  arriving: "Arriving",
  waiting: "Nothing yet",
  paused: "Paused",
  broken: "Needs reconnecting",
}

/**
 * State needs more than colour. The dot is the glance-level signal, the word
 * beside it is what a colourblind reader actually gets — never one without the
 * other.
 */
function StateLabel({ state }: { state: Connection["state"] }) {
  const broken = state === "broken"

  return (
    <p
      className={cn(
        "text-caption inline-flex items-center gap-1.5 whitespace-nowrap",
        broken ? "text-destructive" : "text-muted-foreground"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          broken && "bg-destructive",
          state === "arriving" && "bg-foreground/60",
          // `waiting` and `paused` share the dimmest dot. Neither is wrong and
          // neither is working, and inventing a third neutral would be a
          // distinction the word beside it already carries.
          (state === "waiting" || state === "paused") &&
            "bg-muted-foreground/40"
        )}
      />
      {STATE_LABEL[state]}
    </p>
  )
}

export function SourceRow({
  source,
  connection,
}: {
  source: Source
  /** null = never connected. */
  connection: Connection | null
}) {
  const when =
    connection === null
      ? null
      : connection.state === "waiting"
        ? `Connected ${connection.since}`
        : connection.lastAt

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <SourceMark id={source.id} label={source.label} />

      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-card-title">{source.label}</p>
        {/* Wraps rather than truncates. Measured at 390px, `truncate` clipped 7
            of 11 of these — Slack showed 157px of the 265px it needs. This line
            is the only thing that says what a source hands over and there is no
            detail route to go read it on. */}
        <p className="text-caption text-muted-foreground text-pretty">
          {source.gives}
        </p>

        {/* The state, on a phone. The right-hand block below is `sm:` only, and
            with nothing here a 390px row rendered `arriving`, `paused` and
            `waiting` as three identical rows with a Manage button — the page's
            entire job, gone at the width most people read it. Duplicated in the
            DOM rather than moved, because on desktop the state belongs beside
            its timestamp; `display: none` keeps whichever copy is hidden out of
            the accessibility tree, so nothing announces twice. The timestamp
            stays desktop-only: the word is what carries meaning, the relative
            date is detail. */}
        {connection !== null ? (
          <div className="pt-0.5 sm:hidden">
            <StateLabel state={connection.state} />
          </div>
        ) : null}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-4">
        {/* Dropped below `sm`: at 390px the row is already a tile, a two-line
            description and a button, and a third column turns all three into
            slivers. The state itself is not lost — it re-renders inside the
            left column above. Only the timestamp goes. */}
        {connection !== null ? (
          <div className="hidden flex-col items-end gap-0.5 sm:flex">
            <StateLabel state={connection.state} />
            <p className="text-caption text-muted-foreground whitespace-nowrap">
              {when}
            </p>
          </div>
        ) : null}

        {/* The row is not itself a link: wrapping it would make the whole thing
            one announcement and kill text selection. The action is its own
            control. */}
        {connection === null ? (
          // The Button's own disabled style is opacity: 0.5, which drops this
          // label to 2.72:1 — measured. Nothing requires contrast on a disabled
          // control, but this label is the entire point of the row: it is what
          // says the source is coming. So the button recedes by surface instead
          // of by dimming, and the word stays readable.
          <Button
            variant="outline"
            disabled
            className="disabled:bg-muted disabled:text-muted-foreground disabled:border-transparent disabled:opacity-100"
          >
            Connect
          </Button>
        ) : connection.state === "broken" ? (
          // Tied to its own status word rather than left as a plain outline.
          // The default outline renders the same grey pill as the disabled
          // Connect two rows down, so "act now, a rhythm is starved" and "not
          // available yet" were the same control — and on a phone, where the
          // red status text does not render, that was the broken state's only
          // remaining signal. Not a brass primary: AGENTS.md reserves brass
          // fills for the brand action, and reconnecting a dead token is not
          // it.
          <Button
            variant="outline"
            aria-label={`Reconnect ${source.label}`}
            // Both `bg-transparent` classes are load-bearing, not tidying. The
            // outline variant fills with `bg-background` in light and
            // `bg-input/30` in dark, and both sit on the wrong side of the
            // `bg-card` row around them: light dropped the red label to 4.38:1,
            // dark to 3.84:1, against a 4.5 floor at 14px. Letting the card
            // show through in each theme lands it at 4.94 light and 4.60 dark —
            // the same values the status word beside it measures, which is the
            // point. The word and the button are one signal and should not
            // disagree about how loud they are.
            className="border-destructive/40 bg-transparent text-destructive hover:bg-destructive/10 hover:text-destructive dark:bg-transparent"
          >
            Reconnect
          </Button>
        ) : (
          <Button variant="ghost" aria-label={`Manage ${source.label}`}>
            Manage
            <HugeiconsIcon
              aria-hidden="true"
              data-icon="inline-end"
              icon={ArrowRight01Icon}
            />
          </Button>
        )}
      </div>
    </li>
  )
}
