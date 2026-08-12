import type { FileUIPart } from "ai"

/**
 * The SDK ships convertFileListToFileUIParts, but it takes a FileList — and a
 * FileList is immutable, so a composer that lets you remove one attachment
 * cannot hold one. This does the same job for a plain File[].
 *
 * Files are inlined as data URLs, which means the whole file travels in the
 * request body. That is fine for a screenshot or a page of notes and wrong for
 * anything large: once there is real storage, upload first and send the hosted
 * URL instead. The `url` field takes either.
 */
export async function toFileUIParts(files: File[]): Promise<FileUIPart[]> {
  return Promise.all(
    files.map(async (file) => ({
      type: "file" as const,
      mediaType: file.type || "application/octet-stream",
      filename: file.name,
      url: await readAsDataUrl(file),
    }))
  )
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"))
    reader.onload = () => resolve(reader.result as string)
    reader.readAsDataURL(file)
  })
}
