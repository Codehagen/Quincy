"use client"

/*
 * The editor's own pieces, drawn for a picture: the lanes, the frame, the
 * receipt. Calmer versions of components/editor (Stageshow's "simplified"):
 * the real lanes are a spine, a caption lane and an effect lane with a
 * waveform in the clip; here the spine and the captions carry the story and
 * the rest is left out.
 *
 * Every motion is a CSS transition over one state change, never a
 * simulation of work arriving (app/prototypes/editor/run.tsx): the run
 * computes every cut at once, and the stagger is only so twenty things
 * moving can be read.
 */

import { CUT_SECONDS, LINES, PAUSES_CUT, RAW_SECONDS, SEGMENTS, clock, jitter } from "./take"

/* ── The lanes ────────────────────────────────────────────────────────── */

/**
 * The spine and the caption lane over one raw take. `cut` closes the pauses:
 * each stretch of speech slides left to where it lands after the cut, the
 * silence before it folds to nothing, and its caption rides with it.
 * Transforms and opacity only, so a reversed flip retargets.
 */
export function Lanes({
  width,
  cut,
  captions = true,
  compact = false,
  fit = "raw",
  tall = false,
}: {
  /** The lane's width in px, for the whole raw take. */
  width: number
  cut: boolean
  captions?: boolean
  compact?: boolean
  /**
   * What the lane's width holds. `raw` (default): the whole take, so the
   * cut visibly shrinks. `cut`: the finished cut, so the raw take runs off
   * the edge and closes up to fill the lane, the way the editor zooms to fit.
   */
  fit?: "raw" | "cut"
  /** A close-up: taller lanes, for a picture where the lanes are the whole subject. */
  tall?: boolean
}) {
  const px = width / (fit === "cut" ? CUT_SECONDS : RAW_SECONDS)
  const laneH = compact ? 36 : tall ? 72 : 44
  const ticks = fit === "cut" ? [0, 10, 20, 30] : [0, 30, 60, 90]

  return (
    <div className="flex flex-col gap-1.5 overflow-hidden" style={{ width }}>
      {/* The ruler: a time scale, so it does not move when the cut does. */}
      <div className="relative h-4">
        {ticks.map((t) => (
          <span key={t} className="absolute top-0 font-kit-mono text-kit-mono text-kit-ink-muted tabular-nums" style={{ left: t * px }}>
            {clock(t)}
          </span>
        ))}
      </div>

      {/* The spine. */}
      <div className="relative rounded-kit-control-inner bg-kit-well" style={{ height: laneH }}>
        {SEGMENTS.map((s, i) => {
          return (
            <div
              key={s.at}
              className="absolute inset-y-0 left-0 transition-transform duration-(--kit-duration-travel) ease-kit-move motion-reduce:transition-none"
              style={{
                transform: `translateX(${(cut ? s.cutAt : s.at - s.pause) * px}px)`,
                transitionDelay: `${i * 45}ms`,
              }}
            >
              {/* The pause before it: folds away from its right edge. */}
              <span
                aria-hidden
                className="absolute inset-y-1 left-0 origin-right rounded-[2px] bg-kit-skeleton transition-[scale,opacity] duration-(--kit-duration-travel) ease-kit-move motion-reduce:transition-none"
                style={{
                  width: s.pause * px,
                  scale: cut ? "0 1" : "1 1",
                  opacity: cut ? 0 : 1,
                  transitionDelay: `${i * 45}ms`,
                }}
              />
              {/* The speech: a clip with its waveform. */}
              <span
                className="absolute inset-y-0 flex items-center gap-px overflow-hidden rounded-[4px] bg-kit-object px-1 shadow-kit-control transition-transform duration-(--kit-duration-travel) ease-kit-move motion-reduce:transition-none"
                style={{
                  left: 0,
                  width: s.length * px - 1,
                  transform: `translateX(${cut ? 0 : s.pause * px}px)`,
                  transitionDelay: `${i * 45}ms`,
                }}
              >
                {Array.from({ length: Math.max(2, Math.floor((s.length * px) / 4)) }, (_, j) => (
                  <span
                    key={j}
                    aria-hidden
                    className="w-[2px] flex-none rounded-full bg-kit-ink-muted"
                    style={{ height: `${Math.round(18 + jitter(i * 31 + j) * 52)}%`, opacity: 0.55 }}
                  />
                ))}
              </span>
            </div>
          )
        })}
      </div>

      {/* The captions: each line keeps the instant it was said, so it lands where its words land. */}
      {/* Always mounted, so turning captions on fades them in rather than popping a lane. */}
      <div
        aria-hidden={!captions || undefined}
        className="relative transition-opacity duration-(--kit-duration-enter) ease-kit-out motion-reduce:transition-none"
        style={{ height: compact ? 22 : 24, opacity: captions ? 1 : 0 }}
      >
          {SEGMENTS.map((s, i) => (
            <span
              key={s.at}
              className="absolute inset-y-0 left-0 block truncate rounded-[4px] bg-kit-action-tint px-1.5 text-kit-small leading-[24px] whitespace-nowrap text-kit-action-ink transition-transform duration-(--kit-duration-travel) ease-kit-move motion-reduce:transition-none"
              style={{
                width: s.length * px - 1,
                transform: `translateX(${(cut ? s.cutAt : s.at) * px}px)`,
                transitionDelay: `${i * 45}ms`,
              }}
            >
              {LINES[i]}
            </span>
          ))}
      </div>
    </div>
  )
}

