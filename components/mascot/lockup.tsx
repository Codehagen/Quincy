import { kitSans } from "@/components/kit/fonts"

import type { MascotState } from "./engine"
import { PixelFriend } from "./pixel-friend"

export type QuincyMarkProps = {
  /**
   * `sm`: friend 16 beside 14px type, for a header or a sidebar.
   * `md`: friend 32 beside 28px type. The same 7:8 ratio at both sizes.
   */
  size?: "sm" | "md"
  /** The friend's state. Idle unless the lockup itself reports work. */
  state?: MascotState
  /** Freeze the friend on its first frame, e.g. in a static picture. */
  still?: boolean
}

const SIZE = {
  sm: { friend: 16, row: "gap-kit-wordmark-sm", word: "text-kit-body" },
  md: { friend: 32, row: "gap-kit-wordmark-md", word: "text-kit-wordmark" },
} as const

/**
 * The lockup: Pixel friend beside "Quincy" in Inter 560 (lab round 2, 38).
 * The word is the accessible name, so the friend is decorative here. Colour
 * is inherited: the friend's ink and the word are both currentColor, and the
 * sash's yellow is the only colour in the line.
 *
 * Inter is set by its own class rather than read from <KitRoot>, because a
 * wordmark has to be Inter on a page that has not moved to the kit yet.
 */
export function QuincyMark({ size = "sm", state = "idle", still = false }: QuincyMarkProps) {
  const s = SIZE[size]
  return (
    <span
      data-slot="quincy-mark"
      className={`${kitSans.className} inline-flex items-center ${s.row}`}
    >
      <PixelFriend state={state} size={s.friend} frozenAt={still ? 0 : undefined} />
      <span className={`${s.word} leading-none font-kit-strong`}>Quincy</span>
    </span>
  )
}
