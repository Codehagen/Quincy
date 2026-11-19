"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Progress, Text, TextButton, TextLink } from "@/components/kit"
import {
  UploadError,
  uploadAndOpen,
  type UploadProgress,
} from "@/lib/editor/upload-client"

import { RecordTakePanel } from "./record-take-panel"

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
  // The paywall is a refusal with somewhere to go, unlike the others.
  const [paywalled, setPaywalled] = React.useState(false)
  const [dragging, setDragging] = React.useState(false)
  const [recording, setRecording] = React.useState(false)
  /**
   * A take recorded here, kept until it is safely uploaded. Unlike a dropped
   * file it has no copy on disk, so a failed upload must not be the end of
   * it: the error offers to try again or to save the take.
   */
  const [take, setTake] = React.useState<File | null>(null)

  const saveTake = React.useCallback(() => {
    if (!take) return
    const url = URL.createObjectURL(take)
    const link = window.document.createElement("a")
    link.href = url
    link.download = take.name
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }, [take])

  const busy = progress !== null && progress.phase !== "done"

  const start = React.useCallback(
    async (file: File) => {
      setError(null)
      setPaywalled(false)
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
        setPaywalled(failure instanceof UploadError && failure.status === 402)
        setError(
          failure instanceof Error ? failure.message : "The upload failed."
        )
      }
    },
    [onFileChosen, router]
  )

  if (recording && !busy) {
    return (
      <div className="rounded-kit-chip border border-kit-hairline p-kit-pad">
        <RecordTakePanel
          onCancel={() => setRecording(false)}
          onDone={(file) => {
            setTake(file)
            setRecording(false)
            void start(file)
          }}
        />
      </div>
    )
  }

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
        if (file) {
          setTake(null)
          void start(file)
        }
      }}
      // A dashed recess inside the Card, so the drop target reads as a place
      // to put something rather than another object. Nested radius: the
      // Card's pad leaves the chip radius.
      className={`rounded-kit-chip border border-dashed p-kit-pad text-center transition-colors duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none ${
        dragging ? "border-kit-ink-muted bg-kit-well" : "border-kit-hairline"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*,audio/*"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            setTake(null)
            void start(file)
          }
          // Cleared so choosing the same file twice fires a change event the
          // second time — otherwise a retry after a failure does nothing.
          event.target.value = ""
        }}
      />

      {busy && progress ? (
        <div className="mx-auto flex max-w-80 flex-col gap-kit-related text-left">
          {/* An indeterminate phase is a bar that only says "working": the
              step is real work with no measurable fraction, and a bar that
              resets between phases reads as progress lost. */}
          <Progress
            label={PHASE_LABEL[progress.phase]}
            value={
              progress.fraction === null
                ? null
                : Math.round(progress.fraction * 100)
            }
          />

          {progress.deduped ? (
            <Text variant="small" tone="muted">
              Already in your library. Nothing to upload.
            </Text>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-kit-related">
          <Text>
            Drop a recording, or{" "}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="relative font-kit-strong text-kit-ink underline decoration-kit-link-line underline-offset-4 outline-hidden hover:decoration-kit-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-focus focus-visible:outline-solid pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:top-1/2 pointer-coarse:after:h-11 pointer-coarse:after:-translate-y-1/2"
            >
              choose a file
            </button>
            , or{" "}
            <button
              type="button"
              onClick={() => setRecording(true)}
              className="relative font-kit-strong text-kit-ink underline decoration-kit-link-line underline-offset-4 outline-hidden hover:decoration-kit-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-focus focus-visible:outline-solid pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:top-1/2 pointer-coarse:after:h-11 pointer-coarse:after:-translate-y-1/2"
            >
              record a take
            </button>
          </Text>
          <Text variant="small" tone="muted">
            Anything ffmpeg reads. It is transcoded to an editing copy on the
            way in, so phone footage works.
          </Text>
        </div>
      )}

      {/* Every refusal is a plain sentence in ink: a limit reached (too
          long, enough for today, one at a time) is not a failure, and red is
          kept for destructive actions. The server writes the sentence. */}
      {error ? (
        <div className="mt-kit-related">
          <Text variant="small" role="alert">
            {error}
            {paywalled ? (
              <>
                {" "}
                <TextLink href="/settings?section=plan">See plans</TextLink>
              </>
            ) : null}
            {take ? (
              <>
                {" "}
                <TextButton onClick={() => void start(take)}>
                  Try again
                </TextButton>
                {" or "}
                <TextButton onClick={saveTake}>save the take</TextButton>.
              </>
            ) : null}
          </Text>
        </div>
      ) : null}
    </div>
  )
}
