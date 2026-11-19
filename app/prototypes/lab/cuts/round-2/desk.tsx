"use client"

/*
 * Round 2's base surface: piece 02's layout (large preview, full lanes, a
 * narrow chat margin of short prose), with every place an op can land
 * marked as a cursor target (`data-q`). The lanes are drawn from a CutState,
 * so what the cursor presses is what changes.
 */

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { PlayIcon } from "@hugeicons/core-free-icons"

import { Button, Kbd } from "@/components/kit"
import { Friend } from "@/components/mascot"

import { CAPTIONS, HOOK, SEGMENTS, TAKE, fmt, fmtWhole } from "../round-1/fixture"
import { EditorBar, Frame, Picture, Waveform } from "../round-1/parts"
import { target } from "./cursor"
import type { CutState } from "./ops"
import type { CutChat } from "./use-cut-chat"

/* ----------------------------------------------------------------- layout */

type Placed = { id: string; kind: string; text: string; from: number; to: number; at: number; end: number; gone: boolean }

/** Every segment on the cut's clock; removed ones keep a zero-width spot (the seam). */
function place(removed: ReadonlySet<string>) {
  const out: Placed[] = []
  let t = 0
  for (const s of SEGMENTS) {
    const gone = removed.has(s.id)
    const d = gone ? 0 : s.end - s.at
    out.push({ id: s.id, kind: s.kind, text: s.text, from: t, to: t + d, at: s.at, end: s.end, gone })
    t += d
  }
  return { placed: out, total: t }
}

/** Clip boxes: runs of kept segments between seams. */
function clipsOf(placed: Placed[]) {
  const clips: { from: number; to: number; src: [number, number] }[] = []
  for (const p of placed) {
    if (p.gone) continue
    const last = clips.at(-1)
    const prev = placed[placed.indexOf(p) - 1]
    if (last && prev && !prev.gone) {
      last.to = p.to
      last.src[1] = p.end
    } else clips.push({ from: p.from, to: p.to, src: [p.at, p.end] })
  }
  return clips
}

const NAME = 62

export type LanesProps = {
  /** The target an op just landed on: it flashes. */
  hot?: string | null
  cut: CutState
  width: number
  playhead?: number
  tone?: "ink" | "highlight" | "well"
  held?: React.ReactNode
  /** Targets get this prefix, so three lanes on one page keep apart. */
  prefix?: string
  lanes?: ReadonlyArray<"clips" | "captions" | "effects">
  bare?: boolean
  /** Small numbered dots on targets that have landed (piece 23). */
  trail?: ReadonlyArray<string>
}

