import * as React from "react"

/**
 * The thin hand-drawn bracket that spans the lines a note is about. Internal:
 * MarginNote and BeatBracket own it. A non-text mark, so muted is enough for
 * graphite; the pen is its own token.
 */
export function Bracket({ tone }: { tone: "graphite" | "pen" }) {
  return (
    <span
      aria-hidden
      className="relative hidden flex-none self-stretch w-[9px] @lg/kit-stage:block"
    >
      <svg
        viewBox="0 0 10 100"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full overflow-visible"
      >
        <path
          d="M1 1.5 C 5 1.5, 6 3, 6 8 L 6.4 44 C 6.5 48, 7.5 50, 10 50 C 7.5 50, 6.5 52, 6.4 56 L 6 92 C 6 97, 5 98.5, 1 98.5"
          fill="none"
          stroke={tone === "pen" ? "var(--kit-pen)" : "var(--kit-ink-muted)"}
          strokeWidth={1.3}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </span>
  )
}

/** Quincy's handwriting. Caveat 21px at 500, tilted 2°. */
export function Hand({
  children,
  tone,
}: {
  children: React.ReactNode
  tone: "graphite" | "pen"
}) {
  return (
    <span
      className={`inline-block -rotate-2 font-kit-hand text-kit-hand ${tone === "pen" ? "text-kit-pen" : "text-kit-ink-muted"}`}
    >
      {children}
    </span>
  )
}

/**
 * Where a note sits. By default, under the line it marks. Only inside a
 * Stage at least 32rem wide does it move out to the margin column past the
 * object's outer edge (`--kit-card-pad` is set by Card / Window). Mobile-first
 * on purpose: outside any Stage there is no container to measure, and the
 * safe answer is under the line, not off the edge of something unknown.
 */
export const MARGIN_SLOT =
  "mt-1 flex items-center gap-2 @lg/kit-stage:absolute @lg/kit-stage:-top-0.5 @lg/kit-stage:-bottom-0.5 @lg/kit-stage:left-[calc(100%+var(--kit-card-pad,0px)+var(--spacing-kit-margin-gap))] @lg/kit-stage:mt-0 @lg/kit-stage:w-kit-margin"
