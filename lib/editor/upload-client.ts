import { hashFile } from "./hash-file"

/**
 * The browser's side of an upload, as one function with a progress callback.
 *
 * Kept out of the component so the sequence is readable in one place and can be
 * tested without rendering anything. The order is the whole design:
 *
 *   hash → ask → (maybe) upload → ingest → project
 *
 * Hashing first is what makes a re-drop free. The server is asked about a file
 * it has never seen bytes from, and in the common case of a recording already
 * in the library it answers "already have it" and the upload never happens.
 */

export type UploadPhase =
  "hashing" | "requesting" | "uploading" | "processing" | "opening" | "done"

export type UploadProgress = {
  phase: UploadPhase
  /** 0..1 within the current phase, or null where there is nothing to measure. */
  fraction: number | null
  /** Present when the file was already in the library. */
  deduped?: boolean
}

export type UploadResult = {
  assetId: string
  projectId: string
  /** Steps that failed without failing the asset. Usually the transcript. */
  warnings: string[]
}

export class UploadError extends Error {
  constructor(
    message: string,
    readonly phase: UploadPhase
  ) {
    super(message)
    this.name = "UploadError"
  }
}

export async function uploadAndOpen(
  file: File,
  onProgress: (progress: UploadProgress) => void,
  signal?: AbortSignal
): Promise<UploadResult> {
  onProgress({ phase: "hashing", fraction: 0 })

  const { hash, sizeBytes } = await hashFile(file, (bytesRead) =>
    onProgress({
      phase: "hashing",
      fraction: file.size > 0 ? bytesRead / file.size : 1,
    })
  )

  onProgress({ phase: "requesting", fraction: null })

  const upload = await postJson<{
    assetId: string
    alreadyIngested: boolean
    uploadUrl?: string
  }>(
    "/api/editor/uploads",
    {
      filename: file.name,
      // Some browsers hand over an empty type for less common containers. The
      // server needs something in the video/audio family to sign a URL for, and
      // guessing from the extension beats refusing a file that will transcode
      // perfectly well — ffprobe is the real arbiter either way.
      mimeType: file.type || guessMimeType(file.name),
      sizeBytes,
      hash,
    },
    "requesting",
    signal
  )

  if (upload.alreadyIngested) {
    onProgress({ phase: "opening", fraction: null, deduped: true })
    const projectId = await createProject(upload.assetId, signal)
    onProgress({ phase: "done", fraction: 1, deduped: true })
    return { assetId: upload.assetId, projectId, warnings: [] }
  }

  if (!upload.uploadUrl) {
    throw new UploadError("The server issued no upload URL.", "requesting")
  }

  await putWithProgress(
    upload.uploadUrl,
    file,
    (fraction) => onProgress({ phase: "uploading", fraction }),
    signal
  )

  onProgress({ phase: "processing", fraction: null })

  const ingest = await postJson<{ warnings?: string[] }>(
    `/api/editor/assets/${upload.assetId}/ingest`,
    {},
    "processing",
    signal
  )

  onProgress({ phase: "opening", fraction: null })
  const projectId = await createProject(upload.assetId, signal)

  onProgress({ phase: "done", fraction: 1 })

  return {
    assetId: upload.assetId,
    projectId,
    warnings: ingest.warnings ?? [],
  }
}

async function createProject(
  assetId: string,
  signal?: AbortSignal
): Promise<string> {
  const project = await postJson<{ id: string }>(
    "/api/editor/projects",
    { assetId },
    "opening",
    signal
  )

  return project.id
}

/**
 * XHR rather than fetch, for the one thing fetch still cannot do: report how
 * much of a request body has gone out. `upload.onprogress` is the only way to
 * put a real number on a gigabyte, and a progress bar that sits at zero for
 * four minutes and then jumps to done is worse than no bar at all.
 */
function putWithProgress(
  url: string,
  file: File,
  onFraction: (fraction: number) => void,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()

    request.open("PUT", url)
    request.setRequestHeader("Content-Type", file.type || "video/mp4")

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onFraction(event.loaded / event.total)
    }

    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(
            new UploadError(
              `The upload was refused (${request.status}). ` +
                `If this is a browser on a new origin, the bucket's CORS policy may not list it.`,
              "uploading"
            )
          )

    // A network-level failure carries no detail anywhere — by design, since
    // exposing cross-origin errors would leak. CORS is by far the likeliest
    // cause, so the message says so rather than "upload failed".
    request.onerror = () =>
      reject(
        new UploadError(
          "The upload could not reach storage. This is usually the bucket's CORS policy.",
          "uploading"
        )
      )

    request.onabort = () =>
      reject(new UploadError("Upload cancelled.", "uploading"))

    signal?.addEventListener("abort", () => request.abort(), { once: true })

    request.send(file)
  })
}

async function postJson<T>(
  url: string,
  body: unknown,
  phase: UploadPhase,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    // The server's own sentence, which is written to be shown. Falling back to
    // the status only when there isn't one.
    const detail = await response
      .json()
      .then((payload: { error?: string }) => payload.error)
      .catch(() => null)

    throw new UploadError(
      detail ?? `Request failed (${response.status}).`,
      phase
    )
  }

  return (await response.json()) as T
}

/** Enough to get past the server's family check. ffprobe decides the truth. */
function guessMimeType(filename: string): string {
  const extension = filename.split(".").pop()?.toLowerCase() ?? ""

  const video: Record<string, string> = {
    mp4: "video/mp4",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
    webm: "video/webm",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
  }

  const audio: Record<string, string> = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    aac: "audio/aac",
    flac: "audio/flac",
  }

  return video[extension] ?? audio[extension] ?? "video/mp4"
}
