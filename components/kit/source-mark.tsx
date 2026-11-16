import * as React from "react"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  Edit01Icon,
  Image01Icon,
  Mail01Icon,
  Mic01Icon,
  NewsIcon,
} from "@hugeicons/core-free-icons"

import { hasPlatformMark, PlatformMark } from "@/components/channels/platform-mark"

/**
 * A kind of material has no logo, so it takes a hugeicon. The same rule as
 * components/sources/source-mark.tsx (the old system's tile): a row that names
 * a vendor takes the vendor's mark, a row that names material takes a glyph.
 * Copied rather than imported, because that file renders the old tile and is
 * deleted when the last page moves to the kit (plan 029).
 */
const MATERIAL_ICON: Record<string, IconSvgElement> = {
  voice: Mic01Icon,
  email: Mail01Icon,
  photos: Image01Icon,
  "hacker-news": NewsIcon,
}

/** Source ids whose mark is keyed under a brand name in platform-mark. */
const MARK_FOR: Record<string, string> = {
  calendar: "googlecalendar",
  "github-repo": "github",
}

export type SourceMarkProps = {
  /**
   * Where it came from: a source id from lib/sources.ts (`voice`, `github`,
   * `slack`) or a channel id (`x`, `linkedin`). `""` is material the person
   * typed on the page (`TYPED_SOURCE` in lib/riffs.ts).
   */
  id: string
  /** The name, as the product says it: "Voice note", "Pull request", "X". */
  label: string
  /** When, pre-rendered on the server: "Today", "Thu 07:45", "26 Aug". */
  when?: string
  /** A duration, size or count after the when: "4:12", "PR #418". */
  meta?: string
}

/**
 * Where a thing came from, on one muted line: the source's glyph, its name,
 * then when (mono). The kit's provenance mark, beside FileChip: FileChip is
 * the file the person handed over, SourceMark is the place it came from.
 *
 * The glyph is decorative (the name is beside it), monochrome in the text's
 * own grey: a brand palette per row would turn a list into a wall of logos.
 * A source with neither a mark nor a glyph shows its name alone.
 */
export function SourceMark({ id, label, when, meta }: SourceMarkProps) {
  const mark = MARK_FOR[id] ?? id
  const icon = MATERIAL_ICON[id] ?? (!id ? Edit01Icon : undefined)
  const name = label || (!id ? "Written here" : "")
  const tail = [when, meta].filter(Boolean).join(" · ")

  return (
    <span
      data-slot="kit-source-mark"
      className="inline-flex max-w-full min-w-0 items-center gap-kit-controls text-kit-small text-kit-ink-muted"
    >
      {hasPlatformMark(mark) ? (
        <PlatformMark platform={mark} size={14} />
      ) : icon ? (
        <HugeiconsIcon icon={icon} size={14} strokeWidth={2} aria-hidden className="shrink-0" />
      ) : null}
      {name ? <span className="truncate">{name}</span> : null}
      {tail ? (
        <span className="shrink-0 font-kit-mono text-kit-mono tabular-nums">
          {name ? "· " : ""}
          {tail}
        </span>
      ) : null}
    </span>
  )
}
