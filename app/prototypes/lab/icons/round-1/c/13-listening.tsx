import { IconSheet } from "../../sheet"

/**
 * 13 — Listening.
 *
 * An ear, reduced to the curve of the rim and the curl inside it: Quincy
 * listens before it writes. From 32 up the inner curl is drawn; at 16 only
 * the rim stays, because two curves 2px apart fuse into one blot.
 */
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.5 6.5 A4.5 4.5 0 1 1 11.6 9.2 C10.4 10.4 9.8 11.2 9.8 12.6 A2.4 2.4 0 0 1 5.2 13.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {size >= 32 ? (
        <path
          d="M6.4 6.6 A1.8 1.8 0 1 1 9.4 7.9"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  )
}

export default function Listening() {
  return <IconSheet name="Listening" mark={(s) => <Mark size={s} />} />
}
