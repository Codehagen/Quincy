"use client"

import * as React from "react"

import { Button } from "@/components/kit"

import type { ExportState } from "./use-export"

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
 */
export function ExportButton({
  state,
  onStart,
  onCancel,
  disabled,
}: {
  state: ExportState
  onStart: () => void
  onCancel: () => void
  /** A run holds the document; exporting mid-edit would render a moving cut. */
  disabled?: boolean
}) {
  const busy = state.status === "checking" || state.status === "rendering"

  const label =
    state.status === "checking"
      ? "Checking…"
      : state.status === "rendering"
        ? `${Math.round(state.progress * 100)}%`
        : state.status === "done"
          ? "Exported"
          : "Export"

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

      {/* The editor's one action: an ink pill while it would start a
          render, the quiet control while pressing it cancels one. `reserve`
          holds the widest label so the header does not jog as the
          percentage counts. */}
      <Button
        variant={busy ? "quiet" : "action"}
        onClick={busy ? onCancel : onStart}
        disabled={disabled && !busy}
        reserve={["Checking… — cancel", "100% — cancel", "Exported"]}
        // While rendering the button is a cancel, and that has to be said
        // rather than inferred from a percentage.
        title={busy ? "Cancel the export" : undefined}
      >
        {busy ? `${label} — cancel` : label}
      </Button>
    </div>
  )
}
