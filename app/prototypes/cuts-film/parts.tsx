import type { CSSProperties, ReactNode } from "react"
import { blur, easeIn, easeOut, easeOutExpo, lerp, progress, spring } from "./motion"
import { STEP_COUNT } from "./stage"
import type { Scene } from "./storyboard"

// The film's recurring motion: words that arrive one at a time, digits that roll, the headline that docks.

/** Words rise out of a blur one after another, on a soft spring. With `out`, they leave upwards the same way. */
export function Words({
  text,
  t,
  at,
  out,
  stagger = 32,
  className,
  render,
}: {
  text: string
  t: number
  at: number
  out?: number
  stagger?: number
  className?: string
  /** Swap a word for something richer (a logo), keeping its motion. */
  render?: (word: string) => ReactNode
}) {
  const words = text.split(" ")
  return (
    <span className={className}>
      {words.map((word, i) => {
        const local = t - at - i * stagger
        const p = spring(local, { duration: 480, bounce: 0.2 })
        const o = out === undefined ? 0 : easeIn(progress(t, out + i * 16, 220))
        return (
          <span
            key={i}
            className="inline-block whitespace-pre"
            style={{
              // Arrives in the accent colour and settles to the text colour.
              color: `color-mix(in oklab, var(--film-accent-text) ${((1 - progress(local, 120, 380)) * 100).toFixed(1)}%, currentColor)`,
              opacity: Math.min(1, Math.max(0, local / 140)) * (1 - o),
              transform: `translateY(${((1 - p) * 0.7 - o * 0.5).toFixed(3)}em)`,
              filter: blur((1 - Math.min(1, p)) * 7 + o * 6),
            }}
          >
            {render ? render(word) : word}
            {i < words.length - 1 ? " " : ""}
          </span>
        )
      })}
    </span>
  )
}

/**
 * Numbers move the way NumberFlow moves them (@number-flow/react), but on the film's clock:
 * every digit is its own column that spins forward, ~450ms ease-out; digits and commas the number grows into
 * slide in while their width opens. Each change adds its own eased step to a column's position, so a value
 * that arrives mid-roll carries on from where the column is instead of jumping. Never counts up from zero.
 */
export function Ticker({ values, times, t, dur = 450 }: { values: string[]; times: number[]; t: number; dur?: number }) {
  // A fixed prefix ("$") stands outside the columns, so it never drifts into a digit column as the number grows.
  const prefix = /^[^\d\s,]*/.exec(values[0]!)![0]
  const numbers = values.map((v) => v.slice(prefix.length))
  const width = Math.max(...numbers.map((v) => v.length))
  const padded = numbers.map((v) => v.padStart(width, " "))
  // Each column is a window 0.2em taller than the line on both sides (cancelled by negative margins, so the
  // baseline doesn't move), faded at its edges like NumberFlow's mask. Digits sit 0.5em apart in their strip,
  // so at rest the neighbours are outside the window, and mid-roll they fade instead of being cut.
  const step = "(1lh + 0.5em)"
  const column = {
    height: "calc(1lh + 0.4em)",
    margin: "-0.2em 0",
    maskImage: "linear-gradient(to bottom, transparent, black 0.25em, black calc(100% - 0.25em), transparent)",
  }
  return (
    <span className="inline-flex tabular-nums">
      {/* A zero-width character first, so the number takes its baseline from real text, not from a clipped
          column's bottom edge, and sits on the same line as the words around it. */}
      {"\u200b"}
      {prefix}
      {Array.from({ length: width }, (_, col) => {
        const chars = padded.map((v) => v[col]!)
        const digitColumn = chars.some((c) => /\d/.test(c))
        let shown = chars[0] === " " ? 0 : 1
        let pos = /\d/.test(chars[0]!) ? Number(chars[0]) : 0
        let digit = pos
        for (let k = 1; k < chars.length; k++) {
          const p = easeOut(progress(t, times[k - 1]!, dur))
          const was = chars[k - 1] === " " ? 0 : 1
          const now = chars[k] === " " ? 0 : 1
          shown += (now - was) * p
          if (/\d/.test(chars[k]!)) {
            const next = Number(chars[k])
            pos += ((next - digit + 10) % 10) * p
            digit = next
          }
        }
        const visible = Math.min(1, Math.max(0, shown))
        if (visible <= 0) return null
        const fixed = chars.find((c) => c !== " ")!
        return (
          <span
            key={col}
            className="relative inline-block overflow-hidden"
            style={{ ...column, width: digitColumn ? `${visible}ch` : `${visible * 0.3}em`, opacity: visible }}
          >
            {digitColumn ? (
              <span className="absolute inset-x-0 top-[0.2em] flex flex-col" style={{ transform: `translateY(calc(${(-(pos % 10)).toFixed(4)} * ${step}))` }}>
                {Array.from({ length: 11 }, (_, d) => (
                  <span key={d} className="block" style={{ height: `calc${step}` }}>
                    {d % 10}
                  </span>
                ))}
              </span>
            ) : (
              <span className="absolute top-[0.2em] left-0" style={{ transform: `translateY(${((1 - visible) * 0.6).toFixed(3)}em)` }}>
                {fixed}
              </span>
            )}
          </span>
        )
      })}
    </span>
  )
}

