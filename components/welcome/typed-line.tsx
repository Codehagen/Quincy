"use client"

import * as React from "react"

/**
 * A line Quincy is saying, revealed as it is written.
 *
 * Only the newest line reveals. Everything above it in the transcript renders
 * at once — re-revealing the whole conversation on every render would be a
 * party trick, and the point here is narrower: the first question arrived
 * instantly beside a composer, and a person who has just signed in cannot tell
 * whether the product is talking to them or has simply printed a form.
 *
 * **Every word is in the DOM from the first paint. Only opacity moves.**
 *
 * This is the whole design, and it is a correction of the obvious version. The
 * obvious version keeps a count in state and renders `text.slice(0, count)`,
 * which means the paragraph gets one word longer thirty times in a row. Each
 * of those is a new line-break calculation over the whole paragraph, so lines
 * that had already settled re-wrap, `text-pretty` re-balances the last two
 * lines on every tick, and the bubble grows a line at a time. The column is
 * bottom-anchored, so each of those growths shoves the entire transcript
 * upward. The text does not read as written — it reads as unstable.
 *
 * Holding the final string in the DOM from the start fixes all four at once:
 * the wrap is computed once, the box is its final size before the first word
 * appears, and nothing above it ever moves. The reveal is then pure opacity,
 * which the compositor handles without layout or paint.
 *
 * **By word, not by character.** A 25-word question at a readable
 * per-character speed takes three seconds, which is a wait rather than an
 * arrival. Words land at roughly reading pace and a question is done in under
 * a second.
 *
 * **No timer drives the reveal.** Each word carries its own `animation-delay`,
 * so the browser runs the whole line off one paint. React renders this
 * component once. The old version re-rendered every 55ms and fought the frame
 * clock, which is where the visible stutter between words came from.
 *
 * Screen readers get the finished sentence at mount, once, because it is
 * genuinely there. Nothing is hidden from them and nothing re-announces.
 */

/** Roughly reading pace: about 36 words a second. */
const STEP_MS = 28

/**
 * Longer than the step on purpose. Five or six words are part-way through
 * their fade at any moment, so the leading edge is a soft gradient rather than
 * a hard cursor stepping word to word.
 */
const FADE_MS = 240

export function TypedLine({
  text,
  onDone,
}: {
  text: string
  /** Fired once, when the last word has finished landing. Chains the intro. */
  onDone?: () => void
}) {
  /**
   * The line as tokens, each word carrying the delay it starts on.
   *
   * The delay is counted here rather than by a counter inside the `map` below,
   * because a running total mutated during render is exactly what
   * `react-hooks/immutability` stops — the render function has to be
   * re-runnable, and the second run would start from wherever the first
   * finished.
   *
   * Split on spaces but keep them, so the rebuilt string is byte-identical to
   * the original, including the blank lines that separate paragraphs.
   */
  const tokens = React.useMemo(() => {
    let word = 0

    return text.split(/(\s+)/).map((part) => {
      const space = !part || /^\s+$/.test(part)
      return { part, delay: space ? null : word++ * STEP_MS }
    })
  }, [text])

  const words = React.useMemo(
    () => tokens.filter((token) => token.delay !== null).length,
    [tokens]
  )

  // Written in an effect, not during render: the timeout outlives the render
  // that scheduled it and has to call whatever the latest callback is.
  const done = React.useRef(onDone)
  React.useEffect(() => {
    done.current = onDone
  })

  React.useEffect(() => {
    // Someone who has asked for less motion still needs the sentence, and the
    // CSS below has already given them all of it at full opacity. The handover
    // must not then wait out a reveal that never ran.
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches

    const id = setTimeout(
      () => done.current?.(),
      reduced ? 0 : words * STEP_MS + FADE_MS
    )

    return () => clearTimeout(id)
  }, [words])

  return (
    <span className="whitespace-pre-wrap">
      {tokens.map(({ part, delay }, index) =>
        // Whitespace stays a plain text node. It carries the paragraph breaks,
        // it is invisible either way, and a span per space would double the
        // node count for nothing.
        delay === null ? (
          <React.Fragment key={index}>{part}</React.Fragment>
        ) : (
          <span
            key={index}
            className="animate-in fill-mode-both fade-in motion-reduce:animate-none"
            style={
              {
                "--tw-animation-delay": `${delay}ms`,
                "--tw-animation-duration": `${FADE_MS}ms`,
              } as React.CSSProperties
            }
          >
            {part}
          </span>
        )
      )}
    </span>
  )
}
