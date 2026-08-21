"use client"

import * as React from "react"
import { Brain02Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { answerQuestion } from "@/app/(welcome)/welcome/actions"
import type {
  CorpusReceipt,
  InterviewState,
  Question,
} from "@/lib/onboarding"
import { CLOSING, intro, QUESTIONS } from "@/lib/onboarding"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Composer } from "@/components/chat/composer"
import { TypedLine } from "@/components/welcome/typed-line"
import { ARRIVES, QuincyTurn, UserTurn } from "@/components/welcome/turn"
import { Wiring } from "@/components/welcome/wiring"

/**
 * First run, whole. See plans/022, whose decision record carries the two
 * prototype rounds that chose this over five other shapes.
 *
 * A conversation, in the same composer every later conversation uses, because
 * `docs/vision.md` says the chat is the primary interface and a first run that
 * opens a wizard is the product contradicting itself on the first screen.
 *
 * **The transcript never leaves.** Once the four questions are answered the
 * wiring appears *underneath* it rather than replacing the screen. The first
 * version swapped, and that was the loudest complaint from the first person
 * through it: the last answer went in and the page became a settings screen
 * mid-sentence. What Quincy now knows is the reason any of the wiring is worth
 * doing, and clearing it away to make room for a form throws out the only
 * thing that has just earned any trust.
 *
 * Three more decisions, each arrived at by watching the version without them:
 *
 * - **Quincy introduces itself before asking anything.** Being asked something
 *   personal by a product you met four seconds ago, with no idea how many
 *   questions are coming or where the answers go, reads as an interrogation.
 * - **The newest line types.** A question that appears instantly beside a
 *   composer looks like a printed form rather than something addressed to you.
 * - **Turns arrive, they do not blink into place.** Same for the rail. It is
 *   300ms, and it is the difference between a conversation and a table
 *   refreshing.
 *
 * The chips are real answers rather than categories, and they send on click: a
 * chip reading "Founder" teaches the brain nothing it can write a sentence
 * with, and prefilling the composer taxes the thing you just chose.
 *
 * The server owns progress, so this holds no transcript of its own — it
 * renders what the page read out of the brain, plus the one turn in flight.
 */

