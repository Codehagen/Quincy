/**
 * Quincy as a small ink character, after round 1's c/blob.tsx: a soft ink
 * blob with two dot eyes. Ink and ground only, so in dark mode it is a light
 * grey shape with dark eyes, and it never spends a colour.
 *
 * The only thing it does is look. `look` moves both pupils toward what it is
 * looking at; `asleep` closes them. No mouth, no limbs, no props: a character
 * that holds a pen would be an illustration, and this is a mark.
 */
export type Look = "you" | "down" | "left" | "right" | "up" | "down-left" | "down-right"

const OFFSET: Record<Look, [number, number]> = {
  you: [0, 0],
  down: [0, 2.1],
  up: [0, -2.1],
  left: [-2.2, 0.4],
  right: [2.2, 0.4],
  "down-left": [-1.7, 1.7],
  "down-right": [1.7, 1.7],
}

export function Ink({
  size = 40,
  look = "you",
  asleep = false,
  className,
}: {
  size?: number
  look?: Look
  asleep?: boolean
  className?: string
}) {
  const [dx, dy] = OFFSET[look]
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 32 32" className={`flex-none ${className ?? ""}`}>
      <path
        d="M16 2.5c6.6 0 12.5 4.3 12.9 11.4.4 7.6-4.6 14.6-12.6 15.6C8.6 30.4 3 25.3 3.1 17.6 3.2 9 9 2.5 16 2.5Z"
        fill="var(--kit-ink)"
      />
      {asleep ? (
        <g fill="none" stroke="var(--kit-ground)" strokeWidth={1.4} strokeLinecap="round">
          <path d="M10.4 16 q1.8 1.6 3.6 0" />
          <path d="M18.4 16 q1.8 1.6 3.6 0" />
        </g>
      ) : (
        <>
          <circle cx={12.2 + dx} cy={15 + dy} r={1.9} fill="var(--kit-ground)" />
          <circle cx={20.2 + dx} cy={15 + dy} r={1.9} fill="var(--kit-ground)" />
        </>
      )}
    </svg>
  )
}
