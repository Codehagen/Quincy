import { BLUE, IconSheet, type Tone } from "../../sheet"

/**
 * 19 — Bubble with a pen.
 *
 * A character: a speech bubble that looks at you, with two eyes punched out
 * and its tail drawn as a blue pen nib. The bubble is the voice and the nib
 * is the edit, and where the tail sits makes the whole figure a Q. The eyes
 * are 2×2 holes on whole pixels, so the face survives at 16 on any ground.
 */
function Mark({ size, tone }: { size: number; tone: Tone }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d="M0.5 7.5a7 7 0 1 0 14 0a7 7 0 1 0 -14 0Z M4 5h2v3H4Z M9 5h2v3H9Z"
      />
      <path d="M10.2 12.6 L16 16 L12.6 10.2Z" fill={BLUE[tone]} />
    </svg>
  )
}

export default function BubbleWithAPen() {
  return (
    <IconSheet
      name="Bubble with a pen"
      mark={(s, t) => <Mark size={s} tone={t} />}
    />
  )
}
