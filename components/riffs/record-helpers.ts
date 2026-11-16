/**
 * The recorder's pure helpers, out of record-box.tsx so a test can import
 * them without loading the kit (whose fonts come from next/font).
 */

/** `m:ss`. Tabular figures at the call site so the timer does not jitter. */
export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

/**
 * Mean of a slice, not a sample of it.
 *
 * Pure, exported and tested. Sampling every nth reading draws a waveform of
 * whichever frames happened to land on the stride, which for a ten-minute take
 * is a picture of the sampling rather than of the speech. Loudness is a mean.
 */
export function downsampleLevels(source: number[], bars: number): number[] {
  if (bars <= 0) return []
  if (source.length === 0) return new Array<number>(bars).fill(0)

  const out: number[] = []
  const per = source.length / bars
  for (let i = 0; i < bars; i++) {
    const from = Math.floor(i * per)
    const to = Math.max(
      from + 1,
      Math.min(source.length, Math.floor((i + 1) * per))
    )
    let sum = 0
    for (let j = from; j < to; j++) sum += source[j] ?? 0
    out.push(sum / (to - from))
  }
  return out
}

/**
 * Why the microphone did not open, in a sentence that names the fix.
 *
 * Pure, exported and tested, because it is five branches of pure judgment
 * wrapped around no logic at all — the exact shape that rots silently. There
 * is no DOM test environment in this repo (vitest runs `environment: "node"`),
 * so the alternative to extracting this was not testing the decision at all.
 *
 * `cause` is `null` for the case where the API is simply absent, which is not
 * an exception anybody threw: on an insecure origin `navigator.mediaDevices`
 * is undefined, and the caller checks that before it ever calls getUserMedia.
 */
export function microphoneFailureMessage(
  cause: { name?: string } | null,
  isSecureContext: boolean
): string {
  if (!cause) {
    /**
     * Nothing threw — the API is not there.
     *
     * On a secure origin that means a browser without a media stack. On an
     * insecure one it means the origin, and the fix is the URL rather than
     * anything the user can do in this dialog. Worth separating because this
     * is the walk-and-talk feature: the phone is the primary device, and
     * `http://192.168.x.x:3000` is the ordinary way somebody reaches it.
     */
    return isSecureContext
      ? "This browser cannot record audio."
      : "Recording needs a secure connection. Open Quincy over https and try again."
  }

  switch (cause.name) {
    /**
     * They said no, or the browser remembers them saying no — and in that case
     * nothing this app does will bring the prompt back, so the sentence has to
     * point at the address bar rather than at a retry.
     */
    case "NotAllowedError":
      return "Quincy needs the microphone. Allow it in your browser’s address bar and try again."
    case "NotFoundError":
      return "No microphone found."
    /** The browser saying it has no media stack. Measured from headless
     *  Chromium, which is also how a stripped-down webview answers. */
    case "NotSupportedError":
      return "This browser cannot record audio."
    /** In use by something else, or the OS refused the device. */
    case "NotReadableError":
      return "Something else is using the microphone. Close it and try again."
    default:
      return "Could not open the microphone."
  }
}
