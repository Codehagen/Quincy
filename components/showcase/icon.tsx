/*
 * Ported from Stageshow (MIT, Copyright (c) 2026 Benji Taylor): kit/parts/Icon.tsx.
 * See components/showcase/NOTICE.md. Stageshow draws its glyphs with lucide;
 * Quincy's one icon library is hugeicons (AGENTS.md), so the names map onto
 * hugeicons glyphs instead, at one size and one stroke per scene.
 */

import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  AudioWave01Icon,
  Calendar03Icon,
  Call02Icon,
  Comment01Icon,
  GitMergeIcon,
  Mic01Icon,
  PauseIcon,
  PencilEdit02Icon,
  PlayIcon,
  SentIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"

const GLYPHS = {
  play: PlayIcon,
  pause: PauseIcon,
  check: Tick02Icon,
  mic: Mic01Icon,
  wave: AudioWave01Icon,
  send: SentIcon,
  calendar: Calendar03Icon,
  comment: Comment01Icon,
  merge: GitMergeIcon,
  call: Call02Icon,
  edit: PencilEdit02Icon,
} satisfies Record<string, IconSvgElement>

export type IconName = keyof typeof GLYPHS

/**
 * A glyph in currentColor. Always decorative here: a faux screen is an
 * illustration, so its icons are hidden from assistive tech and the words
 * beside them (or the demo's caption) carry the meaning.
 */
export function Icon({
  name,
  size = 16,
  stroke = 1.6,
  className,
}: {
  name: IconName
  size?: number
  stroke?: number
  className?: string
}) {
  return (
    <HugeiconsIcon
      icon={GLYPHS[name]}
      size={size}
      strokeWidth={stroke}
      className={className ? `ss-icon ${className}` : "ss-icon"}
      aria-hidden
    />
  )
}
