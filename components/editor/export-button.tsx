"use client"

import * as React from "react"

import {
  Button,
  Popover,
  PopoverPanel,
  PopoverTrigger,
  Segmented,
} from "@/components/kit"

import {
  EXPORT_RESOLUTIONS,
  type ExportResolution,
  type ExportState,
} from "./use-export"

/** The files the cut can be exported as besides the video. */
export type ExportFile = "srt" | "vtt" | "chapters" | "edl" | "fcpxml"

/**
 * Export, and what it is doing.
 *
 * One control that changes what it says rather than a button plus a progress
 * bar plus a toast. A render is the longest thing this editor does and it
 * happens in the tab the user is looking at — putting the state anywhere other
 * than on the thing they pressed means watching two places.
 *
 * The percentage is real, from the encoder, and it is the only honest thing to
 * show: a spinner on a job that can take a minute says "wait" without saying
 * for how much longer, which is the difference between waiting and wondering
 * whether it has hung.
 *
 * Pressing it opens one place for everything that leaves the editor (plan
 * 042 phase E): the video at a size, the subtitles, the chapters, and the cut
 * as a list another editor opens. One dialog, so nobody hunts a menu for the
 * subtitle file.
 */
export function ExportButton({
  state,
  onStart,
  onCancel,
  onFile,
  files,
  disabled,
}: {
  state: ExportState
  onStart: (resolution: ExportResolution) => void
  onCancel: () => void
  /** Download one of the other files. */
  onFile?: (file: ExportFile) => void
  /** Which of the other files this cut has anything to put in. */
  files?: Partial<Record<ExportFile, boolean>>
  /** A run holds the document; exporting mid-edit would render a moving cut. */
  disabled?: boolean
}) {
  const busy = state.status === "checking" || state.status === "rendering"
  const [open, setOpen] = React.useState(false)
  const [resolution, setResolution] = React.useState<ExportResolution>("source")

  const label =
    state.status === "checking"
      ? "Checking…"
      : state.status === "rendering"
        ? `${Math.round(state.progress * 100)}%`
        : state.status === "done"
          ? "Exported"
          : "Export"

  const other: { file: ExportFile; label: string; hint: string }[] = [
    { file: "srt", label: "Subtitles (.srt)", hint: "For most video sites" },
    { file: "vtt", label: "Subtitles (.vtt)", hint: "For the web" },
    { file: "chapters", label: "Chapters (.txt)", hint: "Paste into a description" },
    { file: "edl", label: "Edit list (.edl)", hint: "The cut, for another editor" },
    { file: "fcpxml", label: "Edit list (.fcpxml)", hint: "The cut, with b-roll" },
  ]

  return (
    <div className="flex items-center gap-2">
      {/* Said beside the button, not inside it: a refusal that replaces the
          label leaves nothing to press once it is read. */}
      {state.status === "unsupported" ? (
        <span className="max-w-88 text-kit-small text-kit-danger" role="alert">
          This browser cannot encode video.{" "}
          {state.reasons[0] ?? "WebCodecs is unavailable."}
        </span>
      ) : null}

      {state.status === "error" ? (
        <span
          className="max-w-88 truncate text-kit-small text-kit-danger"
          role="alert"
        >
          {state.message}
        </span>
      ) : null}

      {busy ? (
        <Button
          variant="quiet"
          onClick={onCancel}
          reserve={["Checking… — cancel", "100% — cancel", "Exported"]}
          title="Cancel the export"
        >
          {`${label} — cancel`}
        </Button>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="action"
                disabled={disabled}
                reserve={["Checking… — cancel", "100% — cancel", "Exported"]}
              >
                {label}
              </Button>
            }
          />
          <PopoverPanel title="Export" side="bottom" align="end" width="sm">
            <div className="flex flex-col gap-2">
              <span className="text-kit-small text-kit-ink-muted">Video size</span>
              <Segmented<string>
                aria-label="Video size"
                options={EXPORT_RESOLUTIONS.map((option) => ({
                  value: String(option.value),
                  label: option.label,
                }))}
                value={String(resolution)}
                onValueChange={(value) =>
                  setResolution(
                    value === "source" ? "source" : (Number(value) as ExportResolution)
                  )
                }
              />
              <Button
                variant="action"
                width="full"
                onClick={() => {
                  setOpen(false)
                  onStart(resolution)
                }}
              >
                Export video
              </Button>
            </div>
            {onFile ? (
              <ul className="flex flex-col">
                {other.map((option) => (
                  <li key={option.file}>
                    <button
                      type="button"
                      disabled={!files?.[option.file]}
                      onClick={() => onFile(option.file)}
                      className="flex min-h-11 w-full flex-col items-start justify-center rounded-kit-control px-2 text-left outline-hidden transition-[background-color] duration-150 ease-out hover:bg-kit-row-hover focus-visible:outline-2 focus-visible:outline-kit-focus focus-visible:outline-solid disabled:opacity-50"
                    >
                      <span className="text-kit-body text-kit-ink">{option.label}</span>
                      <span className="text-kit-small text-kit-ink-muted">
                        {files?.[option.file] ? option.hint : "Nothing to put in it yet"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </PopoverPanel>
        </Popover>
      )}
    </div>
  )
}
