"use client"

import * as React from "react"

import type { Angle, Riff } from "@/lib/riffs"
import { Highlight, StatusPill } from "@/components/kit"
import { FOCUS_RING, HIT_44 } from "@/components/kit/control-styles"
import { ideasFrom } from "@/components/quincy"

/**
 * Marked up: the open idea's source as the person's own words, every
 * sentence an idea stands on underlined in the pen and numbered, the open
 * one highlighted, and the ideas listed in the margin in reading order
 * (decisions.md, "Ideas is a working surface — Table").
 *
 * Compound, so the page decides what sits where and what an open idea
 * holds (its verbs live with the page, not here):
 *
 * ```tsx
 * <MarkedUp riff={riff} value={openAngleId} onValueChange={open}>
 *   <MarkedUpTitle />
 *   <MarkedUpColumns>
 *     <MarkedUpProse>{statusLine}</MarkedUpProse>
 *     <MarkedUpMargin>
 *       {(idea) => <MarginIdea key={idea.angle.id} idea={idea}>{idea.open ? actions : null}</MarginIdea>}
 *     </MarkedUpMargin>
 *   </MarkedUpColumns>
 * </MarkedUp>
 * ```
 *
 * The marks come from `Angle.mark` (lib/source-span.ts): a quote found in the
 * scrap in code, never offsets from a model. An idea with no mark (every idea
 * written before `riff_angle.line`, one drawn from the whole material, a quote
 * that no longer matches) is listed in the margin without a number, and the
 * material reads as plain prose. Old ideas render the same way they always
 * could; nothing is guessed.
 */

export type MarginItem = {
  angle: Angle
  /** Its number in the prose, or undefined for an idea with no mark. */
  n?: number
  /** Whether it is the open idea. */
  open: boolean
}

type Placed = { angle: Angle; n: number; start: number; end: number }

type MarkedUpState = {
  riff: Riff
  placed: readonly Placed[]
  loose: readonly Angle[]
  value: string | null
  onValueChange: (angleId: string) => void
  titleId: string
}

const MarkedUpContext = React.createContext<MarkedUpState | null>(null)

function useMarkedUp(part: string) {
  const ctx = React.useContext(MarkedUpContext)
  if (!ctx) throw new Error(`${part} must be inside <MarkedUp>.`)
  return ctx
}

/**
 * Marks in reading order, numbered from 1. Two quotes that overlap keep the
 * first; the second idea joins the unmarked ones rather than underlining
 * half a sentence twice.
 */
export function placeMarks(angles: readonly Angle[]) {
  const withMark = angles
    .filter((a): a is Angle & { mark: NonNullable<Angle["mark"]> } => a.mark != null)
    .sort((a, b) => a.mark.span.start - b.mark.span.start)
  const placed: Placed[] = []
  let end = -1
  for (const a of withMark) {
    if (a.mark.span.start < end) continue
    placed.push({ angle: a, n: placed.length + 1, start: a.mark.span.start, end: a.mark.span.end })
    end = a.mark.span.end
  }
  const ids = new Set(placed.map((p) => p.angle.id))
  return { placed, loose: angles.filter((a) => !ids.has(a.id)) }
}

export type MarkedUpProps = {
  /** The source: its scrap is the prose, its angles the margin. Pass the angles still on the page. */
  riff: Riff
  /** The open idea's angle id, or null. Controlled: the page owns which idea is open (`?idea=`). */
  value: string | null
  onValueChange: (angleId: string) => void
  children: React.ReactNode
}

/** The source as one article, named by its title. */
export function MarkedUp({ riff, value, onValueChange, children }: MarkedUpProps) {
  const titleId = React.useId()
  const { placed, loose } = React.useMemo(() => placeMarks(riff.angles), [riff.angles])
  const state = React.useMemo(
    () => ({ riff, placed, loose, value, onValueChange, titleId }),
    [riff, placed, loose, value, onValueChange, titleId]
  )
  return (
    <MarkedUpContext value={state}>
      <article aria-labelledby={titleId} data-slot="marked-up" className="@container/marked-up flex flex-col gap-kit-related">
        {children}
      </article>
    </MarkedUpContext>
  )
}

/**
 * The article's heading: "3 ideas from your voice note" while there are
 * ideas, else the source's name. `children` replaces the words; `hidden`
 * keeps it for assistive tech only (a narrow row whose title already says it).
 */
export function MarkedUpTitle({ children, hidden = false }: { children?: React.ReactNode; hidden?: boolean }) {
  const { riff, titleId } = useMarkedUp("MarkedUpTitle")
  const words =
    children ?? (riff.state === "ready" && riff.angles.length > 0 ? ideasFrom(riff).replace(/\.$/, "") : riff.sourceLabel || "Written here")
  return (
    <h2 id={titleId} className={hidden ? "sr-only" : "text-kit-heading text-balance text-kit-ink"}>
      {words}
    </h2>
  )
}

