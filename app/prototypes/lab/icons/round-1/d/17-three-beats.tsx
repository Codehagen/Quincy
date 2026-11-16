import { BLUE, IconSheet, type Tone } from "../../sheet"

/**
 * 17 — Three beats.
 *
 * Every Quincy post is three beats: what I did, what happened, what it meant.
 * Three bars that get shorter, and the last one, the meaning, in blue. 3px
 * bars on 2px gaps, the rhythm of the post at the size of a favicon.
 */
function Mark({ size, tone }: { size: number; tone: Tone }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <rect x="1" y="2" width="14" height="3" rx="1" fill="currentColor" />
      <rect x="1" y="7" width="10" height="3" rx="1" fill="currentColor" />
      <rect x="1" y="12" width="6" height="3" rx="1" fill={BLUE[tone]} />
    </svg>
  )
}

export default function ThreeBeats() {
  return <IconSheet name="Three beats" mark={(s, t) => <Mark size={s} tone={t} />} />
}
