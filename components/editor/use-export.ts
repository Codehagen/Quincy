"use client"

import * as React from "react"

import { durationInFrames } from "@/lib/editor/frames"
import type { Scene } from "@/lib/editor/types"

import { EditorComposition, type CompositionMedia } from "./composition"

/**
 * Export, as the same composition the preview draws.
 *
 * This is the rule types.ts has stated since the first commit finally being
 * true in both directions: **preview and export consume the same document
 * through the same compositor.** `@remotion/web-renderer` renders the exact
 * React tree `<Player>` is showing, frame by frame, through WebCodecs. There is
 * no second renderer to drift from the first — the failure every editor that
 * grew a separate export path eventually ships, where the file does not match
 * what the user approved.
 *
 * It runs in the browser. No queue, no worker, no upload of the source and
 * download of the result: the proxy is already loaded, the composition is
 * already mounted, and the encoder is in the tab. For the length of cut this
 * product makes that is the right trade — a two minute vertical cut encodes in
 * seconds, and the alternative is infrastructure that exists to do the same
 * work further away.
 *
 * The renderer is imported on demand. It carries an encoder and a muxer, and
 * loading that to open a project nobody exports from is bytes spent on a
 * maybe.
 */

export type ExportState =
  | { status: "idle" }
  | { status: "checking" }
  /** Rendering, 0..1. Remotion reports frames encoded against the total. */
  | { status: "rendering"; progress: number }
  | { status: "done"; filename: string }
  | { status: "unsupported"; reasons: string[] }
  | { status: "error"; message: string }

export function useExport({
  scene,
  media,
  canvas,
  fps,
  durationUs,
  background,
  name,
}: {
  scene: Scene
  media: Record<string, CompositionMedia>
  canvas: { width: number; height: number }
  fps: number
  durationUs: number
  background: string
  name: string
}) {
  const [state, setState] = React.useState<ExportState>({ status: "idle" })
  const abort = React.useRef<AbortController | null>(null)

  const cancel = React.useCallback(() => {
    abort.current?.abort()
    abort.current = null
    setState({ status: "idle" })
  }, [])

  const start = React.useCallback(async () => {
    if (abort.current) return

    const controller = new AbortController()
    abort.current = controller
    setState({ status: "checking" })

    try {
      const { canRenderMediaOnWeb, renderMediaOnWeb } =
        await import("@remotion/web-renderer")

      /**
       * Asked before rendering rather than discovered by failing.
       *
       * WebCodecs support is genuinely uneven — a browser without the encoder
       * this needs cannot be worked around, and finding out after ninety
       * seconds of rendering is the worst possible time to learn it.
       */
      const capability = await canRenderMediaOnWeb({
        container: "mp4",
        width: canvas.width,
        height: canvas.height,
      })

      if (!capability.canRender) {
        setState({
          status: "unsupported",
          // Only the errors. Warnings are things it will render anyway, and
          // listing them beside a refusal reads as more reasons it failed.
          reasons: capability.issues
            .filter((issue) => issue.severity === "error")
            .map((issue) => issue.message),
        })
        abort.current = null
        return
      }

      setState({ status: "rendering", progress: 0 })

      const result = await renderMediaOnWeb({
        composition: {
          id: "cut",
          component: EditorComposition,
          width: canvas.width,
          height: canvas.height,
          fps,
          durationInFrames: durationInFrames(durationUs, fps),
          // Required by the renderer's types even though inputProps supplies
          // the real values. The same object, so a mismatch is impossible.
          defaultProps: { scene, media, background },
        },
        inputProps: { scene, media, background },
        container: "mp4",
        signal: controller.signal,
        onProgress: ({ progress }) =>
          setState({ status: "rendering", progress }),
      })

      const blob = await result.getBlob()
      const filename = `${safeName(name)}.mp4`

      download(blob, filename)
      setState({ status: "done", filename })
    } catch (error) {
      // An abort is the user's decision, not a failure to report back to them.
      if (controller.signal.aborted) setState({ status: "idle" })
      else setState({ status: "error", message: describe(error) })
    } finally {
      abort.current = null
    }
  }, [scene, media, canvas, fps, durationUs, background, name])

  return { state, start, cancel }
}

/**
 * Hand the file to the browser's own download.
 *
 * The object URL is revoked on the next tick rather than immediately: revoking
 * before the click has been dispatched cancels the download, and revoking never
 * holds the whole encoded video in memory for the life of the tab.
 */
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")

  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()

  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * A project name that a filesystem will accept.
 *
 * Projects are named after the file they came from, and a recording called
 * "Sales / Q3.mov" would otherwise produce a path with a directory in it.
 */
function safeName(name: string): string {
  const cleaned = name
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim()

  return cleaned || "cut"
}

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, 200) || "The export failed."
}
