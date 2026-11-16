import { BLUE, IconSheet, type Tone } from "../../sheet"

/**
 * 12 — In quotes.
 *
 * A closing quotation mark: what you said, kept as you said it. The first
 * comma is ink (you), the second is blue (Quincy quoting you back). Two
 * solid drops, each 5px across, so it never thins into punctuation at 16.
 */
const DROP =
  "M6.5 5 A2.5 2.5 0 1 0 4.4 7.47 C4.2 9.3 3.2 10.9 1.6 12 L2.3 13.2 C5.1 11.9 6.5 9.2 6.5 5Z"

function Mark({ size, tone }: { size: number; tone: Tone }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path d={DROP} fill="currentColor" transform="translate(0.5 0)" />
      <path d={DROP} fill={BLUE[tone]} transform="translate(8 0)" />
    </svg>
  )
}

export default function InQuotes() {
  return <IconSheet name="In quotes" mark={(s, t) => <Mark size={s} tone={t} />} />
}