/* ── The frame ────────────────────────────────────────────────────────── */

/** The take's loudness, sampled once: fixed, so the server and the client draw the same bars. */
const WAVE = Array.from({ length: 28 }, (_, i) => Math.round(25 + jitter(i * 7 + 3) * 75))

/**
 * The cut's picture, vertical: a desk recorded in low light, out of focus
 * behind where the speaker sits (a window's glow, a shelf, a laptop and a
 * mug), the caption over it and the take's waveform at its foot. No face,
 * no photo: the story is the edit, and a drawn person reads as a stand-in.
 * `punch` pushes the picture in for emphasis (punch_in); the caption and the
 * waveform stay put, which is what a punch-in is.
 *
 * The frame is dark in both themes: footage is not a surface that flips.
 * Every shape is in percentages, so any width draws the same room.
 */
export function Frame({
  width,
  caption,
  punch = false,
  playhead,
}: {
  width: number
  caption?: string
  punch?: boolean
  /** Where the playhead sits on the waveform, 0 to 1. Omit it and there is no waveform (a thumbnail). */
  playhead?: number
}) {
  return (
    <div
      aria-hidden
      className="@container pointer-events-none relative isolate overflow-hidden rounded-kit-control bg-kit-ink select-none dark:bg-kit-ground dark:shadow-kit-object"
      style={{ width, aspectRatio: "9 / 16" }}
    >
      <div
        className="absolute inset-0 origin-[50%_42%] transition-[scale] duration-(--kit-duration-travel) ease-kit-move motion-reduce:transition-none"
        style={{ scale: punch ? "1.18" : "1" }}
      >
        {/* The room, out of focus: soft light from a window, a shelf, a lamp. */}
        <div className="absolute inset-0" style={{ filter: "blur(2.4cqw)" }}>
          <span className="absolute rounded-[8%] bg-kit-ground opacity-15 dark:bg-kit-ink" style={{ left: "50%", top: "6%", width: "42%", height: "36%" }} />
          <span className="absolute rounded-full bg-kit-ground opacity-10 dark:bg-kit-ink" style={{ left: "6%", top: "14%", width: "30%", height: "17%" }} />
          <span className="absolute bg-kit-ground opacity-10 dark:bg-kit-ink" style={{ left: "4%", top: "38%", width: "40%", height: "1.6%" }} />
          <span className="absolute rounded-[10%] bg-kit-ground opacity-10 dark:bg-kit-ink" style={{ left: "10%", top: "31%", width: "6%", height: "7%" }} />
          <span className="absolute rounded-[10%] bg-kit-ground opacity-10 dark:bg-kit-ink" style={{ left: "18%", top: "29.5%", width: "5%", height: "8.5%" }} />
          <span className="absolute rounded-[10%] bg-kit-ground opacity-10 dark:bg-kit-ink" style={{ left: "29%", top: "32.5%", width: "9%", height: "5.5%" }} />
        </div>
        {/* The desk, nearer the lens so less soft: its edge, a laptop, a mug. */}
        <div className="absolute inset-0" style={{ filter: "blur(0.8cqw)" }}>
          <span className="absolute inset-x-0 bottom-0 bg-kit-ground opacity-10 dark:bg-kit-ink" style={{ height: "24%" }} />
          <span className="absolute rounded-t-[6%] bg-kit-ground opacity-20 dark:bg-kit-ink" style={{ left: "12%", bottom: "25.5%", width: "44%", height: "17%" }} />
          <span className="absolute rounded-[2px] bg-kit-ground opacity-25 dark:bg-kit-ink" style={{ left: "7%", bottom: "23.5%", width: "54%", height: "2.2%" }} />
          <span className="absolute rounded-b-[30%] bg-kit-ground opacity-25 dark:bg-kit-ink" style={{ left: "68%", bottom: "24%", width: "12%", height: "9%" }} />
          <span className="absolute rounded-full border-kit-ground opacity-25 dark:border-kit-ink" style={{ left: "78%", bottom: "26.5%", width: "6%", height: "4.5%", borderWidth: "1.2cqw" }} />
        </div>
      </div>

      {caption ? (
        <span
          className="absolute inset-x-[8%] text-center font-kit-strong text-balance text-kit-ground uppercase dark:text-kit-ink"
          style={{ bottom: playhead === undefined ? "17%" : "20%", fontSize: "9cqw", lineHeight: 1.1, letterSpacing: "-0.01em" }}
        >
          {caption}
        </span>
      ) : null}

      {playhead === undefined ? null : (
        <span className="absolute inset-x-[8%] flex items-center gap-[1.2cqw]" style={{ bottom: "6%", height: "6%" }}>
          {WAVE.map((h, i) => (
            <span
              key={i}
              className={`flex-1 rounded-full bg-kit-ground transition-opacity duration-(--kit-duration-travel) ease-kit-out motion-reduce:transition-none dark:bg-kit-ink ${
                i / WAVE.length < playhead ? "opacity-80" : "opacity-30"
              }`}
              style={{ height: `${h}%` }}
            />
          ))}
        </span>
      )}
    </div>
  )
}

