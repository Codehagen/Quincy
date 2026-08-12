import { Image01Icon, Mail01Icon, Mic01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import { cn } from "@/lib/utils"
import {
  hasPlatformMark,
  PlatformMark,
} from "@/components/channels/platform-mark"

/**
 * The tile beside a source's name.
 *
 * One rule decides which glyph a source gets, and the rule is about the row's
 * name, not about what art happens to exist. A row that names a **thing with a
 * mark** — Slack, Loom, Notion, Google Calendar, GitHub, Circleback, Granola,
 * Fathom, and RSS, which is a format rather than a company but still has one
 * agreed mark — takes that mark from
 * `components/channels/platform-mark.tsx`. A row that names a **kind of
 * material** takes a generic hugeicon, because there is no logo for "what you
 * said out loud".
 *
 * That leaves exactly three hugeicons: voice, email and photos. Each of those
 * rows describes material rather than a vendor, so a brand mark would be wrong
 * even if one existed — Email is not Gmail and Photos is not Google Photos.
 *
 * Hugeicons ships its own `SlackIcon`, `LoomIcon` and `NotionIcon`, and using
 * them would put a hugeicons brand glyph next to the simple-icons GitHub mark
 * in the same column — two drawings of the same idea at different stroke
 * weights, which is the mismatch AGENTS.md bans. So the marks live in
 * platform-mark and every one of them was copied from a published file; an SVG
 * path written from memory renders as garbage, not as an approximation.
 *
 * The tile is muted throughout. Brass means "this rhythm is running" and a
 * source is not a rhythm — material arriving is not the same event as something
 * acting on it, and colouring both the same is what would make a page of
 * connected-but-unread sources read as healthy.
 */

const SOURCE_ICON: Record<string, IconSvgElement> = {
  voice: Mic01Icon,
  email: Mail01Icon,
  photos: Image01Icon,
}

/**
 * Source id → mark id, for the one row whose id is not its brand.
 *
 * `platform-mark.tsx` is keyed by brand because channels share it, and a bare
 * `calendar` key in a registry that also holds `x` and `github` would be the
 * one entry you cannot tell whose it is.
 */
const SOURCE_MARK: Record<string, string> = {
  calendar: "googlecalendar",
}

export function SourceMark({
  id,
  label,
  className,
}: {
  id: string
  label: string
  className?: string
}) {
  const mark = SOURCE_MARK[id] ?? id
  const icon = SOURCE_ICON[id]

  return (
    // Card radius is 20px and the row insets 16px, so the tile derives to
    // 20 − 16 = 4px.
    <div
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-xs bg-muted text-muted-foreground",
        className
      )}
    >
      {hasPlatformMark(mark) ? (
        <PlatformMark platform={mark} size={16} />
      ) : icon ? (
        <HugeiconsIcon aria-hidden="true" icon={icon} size={16} />
      ) : (
        // A source with neither a mark nor an icon still gets a filled tile
        // rather than an empty box. The row beside it already says the name, so
        // this is decoration, not information.
        <span aria-hidden="true" className="text-caption font-medium">
          {label.slice(0, 1).toUpperCase()}
        </span>
      )}
    </div>
  )
}
