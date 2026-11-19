"use client"

/*
 * Suggestion, on the kit: one press sends a whole request. Each pill can
 * carry a second line, what Quincy read that makes it worth sending. The
 * row scrolls sideways rather than wrapping; it leaves once there is a
 * conversation.
 */

export function Suggestions({
  items,
  onPick,
  disabled,
  stacked = false,
}: {
  items: readonly { text: string; read?: string }[]
  onPick: (text: string) => void
  disabled?: boolean
  /** One per row, full width: for a narrow margin. */
  stacked?: boolean
}) {
  return (
    <div role="group" aria-label="Suggestions" className={stacked ? "flex flex-col gap-1.5" : "flex gap-1.5 overflow-x-auto"}>
      {items.map((s) => (
        <button
          key={s.text}
          type="button"
          disabled={disabled}
          onClick={() => onPick(s.text)}
          className="relative flex min-h-11 shrink-0 flex-col items-start justify-center rounded-kit-control bg-kit-control px-3 py-1.5 text-left shadow-kit-control transition-[background-color,scale] duration-(--kit-duration-state) ease-kit-out hover:bg-kit-control-hover focus-visible:outline-2 focus-visible:outline-kit-focus active:scale-(--kit-press-scale) disabled:opacity-50 motion-reduce:transition-none"
        >
          <span className="font-kit-strong">{s.text}</span>
          {s.read ? <span className="text-kit-meta text-kit-ink-muted">{s.read}</span> : null}
        </button>
      ))}
    </div>
  )
}
