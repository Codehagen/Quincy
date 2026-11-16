"use client"

import * as React from "react"
import { ArrowDataTransferHorizontalIcon } from "@hugeicons/core-free-icons"

import { measurePost } from "@/lib/post-length"
import type { VoicePreview as Preview } from "@/lib/voice-preview"
import { Button, LiveDot, Text, Well } from "@/components/kit"
import { SourceMark } from "@/components/sources/source-mark"
import { showTheDifference } from "@/app/(app)/brain/actions"

/**
 * The voice page's one button: the same topic written twice, with the voice
 * and without it. See plans/027 item 3d and lib/voice-preview.ts.
 *
 * The voice page is a list of sentences about how somebody writes, and until
 * this there was nothing on it that showed any of them doing anything. Two
 * posts side by side is the cheapest demonstration there is.
 *
 * **One primary action on the surface.** Save is the page's own control and
 * this is a second filled button, which would be two — so this one is
 * `outline`. It spends money and produces something to read; it does not
 * commit anything, and the control that commits should stay the loudest.
 */
export function VoicePreview() {
  const [pending, setPending] = React.useState(false)
  const [slow, setSlow] = React.useState(false)
  const [preview, setPreview] = React.useState<Preview | null>(null)
  const [error, setError] = React.useState<string>()

  /**
   * The working line waits 400ms.
   *
   * A comparison that comes back in 300ms and flashed a status line on the
   * way would read as a glitch rather than as work. Past 400ms the wait is
   * long enough that an empty page reads as nothing happening, so Quincy
   * says what it is doing, in the place the posts will land
   * (docs/design/states.md: a LiveDot line, never skeleton bars).
   */
  React.useEffect(() => {
    if (!pending) return
    const timer = setTimeout(() => setSlow(true), 400)
    return () => clearTimeout(timer)
  }, [pending])

  const run = React.useCallback(async () => {
    setPending(true)
    // Reset here rather than in the effect above: a `setState` in an effect
    // body is a cascading render, and the two moments this flag changes are
    // both events — the press, and the answer.
    setSlow(false)
    setError(undefined)

    try {
      const result = await showTheDifference()

      if (result.ok) {
        setPreview(result.preview)
      } else {
        // The server writes these, and they name the thing to do: a clock time
        // for a cooldown, a next step for an empty voice. A generic "something
        // went wrong" here would throw away the only useful half.
        setError(result.message)
      }
    } catch (cause) {
      console.error(cause)
      setError("Could not reach Quincy. Try again.")
    } finally {
      setPending(false)
      setSlow(false)
    }
  }, [])

  return (
    <section className="flex flex-col gap-kit-related">
      <div className="flex flex-col gap-kit-tight">
        <Text as="h3" weight="strong">
          Hear the difference
        </Text>
        <Text tone="muted">
          Quincy writes one topic twice, once with these rules and once
          without. Nothing is saved as a draft.
        </Text>
      </div>

      {/* Quiet, not the ink pill: Save is the editor's one action. This spends
          and produces something to read; it does not commit anything, and the
          control that commits should stay the loudest. `pendingLabel` keeps
          the wider label's width, so the row does not reflow on press. */}
      <div className="flex">
        <Button
          icon={ArrowDataTransferHorizontalIcon}
          pending={pending}
          pendingLabel="Writing…"
          onClick={() => void run()}
        >
          Show the difference
        </Button>
      </div>

      {error ? (
        // The server writes these and they name the way out (a clock time, a
        // next step), so the sentence stands on its own. Ink, not red: a
        // refusal is not destruction (docs/design/states.md).
        <div role="status">
          <Text>{error}</Text>
        </div>
      ) : null}

      {pending && slow ? (
        <Text as="div" role="status">
          <LiveDot pulse>Writing it twice, with your voice and without.</LiveDot>
        </Text>
      ) : null}

      {!pending && preview ? <Comparison preview={preview} /> : null}
    </section>
  )
}

/**
 * Two columns on desktop, stacked on mobile — the comparison only works if
 * both posts are on screen at once, and on a phone that means one under the
 * other rather than two unreadable columns.
 */
function Comparison({ preview }: { preview: Preview }) {
  return (
    <div className="flex flex-col gap-kit-related">
      <div className="grid gap-kit-related @lg/kit-stage:grid-cols-2">
        <Post
          title="Without your voice"
          channel={preview.channel}
          label={preview.label}
          text={preview.without}
          muted
        />
        <Post
          title="With your voice"
          channel={preview.channel}
          label={preview.label}
          text={preview.with}
        />
      </div>

      <Text variant="small" tone="muted">
        {caption(preview)}
      </Text>
    </div>
  )
}

/**
 * One sentence, and it has to be true. The model is asked which rules it
 * leaned on and is allowed not to know — `namedRules` has already dropped
 * anything that does not point at a real rule, so an empty list means "it did
 * not say", not "no rules fired", and the sentence says only what it can.
 */
function caption(preview: Preview): string {
  const topic = `Both posts are about “${preview.topic}”`

  if (preview.rulesUsed.length === 0) {
    return `${topic}, written for ${preview.label}.`
  }

  const named = preview.rulesUsed
    .slice(0, 3)
    .map((rule) => `“${clip(rule)}”`)
    .join(", ")

  return `${topic}; the second one leaned on ${named}.`
}

/** A rule is a sentence and a caption is one line. */
function clip(rule: string, max = 60): string {
  const text = rule.trim().replace(/\s+/g, " ")
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
}

/**
 * The channel's own reading of the post: the mark, the label, and the count
 * against the ceiling — the same three facts /drafts shows above every
 * version, in the same order, because a person reading both surfaces should
 * not have to learn two ways of looking at a post.
 *
 * A Well, not a card inside the editor's Card: the posts are material quoted
 * back inside the object, which is what the recess is for (never a card in a
 * card).
 */
function Post({
  title,
  channel,
  label,
  text,
  muted = false,
}: {
  title: string
  channel: string
  label: string
  text: string
  muted?: boolean
}) {
  const { used, limit } = measurePost(text, channel)

  return (
    <article className="flex min-w-0 flex-col">
      <Well>
        <header className="flex items-center justify-between gap-kit-controls">
          <div className="flex min-w-0 items-center gap-2">
            <SourceMark id={channel} label={label} className="size-5" />
            {/* h4 under the section's h3. */}
            <Text as="h4" weight="strong">
              {title}
            </Text>
          </div>
          <span className="shrink-0 font-kit-mono text-kit-mono text-kit-ink-muted tabular-nums">
            {used}
            {limit === null ? "" : ` / ${limit}`}
          </span>
        </header>

        <p
          className={
            "text-kit-body text-pretty whitespace-pre-wrap " +
            (muted ? "text-kit-ink-muted" : "text-kit-ink")
          }
        >
          {text}
        </p>
      </Well>
    </article>
  )
}