/* ── The receipt ──────────────────────────────────────────────────────── */

export function Check() {
  return (
    <svg aria-hidden width={16} height={16} viewBox="0 0 16 16" className="flex-none">
      <circle cx="8" cy="8" r="8" className="fill-kit-ink" />
      <path
        d="M4.6 8.2 L7 10.5 L11.4 5.8"
        fill="none"
        className="stroke-kit-object"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** What each tool said it did, in the tool's own terms (lib/editor/agent.ts). */
export const RECEIPT = [
  [`Removed ${PAUSES_CUT} pauses`, `${clock(RAW_SECONDS)} is ${clock(CUT_SECONDS)} now`],
  ["Captions on", "word by word, from the transcript"],
  ["Punched in", "on clip 4, “Sixty-eight percent”"],
] as const

/** The receipt, `shown` lines of it. Lines not yet there keep their room. */
export function Receipt({ shown }: { shown: number }) {
  return (
    <div role="list" className="flex flex-col gap-1">
      {RECEIPT.map(([did, result], i) => (
        <div
          role="listitem"
          key={did}
          data-on={i < shown || undefined}
          aria-hidden={i >= shown || undefined}
          className="flex translate-y-1 items-start gap-2.5 opacity-0 transition-[opacity,translate] duration-(--kit-duration-enter) ease-kit-out data-on:translate-y-0 data-on:opacity-100 motion-reduce:transition-none"
        >
          <span className="mt-0.5">
            <Check />
          </span>
          <span>
            <span className="font-kit-strong">{did}</span>
            <span className="text-kit-ink-muted tabular-nums"> → {result}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

/** Export as the editor's button carries it. A span: this is a picture. */
export function ExportChip({ label = "Export" }: { label?: string }) {
  return (
    <span className="inline-flex h-kit-control-md flex-none items-center rounded-kit-control bg-kit-control px-4 font-kit-strong shadow-kit-control">
      {label}
    </span>
  )
}

/** The person's message, as the editor chat shows it. */
export function YouSaid({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <span className="max-w-[85%] rounded-kit-control bg-kit-object px-3 py-2 shadow-kit-control">{children}</span>
    </div>
  )
}
