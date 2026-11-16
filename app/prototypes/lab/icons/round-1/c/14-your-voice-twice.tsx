import { BLUE, IconSheet, type Tone } from "../../sheet"

/**
 * 14 — Your voice, twice.
 *
 * Your bubble in front, solid ink, and the same bubble behind it in blue
 * outline: the second voice that sounds like yours. The front is solid so it
 * covers the back without needing to know the colour of the page.
 */
function Mark({ size, tone }: { size: number; tone: Tone }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="6"
        y="2"
        width="9"
        height="7"
        rx="2"
        stroke={BLUE[tone]}
        strokeWidth="2"
      />
      <rect x="1" y="6" width="10" height="7" rx="2.5" fill="currentColor" />
      <path d="M2.5 12 L2.5 15.5 L6.5 12Z" fill="currentColor" />
    </svg>
  )
}

export default function YourVoiceTwice() {
  return (
    <IconSheet
      name="Your voice, twice"
      mark={(s, t) => <Mark size={s} tone={t} />}
    />
  )
}
