"use client"

import * as React from "react"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  Alert02Icon,
  Clock01Icon,
  Edit01Icon,
  Mail01Icon,
  Mic01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"

import { Friend } from "@/components/mascot"

import type { Riff } from "@/lib/riffs"
import { hasPlatformMark, PlatformMark } from "@/components/channels/platform-mark"

import { ageOf, type RowStatus } from "../data"

/**
 * CANDIDATES — the cells of an idea row. Each is one fact in one shape, so
 * a column reads down as well as across.
 */

const MATERIAL: Record<string, IconSvgElement> = { voice: Mic01Icon, email: Mail01Icon }
const MARK_FOR: Record<string, string> = { calendar: "googlecalendar" }

/** The source's glyph alone: a brand mark, a material icon, or the pen for typed text. Monochrome. */
export function SourceGlyph({ id }: { id: string }) {
  const mark = MARK_FOR[id] ?? id
  if (hasPlatformMark(mark)) {
    return (
      <span data-ws-icon aria-hidden className="grid shrink-0 place-items-center *:size-[85%]">
        <PlatformMark platform={mark} size={14} />
      </span>
    )
  }
  return <HugeiconsIcon icon={MATERIAL[id] ?? Edit01Icon} data-ws-icon aria-hidden className="shrink-0" />
}

/** Glyph + name, muted, one line. The table's Source column and the rail's meta. */
export function SourceCell({ riff }: { riff: Pick<Riff, "sourceId" | "sourceLabel"> }) {
  return (
    <span className="ws-meta inline-flex min-w-0 items-center gap-1.5 text-kit-ink-muted">
      <SourceGlyph id={riff.sourceId} />
      <span className="truncate">{riff.sourceLabel}</span>
    </span>
  )
}

/** The shape, styled by the lab's tag control (text, outline or fill). Never pressable. */
export function ShapeTag({ children }: { children: string }) {
  return (
    <span data-ws-tag className="ws-meta">
      <span className="truncate">{children}</span>
    </span>
  )
}

/** Where it would go, as marks. The names go to assistive tech once, in a sentence. */
export function Channels({ channels }: { channels: { id: string; label: string }[] }) {
  if (channels.length === 0) {
    return (
      <span className="ws-meta text-kit-ink-muted">
        <span aria-hidden>—</span>
        <span className="sr-only">No channel</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-kit-ink-muted">
      <span className="sr-only">{`For ${channels.map((c) => c.label).join(" and ")}`}</span>
      {channels.map((c) =>
        hasPlatformMark(c.id) ? (
          <span key={c.id} data-ws-icon aria-hidden className="grid place-items-center *:size-[80%]">
            <PlatformMark platform={c.id} size={13} />
          </span>
        ) : (
          <span key={c.id} aria-hidden className="ws-meta">
            {c.label}
          </span>
        )
      )}
    </span>
  )
}

/** "today", "1d", "9 Nov". Mono 11, tabular, right-aligned by its column. */
export function Age({ riff }: { riff: Pick<Riff, "capturedAt"> }) {
  return <span className="ws-mono text-kit-ink-muted">{ageOf(riff as Riff)}</span>
}

/**
 * A row's state as a mark and a word. Reading is the only live thing (the
 * friend reading); failed is the alert glyph in ink-muted, not red,
 * because nothing was destroyed. Waiting shows nothing: it is the default.
 */
export function StatusPill({ status, withWord = true }: { status: RowStatus; withWord?: boolean }) {
  if (status === "waiting") return null
  const word = { reading: "Reading", failed: "No post", drafted: "Drafted", later: "Later" }[status]
  return (
    <span className="ws-meta inline-flex items-center gap-1.5 whitespace-nowrap text-kit-ink-muted">
      {status === "reading" ? (
        <span className="grid size-(--ws-icon) place-items-center">
          <Friend size={16} state="reading" className="shrink-0" />
        </span>
      ) : (
        <HugeiconsIcon
          icon={status === "failed" ? Alert02Icon : status === "drafted" ? Tick02Icon : Clock01Icon}
          data-ws-icon
          aria-hidden
          className="shrink-0"
        />
      )}
      <span className={withWord ? "" : "sr-only"}>{word}</span>
    </span>
  )
}
