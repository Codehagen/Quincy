"use client"

import * as React from "react"

import { Progress, Text } from "@/components/kit"
import { Friend } from "@/components/mascot/friend"
import type { UploadProgress } from "@/lib/editor/upload-client"

import { friendForPhase } from "./upload-friend"

/**
 * The friend while a recording comes in, and the words under it.
 *
 * A bare bar in a dashed box read as a form that had stalled; the friend
 * standing over it says Quincy is the one doing the work.
 */
export function UploadWorking({
  progress,
  label,
  size = "page",
}: {
  progress: UploadProgress
  label: string
  /** `page`: the large friend centred over the bar. `panel`: the friend beside it, for the library. */
  size?: "page" | "panel"
}) {
  const value =
    progress.fraction === null ? null : Math.round(progress.fraction * 100)
  const state = friendForPhase(progress.phase)

  if (size === "panel") {
    return (
      <div className="flex items-center gap-3">
        <Friend size={32} state={state} className="shrink-0 text-kit-ink" />
        <div className="min-w-0 flex-1">
          <Progress label={label} value={value} />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-80 flex-col items-center gap-kit-related py-kit-related">
      <Friend
        size={72}
        state={state}
        className="text-kit-ink"
        label="Quincy is preparing your recording"
      />
      <div className="w-full text-left">
        <Progress label={label} value={value} />
      </div>
      {progress.deduped ? (
        <Text variant="small" tone="muted">
          Already in your library. Nothing to upload.
        </Text>
      ) : null}
    </div>
  )
}