export function FirstRun({
  firstName,
  answered,
  next,
  wiring,
}: {
  firstName: string
  answered: InterviewState["answered"]
  /** Null once every question is answered. */
  next: Question | null
  /** Only present once `next` is null. */
  wiring: React.ComponentProps<typeof Wiring> | null
}) {
  const [input, setInput] = React.useState("")
  /**
   * The turn in flight, tagged with the question it answers.
   *
   * Tagged rather than a bare string, and that is the fix for a real bug: on
   * success the server advances and re-renders with new props, but a plain
   * string survives that. It rendered the previous answer as a bubble under
   * the *new* question, and its own `if (pending) return` guard then silently
   * dropped every later answer. First run stopped at question one.
   */
  const [pending, setPending] = React.useState<{
    id: string
    text: string
  } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [railOpen, setRailOpen] = React.useState(false)

  /**
   * How much of the opening Quincy has said. Counted up only on a genuinely
   * fresh start — returning to a half-finished interview should not replay the
   * introduction, so there it renders as history.
   */
  const fresh = answered.length === 0
  const lines = React.useMemo(() => intro(firstName), [firstName])
  const [introStep, setIntroStep] = React.useState(fresh ? 0 : lines.length)

  /** The closing line is said before the wiring is allowed to land. */
  const [closed, setClosed] = React.useState(false)

  const inFlight = pending && pending.id === next?.id ? pending.text : null
  const introDone = introStep >= lines.length

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || inFlight || !next) return

    setPending({ id: next.id, text: trimmed })
    setInput("")
    setError(null)

    const result = await answerQuestion(next.id, trimmed)

    if (!result.ok) {
      // Put the words back in the composer. Losing what somebody just typed
      // because a write failed is the worst possible first minute.
      setError(result.message)
      setInput(trimmed)
      setPending(null)
    }
  }

  /**
   * What the corpus read added, for the rail.
   *
   * The rail was briefly removed once the read landed, on the argument that the
   * portrait in the main column says the same thing better. That was wrong in
   * one specific way: the portrait scrolls past and the rail does not, so the
   * rail is where you go to *check* what Quincy has on you — which is exactly
   * what somebody wants right after a read that just changed it. It stays, and
   * it grows.
   */
  const receipt = wiring?.receipt ?? null
  const corpusItems = wiring?.corpusItems ?? 0

  return (
    <div className="mx-auto grid w-full max-w-5xl flex-1 gap-8 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_248px]">
      <div className="flex min-w-0 flex-col gap-6">
        <div className="lg:hidden">
          <BrainSummary
            answered={answered}
            receipt={receipt}
            open={railOpen}
            onToggle={() => setRailOpen((v) => !v)}
          />
        </div>

        <div className="mt-auto flex flex-col gap-5">
          {/* The opening. Typed one line after the next on a fresh start,
              rendered whole on a return, and always part of the transcript —
              it is what the rest of the conversation is answering. */}
          {lines.map((line, index) =>
            index <= introStep ? (
              <QuincyTurn key={`intro-${index}`} animate={fresh}>
                {fresh && index === introStep ? (
                  <TypedLine
                    text={line}
                    onDone={() => setIntroStep((s) => s + 1)}
                  />
                ) : (
                  line
                )}
              </QuincyTurn>
            ) : null
          )}

          {/* Never animated, and both cases that reach here are the reason.
              On a return visit these are already on the page at first paint,
              and a transcript that replays itself on load is the page-load
              animation nothing needs. On an answer they are the turn that was
              just on screen — the question Quincy had asked and the bubble
              sent a second ago — moving from the in-flight slots into the
              server's record. Playing the arrival again makes the pair blink
              at the exact moment the answer is supposed to have landed. */}
          {answered.map((turn, index) => (
            <React.Fragment key={turn.id}>
              <QuincyTurn animate={false}>{QUESTIONS[index].ask}</QuincyTurn>
              <UserTurn animate={false}>{turn.answer}</UserTurn>
            </React.Fragment>
          ))}

          {/* Keyed by question, so each one is a fresh mount. Without the key
              React reused this bubble for all four and only the first ever
              arrived; the other three swapped their text in place under a
              reveal that had already started. */}
          {next && introDone ? (
            <QuincyTurn key={next.id}>
              <TypedLine text={next.ask} />
            </QuincyTurn>
          ) : null}

          {inFlight ? (
            <>
              <UserTurn>{inFlight}</UserTurn>
              {/* Three dots would be the reflex. This says what it is doing.
                  Every question here is now a page write and none of them spend
                  — the one that called a model was the material ask, and it
                  moved to the wiring, where it says so itself. */}
              <p
                className={cn(
                  "px-3 text-caption text-muted-foreground",
                  ARRIVES
                )}
                role="status"
              >
                Writing that down…
              </p>
            </>
          ) : null}

          {!next ? (
            <QuincyTurn>
              <TypedLine text={CLOSING} onDone={() => setClosed(true)} />
            </QuincyTurn>
          ) : null}
        </div>

        {next ? (
          <div className="flex flex-col gap-3">
            <Composer
              value={input}
              onValueChange={setInput}
              onSubmit={({ text }) => send(text)}
              isBusy={Boolean(inFlight)}
              placeholder="Type it however it comes out"
            />

            {error ? (
              <p className="px-1 text-caption text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            {/* Held back until Quincy has finished the question. Offering
                answers to something still being asked is what made the first
                version feel like a form with the questions pre-printed. */}
            {introDone && next.chips.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {next.chips.map((chip) => (
                  <Button
                    key={chip}
                    variant="outline"
                    size="sm"
                    disabled={Boolean(inFlight)}
                    className={cn(
                      "h-auto max-w-full py-1.5 text-left whitespace-normal",
                      ARRIVES
                    )}
                    onClick={() => send(chip)}
                  >
                    {chip}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Under the conversation, once the handover has actually been said. */}
        {!next && wiring && closed ? (
          <div className={cn("pt-2", ARRIVES)}>
            <Wiring {...wiring} />
          </div>
        ) : null}
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-4">
          <Rail
            answered={answered}
            receipt={receipt}
            corpusItems={corpusItems}
          />
        </div>
      </aside>
    </div>
  )
}

function Rail({
  answered,
  receipt,
  corpusItems,
}: {
  answered: InterviewState["answered"]
  /** What the corpus read learned. Null until it has run. */
  receipt: CorpusReceipt | null
  corpusItems: number
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl bg-card p-4 shadow-xs">
      <div className="flex items-center gap-2">
        <HugeiconsIcon
          aria-hidden="true"
          icon={Brain02Icon}
          className="size-4 text-muted-foreground"
        />
        <h2 className="text-caption font-medium">What Quincy knows</h2>
        {/* The count stops at the questions once the read has landed. "4/4"
            beside a corpus of two hundred posts understates it by an order of
            magnitude, and there is no honest denominator for what a read
            learns — so it is replaced by what it actually found. */}
        <span className="ml-auto font-mono text-caption text-muted-foreground tabular-nums">
          {receipt ? corpusItems : `${answered.length}/${QUESTIONS.length}`}
        </span>
      </div>

      {answered.length === 0 ? (
        <p className="text-caption text-pretty text-muted-foreground">
          Nothing yet. Every answer below lands here, on a page you can edit
          later.
        </p>
      ) : (
        <ul role="list" className="flex flex-col gap-3">
          {answered.map((item) => (
            /* Each entry arrives rather than appearing. The rail is the only
               evidence the answers went anywhere, and a row that blinks into
               existence reads as a table refreshing rather than as Quincy
               writing something down. */
            <li key={item.id} className={cn("flex flex-col gap-1", ARRIVES)}>
              <span className="text-eyebrow text-muted-foreground uppercase">
                {item.page}
              </span>
              <span className="text-caption text-pretty">
                {item.answer || "Saved."}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* What the read added, under a rule so it reads as a second source
          rather than as more answers. `router.refresh()` after the read is what
          brings this in, so it lands at the same moment the portrait does. */}
      {receipt ? (
        <div
          className={cn(
            "border-border flex flex-col gap-3 border-t pt-4",
            ARRIVES
          )}
        >
          <div className="flex flex-col gap-1">
            <span className="text-eyebrow text-muted-foreground uppercase">
              From X
            </span>
            <span className="text-caption text-pretty">
              <span className="font-mono tabular-nums">{corpusItems}</span>{" "}
              posts read
            </span>
          </div>

          {receipt.rules.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-eyebrow text-muted-foreground uppercase">
                How you write
              </span>
              {/* A count, not the list. The rail is 248px and the rules run to
                  a dozen sentences — the portrait in the main column is where
                  they are readable. */}
              <span className="text-caption text-pretty">
                <span className="font-mono tabular-nums">
                  {receipt.rules.length}
                </span>{" "}
                {receipt.rules.length === 1 ? "rule" : "rules"} Quincy will
                write by
              </span>
            </div>
          ) : null}

          {receipt.stories.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-eyebrow text-muted-foreground uppercase">
                You keep returning to
              </span>
              {/* Titles, because a story's title is short and is the part you
                  would recognise as yours or not. */}
              <ul role="list" className="flex flex-col gap-0.5">
                {receipt.stories.map((story) => (
                  <li key={story.slug} className="text-caption text-pretty">
                    {story.title}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** The rail's small-screen form: one line, expandable, never hidden. */
function BrainSummary({
  answered,
  receipt,
  open,
  onToggle,
}: {
  answered: InterviewState["answered"]
  receipt: CorpusReceipt | null
  open: boolean
  onToggle: () => void
}) {
  const id = React.useId()

  /**
   * The rules and the stories count as things Quincy knows, because they are.
   * The collapsed line is the only version of the rail somebody on a phone ever
   * sees, so a count that ignores the read would tell them the largest thing
   * that has happened to their brain did not happen.
   */
  const known =
    answered.length + (receipt?.rules.length ?? 0) + (receipt?.stories.length ?? 0)

  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-xs">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        className={cn(
          "flex w-full items-center gap-2 px-4 py-3 text-left",
          "transition-[background-color] duration-150 ease-out hover:bg-accent"
        )}
      >
        <HugeiconsIcon
          aria-hidden="true"
          icon={Brain02Icon}
          className="size-4 text-muted-foreground"
        />
        <span className="text-caption font-medium">
          Quincy knows <span className="font-mono tabular-nums">{known}</span>{" "}
          {known === 1 ? "thing" : "things"} about you
        </span>
        <span className="ml-auto text-caption text-muted-foreground">
          {open ? "Hide" : "Show"}
        </span>
      </button>

      <div
        id={id}
        className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          {answered.length === 0 ? (
            <p className="px-4 pb-3 text-caption text-muted-foreground">
              Nothing yet.
            </p>
          ) : (
            <ul role="list" className="flex flex-col gap-3 px-4 pb-4">
              {answered.map((item) => (
                <li key={item.id} className="flex gap-2">
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={Tick02Icon}
                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                  />
                  <span className="text-caption text-pretty">
                    {item.answer || "Saved."}
                  </span>
                </li>
              ))}

              {/* Summarised rather than listed. A phone showing fourteen voice
                  rules inside a collapsible has buried the conversation under
                  the audit trail. */}
              {receipt && receipt.rules.length > 0 ? (
                <li className="flex gap-2">
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={Tick02Icon}
                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                  />
                  <span className="text-caption text-pretty">
                    How you write, from{" "}
                    <span className="font-mono tabular-nums">
                      {receipt.rules.length}
                    </span>{" "}
                    rules read off your own posts
                  </span>
                </li>
              ) : null}

              {receipt?.stories.map((story) => (
                <li key={story.slug} className="flex gap-2">
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={Tick02Icon}
                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                  />
                  <span className="text-caption text-pretty">
                    {story.title}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
