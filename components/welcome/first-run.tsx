"use client"

import * as React from "react"

import type {
  CorpusReceipt,
  InterviewState,
  Question,
} from "@/lib/onboarding"
import { CLOSING, intro, QUESTIONS } from "@/lib/onboarding"
import {
  Card,
  Choice,
  Choices,
  Composer,
  Count,
  Disclosure,
  MessageList,
  MessageListItem,
  Muted,
  Rule,
  Text,
} from "@/components/kit"
import { Friend } from "@/components/mascot"
import { TypedLine } from "@/components/welcome/typed-line"
import {
  ARRIVES,
  QuincyTurn,
  Refusal,
  UserTurn,
  Working,
} from "@/components/welcome/turn"
import {
  ComposerSlot,
  useWelcomeActions,
} from "@/components/welcome/welcome-actions"
import { Wiring } from "@/components/welcome/wiring"

/**
 * First run, whole. See plans/022, whose decision record carries the two
 * prototype rounds that chose this over five other shapes.
 *
 * A conversation, in the same parts every later conversation uses (Studio's
 * MessageList, Composer, Choices, QuincyReply, YourTurn), because
 * `docs/vision.md` says the chat is the primary interface and a first run that
 * opens a wizard is the product contradicting itself on the first screen.
 *
 * **The transcript never leaves.** Once the questions are answered the wiring
 * appears *underneath* it rather than replacing the screen. The first version
 * swapped, and that was the loudest complaint from the first person through
 * it: the last answer went in and the page became a settings screen
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
 *   the difference between a conversation and a table refreshing.
 *
 * The answers under a question are real answers rather than categories, and
 * they send on press: one reading "Founder" teaches the brain nothing it can
 * write a sentence with, and prefilling the composer taxes the thing you just
 * chose. They wait until the question has finished typing.
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
  const actions = useWelcomeActions()
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

  /**
   * How much of the opening Quincy has said. Counted up only on a genuinely
   * fresh start — returning to a half-finished interview should not replay the
   * introduction, so there it renders as history.
   */
  const fresh = answered.length === 0
  const lines = React.useMemo(() => intro(firstName), [firstName])
  const [introStep, setIntroStep] = React.useState(fresh ? 0 : lines.length)

  /** The question that has finished typing, so its answers may show. */
  const [asked, setAsked] = React.useState<string | null>(null)

  /** The closing line is said before the wiring is allowed to land. */
  const [closed, setClosed] = React.useState(false)

  /** The bar under the conversation, for the material step's composer. */
  const [slot, setSlot] = React.useState<HTMLElement | null>(null)

  const inFlight = pending && pending.id === next?.id ? pending.text : null
  const introDone = introStep >= lines.length

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || inFlight || !next) return

    setPending({ id: next.id, text: trimmed })
    setInput("")
    setError(null)

    let result: Awaited<ReturnType<typeof actions.answerQuestion>>
    try {
      result = await actions.answerQuestion(next.id, trimmed)
    } catch {
      // The action never answered (offline, a deploy mid-request). Without
      // this the turn would say "Writing that down" forever.
      result = { ok: false, message: "That did not reach Quincy. Try again." }
    }

    if (!result.ok) {
      // Put the words back in the composer. Losing what somebody just typed
      // because a write failed is the worst possible first minute.
      setError(result.message)
      setInput(trimmed)
      setPending(null)
    }
  }

  const composerInput = React.useRef<HTMLTextAreaElement>(null)

  /**
   * What the corpus read added, for the rail.
   *
   * The rail was briefly removed once the read landed, on the argument that the
   * portrait in the conversation says the same thing better. That was wrong in
   * one specific way: the portrait scrolls past and the rail does not, so the
   * rail is where you go to *check* what Quincy has on you — which is exactly
   * what somebody wants right after a read that just changed it. It stays, and
   * it grows.
   */
  const receipt = wiring?.receipt ?? null
  const corpusItems = wiring?.corpusItems ?? 0

  return (
    <ComposerSlot.Provider value={slot}>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="flex min-h-0 min-w-0 flex-col">
          <h1 className="sr-only">Welcome to Quincy</h1>
          <div className="min-h-0 flex-1">
            <MessageList label="Getting started with Quincy">
              {/* The rail's small-screen form: one line, expandable, never
                  hidden. First in the conversation, where it was before. */}
              <MessageListItem id="brain">
                <div className="lg:hidden">
                  <BrainSummary answered={answered} receipt={receipt} />
                </div>
              </MessageListItem>

              {/* The opening. Typed one line after the next on a fresh start,
                  rendered whole on a return, and always part of the transcript
                  — it is what the rest of the conversation is answering. The
                  friend is here once, idle, as on Studio's first screen. */}
              <MessageListItem id="opening">
                <div className="flex flex-col gap-kit-group">
                  <span className="text-kit-ink">
                    <Friend state="idle" size={48} />
                  </span>
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
                </div>
              </MessageListItem>

              {/* Never animated, and both cases that reach here are the reason.
                  On a return visit these are already on the page at first
                  paint, and a transcript that replays itself on load is the
                  page-load animation nothing needs. On an answer they are the
                  turn that was just on screen — the question Quincy had asked
                  and the bubble sent a second ago — moving from the in-flight
                  slots into the server's record. Playing the arrival again
                  makes the pair blink at the exact moment the answer is
                  supposed to have landed. */}
              {answered.map((turn, index) => (
                <React.Fragment key={turn.id}>
                  <MessageListItem id={`ask-${turn.id}`}>
                    <QuincyTurn animate={false}>{QUESTIONS[index].ask}</QuincyTurn>
                  </MessageListItem>
                  <MessageListItem id={`answer-${turn.id}`} anchor>
                    <UserTurn animate={false}>{turn.answer}</UserTurn>
                  </MessageListItem>
                </React.Fragment>
              ))}

              {/* Keyed by question, so each one is a fresh mount. Without the
                  key React reused this turn for all of them and only the first
                  ever arrived; the others swapped their text in place under a
                  reveal that had already started. */}
              {next && introDone ? (
                <MessageListItem key={next.id} id={`ask-${next.id}`}>
                  <div className="flex flex-col gap-kit-related">
                    <QuincyTurn>
                      <TypedLine
                        text={next.ask}
                        onDone={() => setAsked(next.id)}
                      />
                    </QuincyTurn>

                    {/* Held back until Quincy has finished the question.
                        Offering answers to something still being asked is what
                        made the first version feel like a form with the
                        questions pre-printed. */}
                    {asked === next.id && !inFlight && next.chips.length > 0 ? (
                      <Choices label="Answers">
                        {next.chips.map((chip, index) => (
                          <Choice
                            key={chip}
                            arrive={index}
                            onClick={() => {
                              void send(chip)
                              // The chips leave once the answer is in flight;
                              // the next answer is typed here.
                              composerInput.current?.focus()
                            }}
                          >
                            {chip}
                          </Choice>
                        ))}
                      </Choices>
                    ) : null}
                  </div>
                </MessageListItem>
              ) : null}

              {inFlight ? (
                <>
                  <MessageListItem id={`pending-${next?.id}`} anchor>
                    <UserTurn>{inFlight}</UserTurn>
                  </MessageListItem>
                  {/* Every question here is a page write and none of them
                      spend — the one that called a model was the material ask,
                      and it moved to the wiring, where it says so itself. */}
                  <MessageListItem id={`writing-${next?.id}`}>
                    <Working state="listening">Writing that down</Working>
                  </MessageListItem>
                </>
              ) : null}

              {!next ? (
                <MessageListItem id="closing">
                  <QuincyTurn>
                    <TypedLine text={CLOSING} onDone={() => setClosed(true)} />
                  </QuincyTurn>
                </MessageListItem>
              ) : null}

              {/* Under the conversation, once the handover has been said. */}
              {!next && wiring && closed ? (
                <MessageListItem id="wiring">
                  <div className={ARRIVES}>
                    <Wiring {...wiring} />
                  </div>
                </MessageListItem>
              ) : null}
            </MessageList>
          </div>

          {/* The bar, as in Studio: one composer, always at the bottom. The
              questions own it until they are done; then the material step
              portals its own composer into the slot. */}
          <div className="mx-auto flex w-full max-w-kit-page shrink-0 flex-col gap-kit-related px-kit-page-gutter pb-[max(env(safe-area-inset-bottom),var(--spacing-kit-group))]">
            {next ? (
              <>
                {error ? <Refusal>{error}</Refusal> : null}
                <Composer
                  label="Answer Quincy"
                  value={input}
                  onValueChange={setInput}
                  onSubmit={({ text }) => void send(text)}
                  inputRef={composerInput}
                  busy={Boolean(inFlight)}
                  placeholder="Type it however it comes out"
                  autoFocus
                />
              </>
            ) : null}
            <div ref={setSlot} className="empty:hidden" />
          </div>
        </div>

        <aside
          aria-label="What Quincy knows"
          className="hidden min-h-0 overflow-y-auto pt-kit-group pr-kit-page-gutter pb-kit-group lg:block"
        >
          <Rail
            answered={answered}
            receipt={receipt}
            corpusItems={corpusItems}
          />
        </aside>
      </div>
    </ComposerSlot.Provider>
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
    <Card>
      <div className="flex flex-col gap-kit-related">
        <div className="flex items-baseline gap-kit-controls">
          <Text as="h2" weight="strong">
            What Quincy knows
          </Text>
          {/* The count stops at the questions once the read has landed. "3/3"
              beside a corpus of a hundred posts understates it by an order of
              magnitude, and there is no honest denominator for what a read
              learns — so it is replaced by what it actually found. */}
          <span className="ml-auto font-kit-mono text-kit-mono text-kit-ink-muted tabular-nums">
            {receipt ? corpusItems : `${answered.length}/${QUESTIONS.length}`}
          </span>
        </div>

        {answered.length === 0 ? (
          <Text variant="small" tone="muted">
            Nothing yet. Each answer lands here, on a page you can edit later.
          </Text>
        ) : (
          <ul role="list" className="flex flex-col gap-kit-related">
            {answered.map((item) => (
              /* Each entry arrives rather than appearing. The rail is the only
                 evidence the answers went anywhere, and a row that blinks into
                 existence reads as a table refreshing rather than as Quincy
                 writing something down. */
              <li key={item.id} className={`flex flex-col gap-kit-tight ${ARRIVES}`}>
                <Text as="span" variant="small" tone="muted">
                  {item.page}
                </Text>
                <Text as="span" variant="small">
                  <span className="text-pretty">{item.answer || "Saved."}</span>
                </Text>
              </li>
            ))}
          </ul>
        )}

        {/* What the read added, under a rule so it reads as a second source
            rather than as more answers. `router.refresh()` after the read is
            what brings this in, so it lands with the portrait. */}
        {receipt ? (
          <div className={ARRIVES}>
            <Rule />
            <ul role="list" className="flex flex-col gap-kit-related">
              <li className="flex flex-col gap-kit-tight">
                <Text as="span" variant="small" tone="muted">
                  From X
                </Text>
                <Text as="span" variant="small">
                  <Count value={corpusItems} /> posts read
                </Text>
              </li>

              {receipt.rules.length > 0 ? (
                <li className="flex flex-col gap-kit-tight">
                  <Text as="span" variant="small" tone="muted">
                    How you write
                  </Text>
                  {/* A count, not the list. The rail is narrow and the rules
                      run to a dozen sentences — the portrait in the
                      conversation is where they are readable. */}
                  <Text as="span" variant="small">
                    <Count value={receipt.rules.length} />{" "}
                    {receipt.rules.length === 1 ? "rule" : "rules"} I will
                    write by
                  </Text>
                </li>
              ) : null}

              {receipt.stories.length > 0 ? (
                <li className="flex flex-col gap-kit-tight">
                  <Text as="span" variant="small" tone="muted">
                    You keep coming back to
                  </Text>
                  {/* Titles, because a story's title is short and is the part
                      you would recognise as yours or not. */}
                  <ul role="list" className="flex flex-col gap-kit-tight">
                    {receipt.stories.map((story) => (
                      <li key={story.slug}>
                        <Text as="span" variant="small">
                          {story.title}
                        </Text>
                      </li>
                    ))}
                  </ul>
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  )
}

/** The rail's small-screen form: one line, expandable, never hidden. */
function BrainSummary({
  answered,
  receipt,
}: {
  answered: InterviewState["answered"]
  receipt: CorpusReceipt | null
}) {
  /**
   * The rules and the stories count as things Quincy knows, because they are.
   * The collapsed line is the only version of the rail somebody on a phone ever
   * sees, so a count that ignores the read would tell them the largest thing
   * that has happened to their brain did not happen.
   */
  const known =
    answered.length + (receipt?.rules.length ?? 0) + (receipt?.stories.length ?? 0)

  return (
    <Card>
      <Disclosure
        summary={
          <>
            Quincy knows <Count value={known} />{" "}
            {known === 1 ? "thing" : "things"} about you
          </>
        }
      >
        {answered.length === 0 ? (
          <Text variant="small" tone="muted">
            Nothing yet.
          </Text>
        ) : (
          <ul role="list" className="flex flex-col gap-kit-related">
            {answered.map((item) => (
              <li key={item.id}>
                <Text variant="small">
                  <Muted>{item.page}:</Muted> {item.answer || "Saved."}
                </Text>
              </li>
            ))}

            {/* Summarised rather than listed. A phone showing fourteen voice
                rules inside a collapsible has buried the conversation under
                the audit trail. */}
            {receipt && receipt.rules.length > 0 ? (
              <li>
                <Text variant="small">
                  <Muted>How you write:</Muted> <Count value={receipt.rules.length} />{" "}
                  rules read off your own posts
                </Text>
              </li>
            ) : null}

            {receipt?.stories.map((story) => (
              <li key={story.slug}>
                <Text variant="small">
                  <Muted>A story:</Muted> {story.title}
                </Text>
              </li>
            ))}
          </ul>
        )}
      </Disclosure>
    </Card>
  )
}
