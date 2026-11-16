import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Attachment01Icon, Cancel01Icon } from "@hugeicons/core-free-icons"

import { CONTROL_SURFACE, FOCUS_RING } from "./control-styles"

export type FileChipProps = Omit<
  React.ComponentPropsWithRef<"div">,
  "className" | "style" | "children"
> & {
  /** The file name, as uploaded: `walk-tuesday.m4a`. */
  name: string
  /** Mono and muted after the name: a duration or a size ("4:12", "2.1 MB"). */
  meta?: string
  /**
   * Shows a round × that removes the file. Named "Remove <name>" for
   * assistive tech. Omit it for a chip that only reports.
   */
  onRemove?: () => void
}

/** Split off the extension so a long name truncates in the middle, keeping `.m4a`. */
function splitName(name: string): [string, string] {
  const dot = name.lastIndexOf(".")
  if (dot <= 0 || name.length - dot > 6) return [name, ""]
  return [name.slice(0, dot), name.slice(dot)]
}

/**
 * Raw material the person handed over: `walk-tuesday.m4a · 4:12`. A small
 * white control (radius chip, 6px) with the name in mono, so it reads as a
 * file, never as a title. The name truncates before the extension.
 */
export function FileChip({ name, meta, onRemove, ...props }: FileChipProps) {
  const [base, ext] = splitName(name)
  return (
    <div
      {...props}
      data-slot="kit-file-chip"
      title={name}
      className={`inline-flex h-8 max-w-full min-w-0 items-center gap-2 rounded-kit-chip pl-2.5 ${onRemove ? "pr-1" : "pr-2.5"} ${CONTROL_SURFACE}`}
    >
      <HugeiconsIcon
        icon={Attachment01Icon}
        size={14}
        strokeWidth={2}
        aria-hidden
        className="shrink-0 text-kit-ink-muted"
      />
      <span className="flex min-w-0 font-kit-mono text-kit-mono text-kit-ink">
        <span className="truncate">{base}</span>
        <span className="shrink-0">{ext}</span>
      </span>
      {meta ? (
        <span className="shrink-0 font-kit-mono text-kit-mono text-kit-ink-muted tabular-nums">
          {meta}
        </span>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className={
            `relative grid size-6 shrink-0 place-items-center rounded-full text-kit-ink-muted ${FOCUS_RING} ` +
            "transition-[background-color,color] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none " +
            "hover:bg-kit-control-hover hover:text-kit-ink " +
            "pointer-coarse:after:absolute pointer-coarse:after:top-1/2 pointer-coarse:after:left-1/2 pointer-coarse:after:size-11 pointer-coarse:after:-translate-1/2"
          }
        >
          <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2.5} aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
