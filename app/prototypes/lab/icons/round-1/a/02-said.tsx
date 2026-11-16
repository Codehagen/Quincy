import { IconSheet } from "../../sheet"

/**
 * 02 — Said.
 *
 * A speech bubble whose tail sits where a Q's tail sits, with two lines of
 * text knocked out of it: what you said, already set as words. One solid
 * shape, so it holds at 16 where an outline bubble turns to a ring.
 */
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d="M0.5 7.5a7 7 0 1 0 14 0a7 7 0 1 0 -14 0Z M4 5h7v2H4Z M4 9h5v2H4Z"
      />
      <path d="M10 13 L16 16 L13.2 10.2Z" fill="currentColor" />
    </svg>
  )
}

export default function Said() {
  return <IconSheet name="Said" mark={(s) => <Mark size={s} />} />
}
