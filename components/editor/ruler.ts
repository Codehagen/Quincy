/**
 * The ruler's marks: where they sit and what they say.
 *
 * Marks sit on a round step chosen from the span, not at even fractions of
 * it. Even fractions of a 1.3 s clip land at 0.22 s apart, and printed to
 * the second they all read "00:00". A round step (0.1, 0.2, 0.5, 1, 2, 5 s
 * and up) puts every mark on a number a person can read, and the label
 * carries exactly the precision the step needs: tenths under a second,
 * frames under a tenth, whole seconds above. No two labels are ever equal.
 */

const STEPS_US = [
  // Below a tenth the marks are frames (filled in from the fps).
  100_000, 200_000, 500_000,
  1_000_000, 2_000_000, 5_000_000, 10_000_000, 15_000_000, 30_000_000,
  60_000_000, 120_000_000, 300_000_000, 600_000_000,
] as const

export type RulerMark = { atUs: number; label: string }

/**
 * Marks across `spanUs`, aiming for at most `maxMarks` of them.
 *
 * `fps` decides the frame steps for a very short span (one frame, two,
 * five). The result always starts at zero and never runs past the span.
 */
export function rulerMarks(spanUs: number, maxMarks: number, fps = 30): RulerMark[] {
  if (!(spanUs > 0) || maxMarks < 2) return [{ atUs: 0, label: "00:00" }]

  const frameUs = 1_000_000 / Math.max(1, fps)
  const frameSteps = [1, 2, 5].map((n) => n * frameUs).filter((s) => s < 100_000)
  const steps = [...frameSteps, ...STEPS_US]
  const wanted = spanUs / (maxMarks - 1)
  const step = steps.find((s) => s >= wanted) ?? steps[steps.length - 1]

  const marks: RulerMark[] = []
  // A hair of slack so a span that is an exact multiple keeps its last mark.
  for (let i = 0; i * step <= spanUs + 1; i++) {
    const atUs = Math.round(i * step)
    marks.push({ atUs, label: formatMark(atUs, step, fps) })
  }
  return marks
}

function pad(n: number) {
  return String(n).padStart(2, "0")
}

/** "00:05" for whole seconds, "00:00.5" for tenths, "00:00:12" (timecode, frame last) for frames. */
export function formatMark(atUs: number, stepUs: number, fps = 30): string {
  const totalSeconds = Math.floor((atUs + 1) / 1_000_000)
  const clock = `${pad(Math.floor(totalSeconds / 60))}:${pad(totalSeconds % 60)}`
  if (stepUs >= 1_000_000) return clock
  if (stepUs >= 100_000) {
    const tenths = Math.round((atUs - totalSeconds * 1_000_000) / 100_000)
    return `${clock}.${Math.min(9, tenths)}`
  }
  const frame = Math.round(((atUs - totalSeconds * 1_000_000) / 1_000_000) * fps)
  return `${clock}:${pad(Math.min(Math.max(0, Math.round(fps) - 1), frame))}`
}
