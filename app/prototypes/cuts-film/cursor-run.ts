// One cursor's run as a pure function of time: glide to a target, hover, drag-select it, press ⌫.
// The numbers are the editor's (plans/036, "The motion numbers"): glide 110–220 ms, press 90 ms, gaps 140 → 60 ms;
// the film slows only the first cut so a viewer can read it.
import { agentEase } from "./ease"
import { lerp, progress } from "./motion"

export type Rect = { x0: number; x1: number; top: number; height: number }

export type Beat = {
  /** The stretch to select, measured when the glide starts (earlier cuts have closed by then). */
  rect: Rect
  glideAt: number
  glideDur: number
  dragAt: number
  dragDur: number
  pressAt: number
  /** Press the Zoom control over the selection (a push-in) instead of ⌫. Desk px of the control's centre. */
  toolbar?: { x: number; y: number }
  /** A plain press on a control (no selection, no ⌫): the rect is the control. */
  tap?: boolean
}

export type CursorState = {
  x: number
  y: number
  /** 0 hidden … 1 shown. */
  shown: number
  /** The ⌫ cap on the tag. */
  cap: boolean
  /** The press: arrow scale and the ring, 0 → 1 across it; -1 when not pressing. */
  tap: number
  mark: { rect: Rect; shown: boolean; hover: boolean; sel: number; hot: number } | null
  toolbar: { x: number; y: number; shown: boolean } | null
}

export const PRESS = 90
const RING = 220
const HOT = 420

/** Where the cursor is and what it draws at `t`, given where it waits and its beats. */
export function cursorAt(t: number, beats: Beat[], { from, appearAt, parkAt }: { from: { x: number; y: number }; appearAt: number; parkAt: number }): CursorState {
  const shown = Math.min(1, progress(t, appearAt, 120)) * (1 - progress(t, parkAt, 160))
  let x = from.x
  let y = from.y
  let mark: CursorState["mark"] = null
  let cap = false
  let tap = -1
  let toolbar: CursorState["toolbar"] = null
  for (const b of beats) {
    if (t < b.glideAt) break
    const tx = b.rect.x0 + 3
    const ty = b.rect.top + b.rect.height / 2
    const g = agentEase(progress(t, b.glideAt, b.glideDur))
    const d = agentEase(progress(t, b.dragAt, b.dragDur))
    const gx = b.tap ? (b.rect.x0 + b.rect.x1) / 2 : tx
    x = b.tap ? lerp(x, gx, g) : lerp(lerp(x, tx, g), b.rect.x1 - 3, d)
    y = lerp(y, ty, g)
    if (b.toolbar) {
      const reach = agentEase(progress(t, b.dragAt + b.dragDur + 40, Math.max(80, b.pressAt - b.dragAt - b.dragDur - 60)))
      x = lerp(x, b.toolbar.x, reach)
      y = lerp(y, b.toolbar.y, reach)
      toolbar = t >= b.dragAt + b.dragDur && t < b.pressAt + 220 ? { ...b.toolbar, shown: true } : null
    }
    const sel = t >= b.dragAt ? d : 0
    const hot = t >= b.pressAt ? 1 - progress(t, b.pressAt + HOT * 0.25, HOT * 0.75) : 0
    // No hover wash: it is an opaque grey and would hide the clip's frames under the selection.
    mark = b.tap ? null : t < b.pressAt + HOT ? { rect: b.rect, shown: g > 0.6, hover: false, sel: t < b.pressAt + 60 ? sel : 0, hot } : null
    cap = !b.tap && !b.toolbar && t >= b.pressAt - 70 && t < b.pressAt + 150
    tap = t >= b.pressAt && t < b.pressAt + RING ? progress(t, b.pressAt, RING) : -1
  }
  return { x, y, shown, cap, tap, mark, toolbar }
}

/** When each beat's sounds go: the glide's start, the drag, the ⌫ press. */
export function beatCues(beats: Beat[], pan = 0, glide = "glide") {
  return beats.flatMap((b) => [
    { at: b.glideAt, sound: glide, pan },
    ...(b.tap ? [] : [{ at: b.dragAt, sound: "tick", pan }]),
    { at: b.pressAt, sound: b.tap || b.toolbar ? "click" : "del", pan },
  ])
}
