import type { CSSProperties } from "react"

// Motion for the promo film. Every value is a pure function of time (ms), so any frame renders the same way
// twice: the preview can scrub to it and the renderer can step through it one frame at a time.

function bezier(x1: number, y1: number, x2: number, y2: number) {
  const a = (p1: number, p2: number) => 1 - 3 * p2 + 3 * p1
  const b = (p1: number, p2: number) => 3 * p2 - 6 * p1
  const c = (p1: number) => 3 * p1
  const at = (s: number, p1: number, p2: number) => ((a(p1, p2) * s + b(p1, p2)) * s + c(p1)) * s
  const slope = (s: number, p1: number, p2: number) => 3 * a(p1, p2) * s * s + 2 * b(p1, p2) * s + c(p1)
  return (x: number) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let s = x
    for (let i = 0; i < 8; i++) {
      const d = slope(s, x1, x2)
      if (Math.abs(d) < 1e-6) break
      s -= (at(s, x1, x2) - x) / d
    }
    return at(s, y1, y2)
  }
}

/** `--ease-out-soft`, the brand's curve: entrances. */
export const easeOut = bezier(0.22, 1, 0.36, 1)
/** ease-out-expo: the hard, fast settle of a motion piece. Most moves in the film use this. */
export const easeOutExpo = bezier(0.19, 1, 0.22, 1)
/** Exits accelerate away. */
export const easeIn = bezier(0.55, 0, 1, 0.45)
/** Things already on screen that move: the camera. */
export const easeInOut = bezier(0.65, 0, 0.35, 1)

/** 0 before `at`, 1 after `at + dur`. */
export function progress(t: number, at: number, dur: number) {
  return Math.min(1, Math.max(0, (t - at) / dur))
}

export function lerp(from: number, to: number, p: number) {
  return from + (to - from) * p
}

/** Arrive from slightly below and slightly small, never from nothing. */
export function enter(t: number, at: number, { dur = 380, y = 16, scale = 0.97 } = {}): CSSProperties {
  const p = easeOutExpo(progress(t, at, dur))
  return { opacity: p, transform: `translateY(${lerp(y, 0, p)}px) scale(${lerp(scale, 1, p)})` }
}

/** The 150ms press a button gets on click (scale 0.96 and back). */
export function press(t: number, at: number): CSSProperties {
  const down = easeOut(progress(t, at, 80))
  const up = easeOut(progress(t, at + 120, 150))
  return { transform: `scale(${1 - 0.04 * (down - up)})` }
}

/** When each character of `text` lands, typed from `at`. Uneven like a person's hands, the same every run. */
export function typeTimes(text: string, at: number, ms = 55) {
  let clock = at
  return [...text].map((_, i) => (clock += ms + ((i * 37) % 5) * 9 - (text[i] === " " ? 15 : 0)))
}

/** The part of `text` typed by `t`. */
export function typed(text: string, times: number[], t: number) {
  return text.slice(0, times.filter((at) => at <= t).length)
}

/** A text caret that blinks while a field is active. */
export function caretOn(t: number) {
  return Math.floor(t / 530) % 2 === 0
}

/**
 * A spring by duration and bounce (Apple's model), sampled at `ms` after it starts. 0 → 1, overshooting a little
 * when `bounce` > 0. Promo motion only: product UI keeps bounce at 0.
 */
export function spring(ms: number, { duration = 700, bounce = 0 } = {}) {
  if (ms <= 0) return 0
  const s = ms / 1000
  const w = (2 * Math.PI) / (duration / 1000)
  const z = 1 - bounce
  if (z >= 1) return 1 - Math.exp(-w * s) * (1 + w * s)
  const wd = w * Math.sqrt(1 - z * z)
  return 1 - Math.exp(-z * w * s) * (Math.cos(wd * s) + ((z * w) / wd) * Math.sin(wd * s))
}

/** Out of focus into focus: the bridge between two states (kept well under 20px). */
export function blur(px: number) {
  return px > 0.05 ? `blur(${px.toFixed(2)}px)` : "none"
}

/**
 * When a spring first reaches its target, in ms: the moment of contact, where an impact sound belongs (not when
 * the spring has settled, which is a few hundred ms later and reads as late). A spring without bounce never
 * reaches 1, so contact is when it's 98% there.
 */
export function springContact({ duration = 700, bounce = 0 } = {}) {
  for (let ms = 0; ms <= duration * 2; ms += 2) if (spring(ms, { duration, bounce }) >= (bounce > 0 ? 1 : 0.98)) return ms
  return duration
}

/** When an ease-out-expo move of `dur` ms is visually there (97%). */
export function expoContact(dur: number) {
  for (let p = 0; p <= 1; p += 0.002) if (easeOutExpo(p) >= 0.97) return p * dur
  return dur
}