export function Lanes({
  hot = null,
  cut,
  width,
  playhead,
  tone,
  held,
  prefix = "",
  lanes = ["clips", "captions", "effects"],
  bare = false,
  trail = [],
}: LanesProps) {
  const { placed, total } = place(cut.removed)
  const clips = clipsOf(placed)
  const inner = width - (bare ? 0 : NAME)
  const px = inner / TAKE.seconds // a fixed scale, so a cut visibly shortens the spine
  const hook = placed.find((p) => p.id === "hook")!
  const q = (id: string) => target(hot, prefix + id, tone)
  const dot = (id: string) => {
    const n = trail.indexOf(id)
    return n < 0 ? null : (
      <span className="absolute -top-2 -right-2 z-10 grid size-4 place-items-center rounded-full bg-kit-primary font-kit-mono text-[10px] text-kit-primary-on">
        {n + 1}
      </span>
    )
  }

  const lane = (name: string, h: number, body: React.ReactNode) => (
    <div className="flex items-center" style={{ height: h }}>
      {bare ? null : (
        <span className="shrink-0 text-kit-meta text-kit-ink-muted" style={{ width: NAME }}>
          {name}
        </span>
      )}
      <div className="relative h-full" style={{ width: inner }}>
        {body}
      </div>
    </div>
  )

  return (
    <div className="relative select-none" style={{ width }}>
      {lane(
        "",
        18,
        <>
          {/* A tick stops short of the end label, which owns the right edge,
              and gives way to a pause's label, which sits in this row too. */}
          {placed
            .filter((p) => p.kind !== "speech" && !p.gone)
            .map((p) => (
              <span
                key={`l-${p.id}`}
                className="absolute top-0 -translate-x-1/2 font-kit-mono text-kit-mono-sm whitespace-nowrap"
                style={{ left: ((p.from + p.to) / 2) * px }}
              >
                {p.kind === "pause" ? p.text : "um"}
              </span>
            ))}
          {[0, 5, 10, 15, 20, 25, 30, 35]
            .filter((t) => t * px < inner - 48)
            .filter((t) =>
              placed.every((p) => p.kind === "speech" || p.gone || Math.abs(((p.from + p.to) / 2) * px - t * px) > 30),
            )
            .map((t) => (
            <span key={t} className="absolute top-0 font-kit-mono text-kit-mono-sm text-kit-ink-muted tabular-nums" style={{ left: t * px }}>
              {fmtWhole(t)}
            </span>
          ))}
          <span className="absolute top-0 right-0 font-kit-mono text-kit-mono-sm tabular-nums">{fmt(total)}</span>
        </>,
      )}
      <div className="flex flex-col gap-1.5">
        {lanes.includes("clips")
          ? lane(
              "Clips",
              46,
              <>
                {clips.map((c, i) => (
                  <div
                    key={i}
                    className="absolute inset-y-0 flex flex-col justify-between overflow-hidden rounded-kit-chip bg-kit-object px-1.5 py-1 shadow-kit-control"
                    style={{ left: c.from * px + 1, width: (c.to - c.from) * px - 2 }}
                  >
                    <span className="truncate text-kit-meta font-kit-strong">Take 3{clips.length > 1 ? ` · ${i + 1}` : ""}</span>
                    <Waveform from={c.src[0]} to={c.src[1]} width={Math.max(4, (c.to - c.from) * px - 14)} height={16} />
                  </div>
                ))}
                {placed
                  .filter((p) => p.kind !== "speech")
                  .map((p) =>
                    p.gone ? (
                      <span
                        key={p.id}
                        {...q(p.id)}
                        className="qc-target absolute -inset-y-1 w-1 -translate-x-1/2 rounded-full bg-kit-ink-muted"
                        style={{ left: p.from * px }}
                      >
                        {dot(p.id)}
                      </span>
                    ) : (
                      <span
                        key={p.id}
                        {...q(p.id)}
                        className="qc-target absolute inset-y-0 rounded-kit-chip bg-kit-well ring-1 ring-kit-ink-muted ring-inset"
                        style={{ left: p.from * px, width: Math.max(6, (p.to - p.from) * px) }}
                      >
                        {dot(p.id)}
                      </span>
                    ),
                  )}
                {/* Every spoken line is a target too ("hook" is the strong one). */}
                {placed
                  .filter((p) => p.kind === "speech")
                  .map((p) =>
                    p.gone ? (
                      <span
                        key={p.id}
                        {...q(p.id)}
                        className="qc-target absolute -inset-y-1 w-1 -translate-x-1/2 rounded-full bg-kit-ink-muted"
                        style={{ left: p.from * px }}
                      />
                    ) : (
                      <span
                        key={p.id}
                        {...q(p.id)}
                        className="qc-target absolute inset-y-0 rounded-kit-chip"
                        style={{ left: p.from * px, width: (p.to - p.from) * px }}
                      >
                        {dot(p.id)}
                      </span>
                    ),
                  )}
              </>,
            )
          : null}
        {lanes.includes("captions")
          ? lane(
              "Captions",
              24,
              cut.captions ? (
                <span {...q("captions")} className="qc-target absolute inset-0 rounded-kit-chip">
                  {CAPTIONS.map((c) => {
                    const p = placed.find((x) => x.id === c.id)!
                    return (
                      <span
                        key={c.id}
                        className="absolute inset-y-0 truncate rounded-kit-chip bg-kit-well px-1 text-kit-meta leading-[24px] text-kit-ink-muted"
                        style={{ left: p.from * px + 1, width: (p.to - p.from) * px - 2 }}
                      >
                        {c.text}
                      </span>
                    )
                  })}
                  {dot("captions")}
                </span>
              ) : (
                <>
                  <span className="absolute inset-0 rounded-kit-chip border border-dashed border-kit-hairline" />
                  <span
                    {...q("captions")}
                    className="qc-target absolute inset-y-0 left-0 flex items-center rounded-kit-chip bg-kit-control px-2 text-kit-meta shadow-kit-control"
                  >
                    + Captions from the transcript
                  </span>
                </>
              ),
            )
          : null}
        {lanes.includes("effects")
          ? lane(
              "Effects",
              24,
              <>
                <span className="absolute inset-0 rounded-kit-chip border border-dashed border-kit-hairline" />
                {cut.zoom ? (
                  <span
                    {...q("zoom")}
                    className="qc-target absolute inset-y-0 rounded-kit-chip bg-kit-primary px-1.5 text-kit-meta leading-[24px] font-kit-strong whitespace-nowrap text-kit-primary-on"
                    style={{ left: hook.from * px, width: (HOOK.end - HOOK.at) * px }}
                  >
                    Zoom 1.3×
                  </span>
                ) : null}
              </>,
            )
          : null}
      </div>
      {playhead != null ? (
        <span aria-hidden className="pointer-events-none absolute top-0 bottom-0 w-px bg-kit-ink" style={{ left: (bare ? 0 : NAME) + playhead * px }}>
          <span className="absolute -top-0.5 -left-[3px] size-[7px] rounded-full bg-kit-ink" />
        </span>
      ) : null}
      {held ? (
        <div className="pointer-events-none absolute right-0 -bottom-7 flex items-center gap-1.5 text-kit-meta text-kit-ink-muted">
          <Friend size={16} state="writing" />
          {held}
        </div>
      ) : null}
    </div>
  )
}