/** The prose beside the margin from 38rem of article; one column under it. */
export function MarkedUpColumns({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-kit-group @[38rem]/marked-up:grid-cols-[minmax(0,1fr)_14rem]">{children}</div>
  )
}

/**
 * The person's words, the one place on the page set for reading: 14/24 at
 * 62ch, line breaks kept. Each mark is a pointer shortcut to its idea; the
 * margin list is the keyboard's path, so a mark is not a second tab stop.
 * `children` follow the prose (a "Reading it" line, a failure).
 */
export function MarkedUpProse({ children }: { children?: React.ReactNode }) {
  const { riff, placed, value, onValueChange } = useMarkedUp("MarkedUpProse")
  const scrap = riff.scrap
  const prose: React.ReactNode[] = []
  let from = 0
  for (const m of placed) {
    prose.push(scrap.slice(from, m.start))
    const open = m.angle.id === value
    const words = scrap.slice(m.start, m.end)
    prose.push(
      <span
        key={m.angle.id}
        role="button"
        tabIndex={-1}
        aria-pressed={open}
        onClick={() => onValueChange(m.angle.id)}
        className={`cursor-pointer rounded-kit-chip ${FOCUS_RING} ${
          open
            ? ""
            : "underline decoration-kit-pen decoration-[1.5px] underline-offset-4 transition-[text-decoration-color] duration-(--kit-duration-state) hover:decoration-kit-ink motion-reduce:transition-none"
        }`}
      >
        {open ? <Highlight active>{words}</Highlight> : words}
        <sup aria-hidden className="ml-0.5 font-kit-mono text-kit-mono-sm text-kit-pen">
          {m.n}
        </sup>
        <span className="sr-only">{` (idea ${m.n})`}</span>
      </span>
    )
    from = m.end
  }
  prose.push(scrap.slice(from))

  return (
    <div className="flex min-w-0 flex-col gap-kit-related">
      {scrap.trim() ? (
        <p className="max-w-[62ch] text-kit-body leading-6 text-pretty whitespace-pre-line text-kit-ink">{prose}</p>
      ) : null}
      {children}
    </div>
  )
}

/**
 * The ideas in the margin, in reading order: the marked ones by number, then
 * the ones drawn from the whole material. A render prop, because what an
 * open idea holds is the page's to say.
 */
export function MarkedUpMargin({ children }: { children: (idea: MarginItem) => React.ReactNode }) {
  const { placed, loose, value } = useMarkedUp("MarkedUpMargin")
  if (placed.length === 0 && loose.length === 0) return null
  return (
    <section aria-label="Ideas in the margin" className="flex min-w-0 flex-col gap-1">
      <p className="pb-1 text-kit-meta font-kit-strong text-kit-ink-muted">In the margin</p>
      <ol className="flex flex-col gap-1">
        {placed.map((m) => children({ angle: m.angle, n: m.n, open: m.angle.id === value }))}
        {/* Only worth saying when some ideas are marked and these are not. */}
        {loose.length > 0 && placed.length > 0 ? (
          <li aria-hidden className="pt-kit-related text-kit-meta text-kit-ink-muted">
            From the whole note
          </li>
        ) : null}
        {loose.map((a) => children({ angle: a, open: a.id === value }))}
      </ol>
    </section>
  )
}

/**
 * One idea in the margin: a disclosure whose head is its number and hook,
 * and whose body (`children`, while open) is what the page puts there.
 */
export function MarginIdea({ idea, children }: { idea: MarginItem; children?: React.ReactNode }) {
  const { onValueChange } = useMarkedUp("MarginIdea")
  const { angle, n, open } = idea
  const done = angle.status === "drafted"
  const bodyId = React.useId()
  return (
    <li
      data-open={open || undefined}
      className="flex flex-col rounded-kit-control-inner transition-[background-color,box-shadow] duration-(--kit-duration-state) ease-kit-out data-open:bg-kit-object data-open:shadow-kit-inset motion-reduce:transition-none"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        onClick={() => onValueChange(angle.id)}
        className={`relative flex items-baseline gap-2 rounded-kit-control-inner px-2.5 py-2 text-left ${FOCUS_RING} focus-visible:outline-offset-0 ${HIT_44} transition-[background-color] duration-(--kit-duration-state) motion-reduce:transition-none ${open ? "" : "hover:bg-kit-row-hover"}`}
      >
        <span aria-hidden className="w-3 shrink-0 font-kit-mono text-kit-mono-sm text-kit-pen">
          {n ?? "·"}
        </span>
        <span
          data-slot="margin-idea-hook"
          className={`min-w-0 flex-1 text-kit-dense ${open ? "font-kit-strong text-kit-ink" : done ? "text-kit-ink-muted" : "text-kit-ink"}`}
        >
          {angle.hook}
        </span>
        {done ? <StatusPill status="drafted" hideWord /> : null}
      </button>
      {open && children != null ? (
        <div id={bodyId} className="flex flex-col gap-kit-related px-2.5 pb-2.5 ps-7.5">
          {children}
        </div>
      ) : null}
    </li>
  )
}
