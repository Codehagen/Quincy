"use client"

import * as React from "react"
import {
  Alert02Icon,
  ArrowDataTransferHorizontalIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { measurePost } from "@/lib/post-length"
import type { VoicePreview as Preview } from "@/lib/voice-preview"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
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
   * The skeleton waits 400ms.
   *
   * A comparison that comes back in 300ms and flashed two grey blocks on the
   * way would read as a glitch rather than as loading. Past 400ms the wait is
   * long enough that an empty page reads as nothing happening, and the two
   * boxes say what shape the answer will be — which a spinner cannot.
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
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-card-title">Hear the difference</h2>
          <p className="max-w-[60ch] text-body text-pretty text-muted-foreground">
            Quincy writes one topic twice — once with these rules in the prompt
            and once without. Nothing is saved as a draft.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => void run()}
          // Sized for the longer of the two labels, so the row does not reflow
          // the instant it is pressed.
          style={{ minWidth: "11rem" }}
        >
          {pending ? "Writing…" : "Show the difference"}
          {pending ? null : (
            <HugeiconsIcon
              aria-hidden="true"
              data-icon="inline-end"
              icon={ArrowDataTransferHorizontalIcon}
            />
          )}
        </Button>
      </div>

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 px-3 py-2 text-body text-destructive"
        >
          <HugeiconsIcon icon={Alert02Icon} className="mt-0.5 shrink-0" />
          <span className="text-pretty">{error}</span>
        </p>
      ) : null}

      {pending && slow ? <PreviewSkeleton /> : null}

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
    <div className="flex flex-col gap-3">
      <div className="grid gap-4 md:grid-cols-2">
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

      <p className="text-caption text-pretty text-muted-foreground">
        {caption(preview)}
      </p>
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
 * `rounded-xl` outside, `p-4` padding, so the inner rule takes no radius at
 * all and the nested-radius rule stays honest: 20px − 16px = 4px, and a
 * border-top has no corners to round.
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
    <article className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SourceMark id={channel} label={label} className="size-5" />
          <h3 className="text-card-title">{title}</h3>
        </div>
        <span className="font-mono text-caption text-muted-foreground tabular-nums">
          {used}
          {limit === null ? "" : ` / ${limit}`}
        </span>
      </header>

      <p
        className={
          muted
            ? "text-body text-pretty whitespace-pre-wrap text-muted-foreground"
            : "text-body text-pretty whitespace-pre-wrap"
        }
      >
        {text}
      </p>
    </article>
  )
}

/**
 * The shape of the answer, not a spinner. Two boxes, four lines each, in the
 * layout the result will land in — so nothing moves when it arrives.
 */
function PreviewSkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-4 md:grid-cols-2">
      {[0, 1].map((column) => (
        <div
          key={column}
          className="flex flex-col gap-3 rounded-xl border border-border p-4"
        >
          <div className="flex items-center gap-2">
            <Skeleton className="size-5 rounded-xs" />
            <Skeleton className="h-4 w-32 rounded-xs" />
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3.5 w-full rounded-xs" />
            <Skeleton className="h-3.5 w-11/12 rounded-xs" />
            <Skeleton className="h-3.5 w-4/5 rounded-xs" />
            <Skeleton className="h-3.5 w-2/3 rounded-xs" />
          </div>
        </div>
      ))}
    </div>
  )
}
