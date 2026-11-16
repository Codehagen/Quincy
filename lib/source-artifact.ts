/**
 * The object Studio puts in the conversation when a source is opened.
 *
 * `read_source` used to return a prose blob the model quoted and the UI
 * collapsed to a tool marker. The Safari-style window in the transcript is
 * a view of this: title and a short excerpt on the card, the full `message`
 * still what the model sees.
 */

export type SourceArtifactOutput = {
  ok: true
  url: string | null
  title: string
  excerpt: string
  message: string
}

export type SourceArtifactFailure = {
  ok: false
  message: string
}

export type SourceArtifactResult = SourceArtifactOutput | SourceArtifactFailure

export function isSourceArtifactOutput(
  value: unknown
): value is SourceArtifactOutput {
  if (!value || typeof value !== "object") return false
  const row = value as Record<string, unknown>
  return (
    row.ok === true &&
    (row.url === null || typeof row.url === "string") &&
    typeof row.title === "string" &&
    typeof row.excerpt === "string" &&
    typeof row.message === "string"
  )
}

export function isSourceArtifactFailure(
  value: unknown
): value is SourceArtifactFailure {
  if (!value || typeof value !== "object") return false
  const row = value as Record<string, unknown>
  return row.ok === false && typeof row.message === "string"
}

/** How much of the page the Safari card shows. Contentport clips at 250. */
const EXCERPT_CHARS = 250

export function excerptOf(text: string, max = EXCERPT_CHARS): string {
  const trimmed = text.trim().replace(/\s+/g, " ")
  if (trimmed.length <= max) return trimmed
  const slice = trimmed.slice(0, max)
  const lastSpace = slice.lastIndexOf(" ")
  const cut = lastSpace > max * 0.7 ? slice.slice(0, lastSpace) : slice
  return `${cut.trim()}…`
}

export function hostnameOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const host = new URL(url).hostname
    return host || null
  } catch {
    return null
  }
}

export function looksLikeUrl(value: string | null | undefined): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

/**
 * Older transcripts stored `read_source` as a string. Recover enough of a
 * card from that prose so a refresh still shows the window, not a marker.
 */
export function sourceArtifactFromProse(text: string): SourceArtifactOutput | null {
  if (!text.trim()) return null
  if (!/^#\d+\s/.test(text) && !text.includes("Source id:") && !looksLikeUrl(text.split("\n")[0])) {
    return null
  }

  const lines = text.split("\n")
  const title = lines[0]?.trim() || "Source"
  const url = lines.find((line) => looksLikeUrl(line.trim()))?.trim() ?? null
  const bodyStart = lines.findIndex((line) => line.startsWith("In plain words:"))
  const body =
    bodyStart >= 0
      ? lines.slice(bodyStart + 1).join("\n")
      : lines.slice(1).join("\n")

  return {
    ok: true,
    url,
    title,
    excerpt: excerptOf(body || text),
    message: text,
  }
}