/* ---------------------------------------------------------------- the desk */

/** The editor at 960×720: bar, preview over lanes on the left, the margin on the right. */
export function Desk({
  rootRef,
  seconds = TAKE.seconds,
  barRight,
  preview,
  lanes,
  margin,
  children,
  marginWidth = 268,
}: {
  rootRef?: (el: HTMLDivElement | null) => void | (() => void)
  seconds?: number
  barRight?: React.ReactNode
  preview: React.ReactNode
  lanes: React.ReactNode
  margin: React.ReactNode
  /** Overlays: the cursor(s), notes. */
  children?: React.ReactNode
  marginWidth?: number
}) {
  return (
    <Frame>
      <div ref={rootRef} className="absolute inset-0">
        <EditorBar seconds={seconds} precise right={barRight ?? <Button variant="action">Export</Button>} />
        <div className="flex h-[664px]">
          {/* items-start: the lanes panel's left edge is the preview's left edge. */}
          <div className="flex min-w-0 flex-1 flex-col items-start gap-4 px-6 pt-5">
            {preview}
            <div className="rounded-kit-object bg-kit-object px-4 pt-3 pb-4 shadow-kit-object">{lanes}</div>
          </div>
          <aside
            className="flex shrink-0 flex-col gap-4 border-l border-kit-hairline px-4 pt-4 pb-4 text-kit-small"
            style={{ width: marginWidth }}
          >
            {margin}
          </aside>
        </div>
        {children}
      </div>
    </Frame>
  )
}

/**
 * The preview and transport, reading the cut state. The caption is its own
 * target (`caption`), and the picture is one too (`preview`), so the
 * self-check's look and its fix have somewhere to land.
 */
export function DeskPreview({
  cut,
  hot = null,
  at = 16.9,
  width = 520,
  prefix = "",
}: {
  cut: CutState & { vertical?: boolean }
  hot?: string | null
  at?: number
  width?: number
  prefix?: string
}) {
  const vertical = cut.vertical ?? false
  return (
    <>
      <div {...target(hot, prefix + "preview", "well")} className="qc-target relative rounded-kit-control">
        {/* No time badge on the picture: the transport and the header say it. */}
        <Picture shape={vertical ? "9:16" : "16:9"} width={vertical ? Math.round(width * 0.33) : width} punch={cut.zoom} />
        {cut.captions ? (
          <div
            className="absolute inset-x-0 bottom-[6%] flex justify-center px-3 transition-[translate] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none"
            style={{ translate: cut.lift ? "0 -44px" : "0 0" }}
          >
            <span
              {...target(hot, prefix + "caption")}
              className="qc-target rounded-kit-chip bg-kit-primary px-2 py-0.5 text-center text-kit-small font-kit-strong text-kit-primary-on"
            >
              They were in the way.
            </span>
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2 self-stretch">
        <span className="grid size-8 place-items-center rounded-full bg-kit-control shadow-kit-control">
          <HugeiconsIcon icon={PlayIcon} size={14} aria-hidden />
        </span>
        <span className="font-kit-mono text-kit-mono tabular-nums">
          {fmt(at)} <span className="text-kit-ink-muted">/ {fmt(cut.seconds)}</span>
        </span>
        <span
          {...target(hot, prefix + "shape")}
          className="qc-target ml-auto rounded-kit-chip px-1.5 font-kit-mono text-kit-mono-sm text-kit-ink-muted"
        >
          {vertical ? "9:16" : "16:9"}
        </span>
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- margin */

/** The margin's head: the name, and Stop while a run works or Replay once it ended. */
export function MarginHead({ chat, title = "Cut with Quincy" }: { chat: CutChat; title?: string }) {
  return (
    <div className="relative flex h-7 shrink-0 items-center justify-between">
      <span className="font-kit-strong">{title}</span>
      {chat.busy ? (
        <span className="flex items-center gap-1.5">
          <Kbd keys={["esc"]} size="sm" />
          <Button size="xs" variant="quiet" onClick={() => void chat.stop()}>
            Stop
          </Button>
        </span>
      ) : chat.messages.length ? (
        <Button size="xs" variant="ghost" onClick={chat.replay}>
          Replay
        </Button>
      ) : null}
      {/* Where the cursor parks when a run ends or stops. */}
      <span data-q="park" aria-hidden className="absolute top-9 right-2 size-px" />
    </div>
  )
}
