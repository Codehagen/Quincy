"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { uploadAndOpen, type UploadProgress } from "@/lib/editor/upload-client"

/**
 * Drop a recording here and end up in the editor.
 *
 * The phases are named out loud rather than collapsed into one spinner, because
 * they take genuinely different amounts of time and mean different things: a
 * long hash is the disk, a long upload is the network, a long processing step
 * is ffmpeg. A single bar for all three tells someone nothing about whether to
 * wait or to worry.
 */

const PHASE_LABEL: Record<UploadProgress["phase"], string> = {
  hashing: "Reading the file",
  requesting: "Getting somewhere to put it",
  uploading: "Uploading",
  processing: "Transcoding, reading the audio, transcribing",
  opening: "Opening the editor",
  done: "Ready",
}

export function UploadDrop({
  onFileChosen,
}: {
  /**
   * Handed the File before the upload starts, so the editor can play the local
   * bytes while the proxy is still being built.
   */
  onFileChosen?: (file: File) => void
}) {
  const router = useRouter()
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  const [progress, setProgress] = React.useState<UploadProgress | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [dragging, setDragging] = React.useState(false)

  const busy = progress !== null && progress.phase !== "done"

  const start = React.useCallback(
    async (file: File) => {
      setError(null)
      onFileChosen?.(file)

      try {
        const result = await uploadAndOpen(file, setProgress)

        if (result.warnings.length > 0) {
          // Not an error — the asset is editable. Worth saying because the
          // missing piece is almost always the transcript, and captions being
          // unavailable is otherwise a mystery inside the editor.
          console.warn("[ingest]", result.warnings.join("; "))
        }

        router.push(`/cuts/${result.projectId}`)
      } catch (failure) {
        setProgress(null)
        setError(
          failure instanceof Error ? failure.message : "The upload failed."
        )
      }
    },
    [onFileChosen, router]
  )

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        if (!busy) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        if (busy) return

        const file = event.dataTransfer.files[0]
        if (file) void start(file)
      }}
      className={`rounded-2xl border border-dashed p-10 text-center transition-colors ${
        dragging
          ? "border-foreground/40 bg-foreground/[0.03]"
          : "border-foreground/15"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*,audio/*"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void start(file)
          // Cleared so choosing the same file twice fires a change event the
          // second time — otherwise a retry after a failure does nothing.
          event.target.value = ""
        }}
      />

      {busy && progress ? (
        <div className="space-y-3">
          <p className="text-sm">{PHASE_LABEL[progress.phase]}</p>

          <div className="mx-auto h-1 w-64 overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full rounded-full bg-foreground/60 transition-[width] duration-150"
              style={{
                // An indeterminate phase gets a full bar rather than a jumping
                // one: the step is real work with no measurable fraction, and a
                // bar that resets between phases reads as progress lost.
                width:
                  progress.fraction === null
                    ? "100%"
                    : `${Math.round(progress.fraction * 100)}%`,
                opacity: progress.fraction === null ? 0.35 : 1,
              }}
            />
          </div>

          {progress.deduped ? (
            <p className="text-xs text-foreground/50">
              Already in your library — nothing to upload.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-foreground/70">
            Drop a recording, or
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="ml-1 underline underline-offset-4 hover:text-foreground"
            >
              choose a file
            </button>
          </p>
          <p className="text-xs text-foreground/40">
            Anything ffmpeg reads. It is transcoded to an editing copy on the
            way in, so phone footage works.
          </p>
        </div>
      )}

      {error ? (
        <p className="mt-4 text-xs text-red-500" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
