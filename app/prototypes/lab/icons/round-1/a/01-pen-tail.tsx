import { BLUE, IconSheet, type Tone } from "../../sheet"

/**
 * 01 — Pen tail.
 *
 * An ink ring, and the tail is the blue pen: the one stroke Quincy adds to
 * what you wrote. From 32 up the tail tapers like a nib; at 16 it is a plain
 * round-capped line, because a taper below 3px is only blur.
 */
function Mark({ size, tone }: { size: number; tone: Tone }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" />
      {size >= 32 ? (
        <path
          d="M8.9 10.3 L10.3 8.9 Q13.2 11.6 15.6 15.6 Q11.6 13.2 8.9 10.3Z"
          fill={BLUE[tone]}
        />
      ) : (
        <path
          d="M10 10 L14.5 14.5"
          stroke={BLUE[tone]}
          strokeWidth="2.25"
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}

export default function PenTail() {
  return <IconSheet name="Pen tail" mark={(s, t) => <Mark size={s} tone={t} />} />
}
