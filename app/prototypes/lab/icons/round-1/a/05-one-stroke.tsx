import { IconSheet } from "../../sheet"

/**
 * 05 — One stroke.
 *
 * The Q written the way a hand writes it: one line that goes round, leaves
 * the loop open on the right, and runs out as the tail. A signature rather
 * than a letter, and still a ring with a tail at 16.
 */
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M12.2 4.6 A5.5 5.5 0 1 0 11.4 11.4 L14.8 14.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function OneStroke() {
  return <IconSheet name="One stroke" mark={(s) => <Mark size={s} />} />
}