/** One change, `from` → `to` at `at`. */
export function Roll({ from, to, t, at, dur = 450 }: { from: string; to: string; t: number; at: number; dur?: number }) {
  return <Ticker values={[from, to]} times={[at]} t={t} dur={dur} />
}

/** A spring pop for small things that appear (chips, badges, avatars): from 0.8, never from nothing. */
export function pop(t: number, at: number, { bounce = 0.3, from = 0.8 } = {}): CSSProperties {
  if (t - at >= 900) return {} // exactly at rest (see swing)
  const p = spring(t - at, { duration: 400, bounce })
  return { opacity: Math.min(1, Math.max(0, (t - at) / 100)), transform: `scale(${lerp(from, 1, p)})` }
}

/**
 * The scene's push-through: the old scene rushes past the camera and clears quickly, the new one comes in from
 * slightly far a beat later, so the two never sit on top of each other as a double exposure.
 */
export function push(t: number, duration: number, { enter = true, exit = true, inDur = 450, outDur = 280 } = {}): CSSProperties {
  const i = enter ? easeOutExpo(progress(t, 60, inDur)) : 1
  const o = exit ? easeIn(progress(t, duration - outDur, outDur)) : 0
  return {
    opacity: Math.min(enter ? progress(t, 60, 200) : 1, Math.max(0, 1 - o * 1.8)),
    transform: `scale(${lerp(0.82, 1, i) * lerp(1, 1.45, o)})`,
    filter: blur((1 - i) * 8 + o * 10),
  }
}

const pad = (n: number) => String(n).padStart(2, "0")

/**
 * The scene's eyebrow: a raised pill (a shadow, not a border) that opens from its left edge,
 * then the label rises in. No step counter: the film carries no pagination.
 */
export function Eyebrow({ scene, t, at }: { scene: Scene; t: number; at: number }) {

  const open = spring(t - at - 110, { duration: 520, bounce: 0.15 })
  const step = scene.step
  return (
    <span className="relative mb-4 inline-flex h-7 items-center gap-2 py-1 pr-3 pl-3">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 origin-left rounded-full bg-kit-object shadow-(--film-shadow-card)"
        style={{ opacity: Math.min(1, Math.max(0, (t - at - 110) / 120)), transform: `scale(${lerp(0.55, 1, open)})`, filter: blur((1 - Math.min(1, open)) * 3) }}
      />
      {step !== undefined && (
        <span className="relative font-mono text-xs text-kit-ink-muted tabular-nums" style={{ opacity: Math.min(1, Math.max(0, (t - at - 180) / 140)) }}>
          <Roll from={pad(Math.max(1, step - 1))} to={pad(step)} t={t} at={at + 200} />
          <span className="text-kit-ink-muted/50"> / {pad(STEP_COUNT)}</span>
        </span>
      )}
      <span className="relative text-sm font-medium">
        <Words text={scene.eyebrow} t={t} at={at + 230} stagger={24} />
      </span>
    </span>
  )
}

/**
 * The eyebrow chip and two-tone headline in the left column. With `dock`, the lead line first plays big in the
 * middle of the frame, then glides into the column at `dock` ms.
 */
export function Caption({ scene, t, at = 200, dock, softAt }: { scene: Scene; t: number; at?: number; dock?: number; softAt?: number }) {
  const [lead, soft] = scene.caption
  const k = dock === undefined ? 0 : 1 - easeOutExpo(progress(t, dock, 600))
  const leadDone = at + lead.split(" ").length * 32 + 180
  return (
    <div className="absolute top-1/2 left-24 w-[400px] -translate-y-1/2">
      <Eyebrow scene={scene} t={t} at={dock === undefined ? at - 60 : dock + 300} />
      <h2 className="text-[2rem] leading-[1.08] font-semibold tracking-[-0.035em] text-balance">
        <span
          className="inline-block origin-center"
          // Centred in the frame at k = 1: translate percentages are of the line's own width.
          style={{ transform: `translateX(calc(${k} * (544px - 50%))) translateY(${k * 20}px) scale(${lerp(1, 1.7, k)})` }}
        >
          <Words text={lead} t={t} at={at} />
        </span>{" "}
        <Words text={soft} t={t} at={softAt ?? leadDone} className="text-kit-ink-muted" />
      </h2>
    </div>
  )
}

