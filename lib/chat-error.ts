/**
 * useChat rejects with the raw response body as the message, so a route that
 * answers `{"error":"..."}` surfaces the braces and quotes to the user. Pull
 * the sentence back out.
 *
 * Everything here is defensive on purpose: this runs at the moment something
 * has already gone wrong, and an error handler that throws is the worst kind.
 */
export function readableChatError(error: Error | undefined): string {
  const raw = error?.message?.trim()

  if (!raw) {
    return "Quincy could not answer. Try again."
  }

  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === "object" && "error" in parsed) {
        const message = (parsed as { error: unknown }).error
        if (typeof message === "string" && message.trim()) {
          return message.trim()
        }
      }
    } catch {
      // Not JSON after all — fall through and show it as written.
    }
  }

  return raw
}
