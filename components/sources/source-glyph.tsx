import {
  Image01Icon,
  Mail01Icon,
  Mic01Icon,
  NewsIcon,
} from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"

import { GlyphTile } from "@/components/kit"
import {
  hasPlatformMark,
  PlatformMark,
} from "@/components/channels/platform-mark"

/**
 * The tile at the start of a row on /sources: the kit's GlyphTile, with the
 * glyph chosen by the rule components/sources/source-mark.tsx states. A row
 * that names a vendor or a format with an agreed mark takes that mark from
 * platform-mark; a row that names a kind of material (voice, email, photos)
 * takes a hugeicon; anything else shows its first letter (GlyphTile's
 * fallback).
 *
 * `quiet` is for a source that cannot be connected yet.
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

export function SourceGlyph({
  id,
  label,
  quiet = false,
}: {
  id: string
  label: string
  quiet?: boolean
}) {
  const mark = MARK_FOR[id] ?? id
  return (
    <GlyphTile
      label={label}
      quiet={quiet}
      icon={MATERIAL_ICON[id]}
      mark={hasPlatformMark(mark) ? <PlatformMark platform={mark} size={16} /> : undefined}
    />
  )
}