/** The scene's text leaves first and fast, before the picture does. */
export function captionExit(t: number, duration: number): CSSProperties {
  const o = easeIn(progress(t, duration - 420, 200))
  return { opacity: 1 - o, transform: `translateY(${-18 * o}px)`, filter: blur(o * 6) }
}

/** Typed text, letter by letter: each drops in slightly rotated and soft, in the accent colour, then settles. */
export function Typed({ text, times, t }: { text: string; times: number[]; t: number }) {
  return (
    <>
      {[...text].map((ch, i) => {
        const at = times[i]!
        if (t < at) return null
        const p = spring(t - at, { duration: 320, bounce: 0.3 })
        const settle = progress(t, at + 60, 260)
        return (
          <span
            key={i}
            className="inline-block whitespace-pre"
            style={{
              transform: `translateY(${((1 - p) * -0.45).toFixed(3)}em) rotate(${((1 - p) * -14).toFixed(2)}deg)`,
              filter: blur((1 - Math.min(1, p)) * 3),
              color: `color-mix(in oklab, var(--film-accent-text) ${((1 - settle) * 100).toFixed(1)}%, currentColor)`,
            }}
          >
            {ch}
          </span>
        )
      })}
    </>
  )
}

/** A row that swings in: from below, tilted a few degrees, landing on a spring (overshoot ≤ 0.3). */
export function swing(t: number, at: number, { tilt = -5, y = 18, bounce = 0.28 } = {}): CSSProperties {
  // At rest, exactly at rest. A spring only approaches its target, and a transform left at translateY(0.01px)
  // makes the browser re-rasterise text a little differently every frame: it shimmers, worst on rotated cards.
  if (t - at >= 1000) return {}
  const p = spring(t - at, { duration: 520, bounce })
  return {
    opacity: Math.min(1, Math.max(0, (t - at) / 120)),
    transform: `translateY(${lerp(y, 0, p).toFixed(2)}px) rotate(${lerp(tilt, 0, p).toFixed(2)}deg)`,
    filter: blur((1 - Math.min(1, p)) * 3),
  }
}

/** A live value that steps through `values` at `times`. */
export function Steps({ values, times, t, dur = 450 }: { values: string[]; times: number[]; t: number; dur?: number }) {
  return <Ticker values={values} times={times} t={t} dur={dur} />
}

/**
 * A text caret with no width of its own, so it never pushes the text around it. A plain inline span (not
 * inline-block, which is a place the line may break) anchors it, so it stays on the line of the letter it follows.
 */
function Caret() {
  return (
    <span aria-hidden className="relative">
      <span className="absolute bottom-[-0.2em] -left-px h-[1.05em] w-px bg-foreground" />
    </span>
  )
}

/**
 * Plain typing for running text: each letter appears where the caret was, in the accent colour, and settles to
 * the text colour. No drop, no rotation, no blur: across whole sentences those read as noise, not as writing.
 */
export function Typing({ text, times, t, caret = false }: { text: string; times: number[]; t: number; caret?: boolean }) {
  // The whole text is laid out from the first frame, untyped letters invisible, so the line breaks are fixed before
  // anything is typed. Adding letters to a wrapping paragraph (text-pretty especially) re-breaks its lines on every
  // letter and words jump between lines: the flicker.
  const typed = times.filter((at) => at <= t).length
  return (
    <>
      {[...text].map((ch, i) => {
        const at = times[i]!
        const settle = progress(t, at + 40, 220)
        return (
          <span
            key={i}
            style={
              i >= typed
                ? { opacity: 0 }
                : settle < 1
                  ? { color: `color-mix(in oklab, var(--film-accent-text) ${((1 - settle) * 100).toFixed(1)}%, currentColor)` }
                  : undefined
            }
          >
            {/* The caret sits after the last typed letter with no width of its own, so it never pushes text. */}
            {caret && i === typed && <Caret />}
            {ch}
            {/* After the last letter, inside it, so the caret can't be wrapped onto a line of its own. */}
            {caret && typed === times.length && i === times.length - 1 && <Caret />}
          </span>
        )
      })}
    </>
  )
}
