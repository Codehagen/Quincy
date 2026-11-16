import { BLUE, IconSheet, type Tone } from "../../sheet"

/**
 * 16 — Approved stamp.
 *
 * A rubber stamp pressed a little crooked, with a check in it: you looked,
 * and you said yes. From 32 up it is tilted and has the inner rule a real
 * stamp has; at 16 it stands straight, because a rotated 2px frame on a
 * 16px grid is mostly anti-aliasing.
 */
function Mark({ size, tone }: { size: number; tone: Tone }) {
  const c = BLUE[tone]
  const big = size >= 32
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <g transform={big ? "rotate(-9 8 8)" : undefined} stroke={c}>
        <rect
          x="2"
          y="3"
          width="12"
          height="10"
          rx="2"
          strokeWidth={big ? 1.5 : 2}
        />
        {big ? (
          <rect x="3.6" y="4.6" width="8.8" height="6.8" rx="1" strokeWidth="0.5" />
        ) : null}
        <path
          d="M5.4 8.1 L7.3 10 L10.8 6.3"
          strokeWidth={big ? 1.6 : 2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  )
}

export default function ApprovedStamp() {
  return (
    <IconSheet name="Approved stamp" mark={(s, t) => <Mark size={s} tone={t} />} />
  )
}
