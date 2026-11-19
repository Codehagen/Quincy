"use client"

/*
 * The director: turns the run's `data-ops` stream into a person's gestures,
 * compressed (plans/036, phase A; the timeline is
 * app/prototypes/lab/cuts/round-4/BRIEF.md).
 *
 * **A press is an op landing.** Each `data-ops` part is one beat: it starts
 * the approach the moment it arrives (glide, the hover in the last 40 ms, the
 * drag-select for a cut), and its ops are handed to `onLand` at the press,
 * never before. Parts that arrive while the cursor is busy queue in order;
 * the gaps between presses shrink through the run.
 *
 * **Nothing per frame goes through React.** The cursor, the selection mark,
 * the Zoom toolbar and the ⌫ cap are DOM nodes the director writes to
 * directly (`translate`, data attributes the CSS keys on). React state moves
 * once per press: which beats have landed, for the margin's ticks.
 *
 * **Cancellation is a generation.** Stop, a new run and unmount bump it, and
 * every pending wait rejects, so nothing stacks. Stop lands every beat that
 * has already arrived at once, without the cursor: those ops are already in
 * the server's working copy and will be saved with the run, so the screen must
 * show them. A step whose ops never arrived is the margin's "skipped".
 *
 * **Reduced motion:** no cursor and no drag; beats land in order 60 ms apart,
 * each with an opacity-only highlight on its target.
 */

import * as React from "react"

import { useReducedMotion } from "@/components/kit"
import { targetKey, type EditOp, type OpTarget } from "@/lib/editor/ops"

import {
  beatTarget,
  dragMs,
  fitApproach,
  gapMs,
  glideMs,
  readTiming,
  TIMING,
  type Timing,
} from "./timing"

export type Beat = {
  /** Unique within the session. */
  id: string
  /** The cut this beat lands in (three cuts); absent for a run on the scene on screen. */
  sceneId?: string
  ops: EditOp[]
  target: OpTarget | null
  toolCallId?: string
  toolName?: string
}

export type BeatState = Beat & { landed: boolean }

type Box = { x0: number; x1: number; y: number; top: number; height: number; node: HTMLElement }

class Cancelled extends Error {}

/** How many extra stretches a grouped cut can light up at its press. */
export const ECHO_COUNT = 8

export function beatFromPart(
  id: string,
  data: { ops: EditOp[]; toolCallId?: string; toolName?: string; sceneId?: string }
): Beat {
  return {
    id,
    ops: data.ops,
    target: beatTarget(data.ops),
    toolCallId: data.toolCallId,
    toolName: data.toolName,
    sceneId: data.sceneId,
  }
}

/**
 * One cursor's place in a run. A run on the scene on screen has one lane;
 * three cuts have three, one per scene. Lanes differ only in these numbers,
 * so the engine has no idea how many there are.
 */
export type LaneConfig = {
  /** The scene id, or MAIN_LANE. */
  key: string
  /** The name tag: "Quincy", "Quincy · A", "B". */
  label: string
  /** The lead has the full tag and the ring; support cursors are smaller and fainter. */
  support: boolean
  /** How long after the run starts this cursor makes its first move. */
  delayMs: number
  /** Multiplies the run's pace, so cursors never move in lockstep. */
  paceFactor: number
}

export const MAIN_LANE = "main"

/**
 * Three cursors out of step (plans/036, phase D; lab piece 53): starts 0, 90
 * and 170 ms apart and slightly different paces. A lane past the third
 * keeps spreading the same way.
 */
export function cutLane(index: number, letter: string): LaneConfig {
  const delays = [0, 90, 170]
  const paces = [1, 1.08, 0.94]
  return {
    key: "",
    label: index === 0 ? `Quincy · ${letter}` : letter,
    support: index > 0,
    delayMs: delays[index] ?? 170 + (index - 2) * 70,
    paceFactor: paces[index] ?? 1 + (index % 2 === 0 ? -0.04 : 0.06),
  }
}

/**
 * The engine behind the hook: one instance per editor, created once. A class
 * rather than closures over refs so the timeline (its queue, its generation,
 * the cursor's position) is plain mutable state outside React's render, which
 * is where per-frame and per-press bookkeeping belongs.
 */
class CursorEngine {
  root: () => HTMLElement | null = () => null
  /** Where this cursor's targets are looked up: its scene's lanes, or the whole desk. */
  scope: () => HTMLElement | null = () => null
  spanUs: () => number = () => 0
  delayMs = 0
  paceFactor = 1
  onLand: (beat: Beat) => void = () => {}
  reduced = false

  /** The latest callbacks from the hook, read at use: the timeline outlives a render. */
  configure(options: {
    root: () => HTMLElement | null
    scope?: () => HTMLElement | null
    spanUs: () => number
    onLand: (beat: Beat) => void
    reduced: boolean
    setBeats: React.Dispatch<React.SetStateAction<BeatState[]>>
    setBusy: (busy: boolean) => void
    delayMs?: number
    paceFactor?: number
  }) {
    Object.assign(this, options)
  }

  setBeats: React.Dispatch<React.SetStateAction<BeatState[]>> = () => {}
  setBusy: (busy: boolean) => void = () => {}

  private cursor: HTMLDivElement | null = null
  private mark: HTMLDivElement | null = null
  private toolbar: HTMLDivElement | null = null
  private echoes: (HTMLDivElement | null)[] = []

  private gen = 0
  private queue: Beat[] = []
  private streaming = false
  private looping = false
  private pos: { x: number; y: number } | null = null
  private presses = 0
  private timing: Timing = TIMING
  private timers = new Set<number>()

  /* ------------------------------------------------------- the nodes */

  attachCursor = (node: HTMLDivElement | null) => {
    this.cursor = node
  }
  attachMark = (node: HTMLDivElement | null) => {
    this.mark = node
  }
  attachToolbar = (node: HTMLDivElement | null) => {
    this.toolbar = node
  }
  readonly echoAttachers = Array.from({ length: ECHO_COUNT }, (_, index) => (node: HTMLDivElement | null) => {
    this.echoes[index] = node
  })
  attachEcho = (index: number) => this.echoAttachers[index]

  /* ------------------------------------------------------ primitives */

  private wait(ms: number, g: number) {
    return new Promise<void>((resolve, reject) => {
      const id = window.setTimeout(() => {
        this.timers.delete(id)
        if (g === this.gen) resolve()
        else reject(new Cancelled())
      }, Math.max(0, ms))
      this.timers.add(id)
    })
  }

  private later(ms: number, fn: () => void) {
    const id = window.setTimeout(() => {
      this.timers.delete(id)
      fn()
    }, ms)
    this.timers.add(id)
  }

  /** Remove and re-add a data attribute so its keyframe plays again. */
  private retrigger(node: HTMLElement | null, attr: string) {
    if (!node) return
    node.removeAttribute(attr)
    void node.offsetWidth
    node.setAttribute(attr, "")
  }

  private move(p: { x: number; y: number }, ms: number) {
    const node = this.cursor
    if (!node) return
    if (!this.pos) {
      // First appearance: place without travel, then show.
      node.style.transitionDuration = "0ms"
      node.style.translate = `${p.x}px ${p.y}px`
      void node.offsetWidth
    }
    node.style.transitionDuration = `${this.pos ? ms : 0}ms`
    node.style.translate = `${p.x}px ${p.y}px`
    node.setAttribute("data-shown", "")
    node.removeAttribute("data-parked")
    this.pos = p
  }

  private glideTo(p: { x: number; y: number }) {
    const from = this.pos
    const ms = from ? glideMs(Math.hypot(p.x - from.x, p.y - from.y), this.timing) : 0
    this.move(p, ms)
    return ms
  }

  private placeMark(box: Pick<Box, "x0" | "x1" | "top" | "height">, node: HTMLElement | null = this.mark) {
    if (!node) return
    node.style.translate = `${box.x0}px ${box.top}px`
    node.style.width = `${Math.max(4, box.x1 - box.x0)}px`
    node.style.height = `${box.height}px`
  }

  private clearMark() {
    for (const attr of ["data-hover", "data-sel", "data-hot", "data-shown"]) this.mark?.removeAttribute(attr)
    this.toolbar?.removeAttribute("data-shown")
  }

  private park() {
    const node = this.cursor
    if (node && this.pos) {
      node.style.transitionDuration = ""
      node.style.translate = `${this.pos.x + 24}px ${this.pos.y}px`
      node.setAttribute("data-parked", "")
    }
    this.pos = null
    this.clearMark()
    this.setBusy(false)
  }

  /* ------------------------------------------------------- the desk */

  /** A target's place on the desk, in the root's own pixels. */
  private resolve(target: OpTarget): Box | null {
    const box = this.root()
    if (!box) return null
    const origin = box.getBoundingClientRect()
    const scope = this.scope() ?? box
    const q = (key: string) => scope.querySelector<HTMLElement>(`[data-target="${CSS.escape(key)}"]`)

    const fromRect = (node: HTMLElement): Box => {
      const r = node.getBoundingClientRect()
      return {
        x0: r.left - origin.left + 1,
        x1: r.right - origin.left - 1,
        y: r.top - origin.top + r.height / 2,
        top: r.top - origin.top,
        height: r.height,
        node,
      }
    }

    /** A stretch of scene time on a lane: the lane's width is the whole cut. */
    const onLane = (lane: HTMLElement, fromUs: number, toUs: number): Box => {
      this.bringIntoView(lane, fromUs, toUs)
      const r = lane.getBoundingClientRect()
      const span = Math.max(1, this.spanUs())
      const x = (us: number) => r.left - origin.left + (us / span) * r.width
      return {
        x0: x(fromUs),
        x1: Math.max(x(fromUs) + 4, x(toUs)),
        y: r.top - origin.top + r.height / 2,
        top: r.top - origin.top,
        height: r.height,
        node: lane,
      }
    }

    switch (target.kind) {
      case "range": {
        const lane = q(`track:${target.trackId}`)
        const first = target.spans[0]
        return lane && first ? onLane(lane, first.startUs, first.endUs) : null
      }
      case "element": {
        const node = q(targetKey(target))
        if (node && target.atUs !== undefined) {
          const lane = q(`track:${target.trackId}`)
          if (lane) {
            const at = onLane(lane, target.atUs, target.atUs)
            return { ...fromRect(node), x0: at.x0, x1: at.x0 + 2 }
          }
        }
        if (node) node.scrollIntoView({ block: "nearest", inline: "nearest" })
        return node ? fromRect(node) : null
      }
      case "effect": {
        const node = q(targetKey(target))
        return node ? fromRect(node) : null
      }
      case "track": {
        const lane = q(`track:${target.trackId}`)
        if (!lane) return null
        const b = fromRect(lane)
        // The part of the lane in view, near its start: where a hand would click.
        const view = lane.closest<HTMLElement>("[data-editor-keys]")?.getBoundingClientRect()
        const left = Math.max(b.x0, view ? view.left - origin.left : b.x0)
        return { ...b, x0: left + 24, x1: left + 24 }
      }
      case "control": {
        const node =
          q(targetKey(target)) ??
          (target.control === "captions" ? scope.querySelector<HTMLElement>('[data-lane-kind="caption"]') : null)
        return node ? fromRect(node) : null
      }
    }
  }

  /** Scroll a zoomed lane so a stretch is on screen before the cursor goes there. */
  private bringIntoView(lane: HTMLElement, fromUs: number, toUs: number) {
    const scroller = lane.closest<HTMLElement>("[data-editor-keys]")
    if (!scroller) return
    const width = lane.getBoundingClientRect().width
    const span = Math.max(1, this.spanUs())
    const x0 = (fromUs / span) * width
    const x1 = (toUs / span) * width
    const { scrollLeft, clientWidth } = scroller
    if (x0 < scrollLeft || x1 > scrollLeft + clientWidth) {
      scroller.scrollLeft = Math.max(0, x0 - clientWidth / 4)
    }
  }

  /** The other stretches of a grouped cut, lit together at the press. */
  private placeEchoes(target: OpTarget | null) {
    this.echoes.forEach((node) => node?.removeAttribute("data-hot"))
    if (!target || target.kind !== "range" || target.spans.length < 2) return
    const box = this.root()
    const lane = (this.scope() ?? box)?.querySelector<HTMLElement>(`[data-target="${CSS.escape(`track:${target.trackId}`)}"]`)
    if (!box || !lane) return
    const origin = box.getBoundingClientRect()
    const r = lane.getBoundingClientRect()
    const span = Math.max(1, this.spanUs())
    target.spans.slice(1, ECHO_COUNT + 1).forEach((s, index) => {
      const node = this.echoes[index]
      if (!node) return
      const x0 = r.left - origin.left + (s.startUs / span) * r.width
      const x1 = r.left - origin.left + (s.endUs / span) * r.width
      this.placeMark({ x0, x1, top: r.top - origin.top, height: r.height }, node)
      this.retrigger(node, "data-hot")
    })
  }

  /* ---------------------------------------------------- one gesture */

  private land(beat: Beat) {
    this.onLand(beat)
    this.setBeats((prev) => prev.map((b) => (b.id === beat.id ? { ...b, landed: true } : b)))
  }

  private async perform(beat: Beat, g: number) {
    const t = this.timing
    const target = beat.target
    const mark = this.mark
    const at = target ? this.resolve(target) : null

    if (this.reduced || !at || !target) {
      // The change lands; its target lights once, opacity only.
      if (at && mark) {
        this.placeMark(at)
        mark.setAttribute("data-shown", "")
        this.retrigger(mark, "data-hot")
      }
      this.placeEchoes(target)
      this.land(beat)
      return
    }

    const drags = target.action === "cut" || target.action === "zoom"
    const glide0 = this.pos ? glideMs(Math.hypot(at.x0 - this.pos.x, at.y - this.pos.y), t) : 0
    const drag0 = drags ? dragMs(at.x1 - at.x0, t) : 0
    const { glide, drag } = fitApproach(glide0, drag0, t)

    // The approach: glide to the left edge (or the middle), hover in its last 40 ms.
    if (mark) {
      mark.removeAttribute("data-sel")
      mark.removeAttribute("data-hot")
      mark.style.transitionDuration = "0ms"
      this.placeMark(at)
      mark.setAttribute("data-shown", "")
    }
    this.move(drags ? { x: at.x0, y: at.y } : { x: (at.x0 + at.x1) / 2, y: at.y }, glide)
    if (glide > 40) await this.wait(glide - 40, g)
    mark?.setAttribute("data-hover", "")
    await this.wait(Math.min(40, glide), g)

    if (drags && mark) {
      // The selection grows from the left edge with the cursor, same duration, same curve.
      mark.removeAttribute("data-hover")
      mark.style.transitionDuration = `${drag}ms`
      mark.setAttribute("data-sel", "")
      this.move({ x: at.x1, y: at.y }, drag)
      await this.wait(drag, g)
    }

    let pressed: HTMLElement | null = drags ? null : at.node
    if (target.action === "zoom" && this.toolbar) {
      const bar = this.toolbar
      bar.style.translate = `${at.x0}px ${Math.max(0, at.top - 36)}px`
      bar.setAttribute("data-shown", "")
      await this.wait(40, g)
      const button = bar.querySelector<HTMLElement>("[data-target]")
      const r = button?.getBoundingClientRect()
      const origin = this.root()?.getBoundingClientRect()
      if (button && r && origin) {
        const ms = Math.min(
          this.glideTo({ x: r.left - origin.left + r.width / 2, y: r.top - origin.top + r.height / 2 }),
          t.approachMaxMs
        )
        await this.wait(ms, g)
        pressed = button
      }
    }

    // The press: the arrow taps, the ring goes out, a cut shows ⌫.
    this.retrigger(this.cursor, "data-tap")
    if (target.action === "cut") this.retrigger(this.cursor, "data-cap")
    if (pressed) {
      // A real control takes its own pressed state, as it would for a pointer.
      const node = pressed
      node.setAttribute("data-agent-pressed", "")
      this.later(120, () => node.removeAttribute("data-agent-pressed"))
    }
    if (mark) {
      mark.removeAttribute("data-hover")
      mark.removeAttribute("data-sel")
      mark.style.transitionDuration = ""
      // A cut's stretch is gone with the press; the gap closing is its feedback.
      if (target.action !== "cut") this.retrigger(mark, "data-hot")
      else mark.removeAttribute("data-shown")
    }
    this.placeEchoes(target)
    this.land(beat)
    this.later(120, () => this.toolbar?.removeAttribute("data-shown"))
  }

  /* ----------------------------------------------------------- loop */

  private async loop(g: number) {
    this.looping = true
    this.setBusy(true)
    try {
      // Out of step with the other cursors from the first move.
      if (this.presses === 0 && this.delayMs > 0 && !this.reduced) await this.wait(this.delayMs, g)
      while (this.queue.length > 0) {
        const beat = this.queue.shift()!
        await this.perform(beat, g)
        this.presses++
        const gap = this.reduced
          ? this.timing.reducedGapMs
          : gapMs(this.presses - 1, this.queue.length, this.timing)
        await this.wait(gap, g)
      }
      if (!this.streaming) this.park()
    } catch (error) {
      if (!(error instanceof Cancelled)) throw error
    } finally {
      if (g === this.gen) this.looping = false
    }
  }

  cancel() {
    this.gen++
    this.looping = false
    for (const id of this.timers) window.clearTimeout(id)
    this.timers.clear()
  }

  /* ------------------------------------------------------------ API */

  begin() {
    this.streaming = true
    this.presses = 0
    const timing = readTiming(this.root())
    this.timing = { ...timing, pace: timing.pace * this.paceFactor }
    this.setBusy(true)
  }

  push(beat: Beat) {
    this.setBeats((prev) => [...prev, { ...beat, landed: false }])
    this.queue.push(beat)
    if (!this.looping) void this.loop(this.gen)
  }

  finish() {
    this.streaming = false
    if (!this.looping) this.park()
  }

  stop() {
    this.cancel()
    this.streaming = false
    const arrived = this.queue
    this.queue = []
    for (const beat of arrived) this.land(beat)
    this.park()
  }
}

/** What AgentCursor needs to draw one lane's cursor: its tag and the nodes the engine writes to. */
export type LaneView = {
  key: string
  label: string
  support: boolean
  attachMark: (node: HTMLDivElement | null) => void
  attachToolbar: (node: HTMLDivElement | null) => void
  attachCursor: (node: HTMLDivElement | null) => void
  attachEchoes: readonly ((node: HTMLDivElement | null) => void)[]
}

const MAIN: LaneConfig = { key: MAIN_LANE, label: "Quincy", support: false, delayMs: 0, paceFactor: 1 }

export function useDirector({
  root,
  spanUs,
  onLand,
  scopeOf,
}: {
  /** The editor root the cursors travel over; `position: relative`. */
  root: React.RefObject<HTMLElement | null>
  /** A scene's length now (the scene on screen when no id), for placing a stretch on a lane. */
  spanUs: (sceneId?: string) => number
  /** The press: apply this beat's ops to the document. */
  onLand: (beat: Beat) => void
  /** Where a scene's targets live on the desk; the whole desk when absent. */
  scopeOf?: (sceneId: string) => HTMLElement | null
}) {
  const reduced = useReducedMotion()
  const [beats, setBeats] = React.useState<BeatState[]>([])
  const [busyLanes, setBusyLanes] = React.useState<ReadonlySet<string>>(() => new Set())
  const [lanes, setLaneConfigs] = React.useState<LaneConfig[]>([MAIN])
  const [engines] = React.useState(() => new Map<string, CursorEngine>([[MAIN_LANE, new CursorEngine()]]))
  /** The run is open: a lane added mid-run starts streaming at once. */
  const open = React.useRef(false)

  const engineFor = React.useCallback(
    (key: string) => {
      let engine = engines.get(key)
      if (!engine) {
        engine = new CursorEngine()
        engines.set(key, engine)
      }
      return engine
    },
    [engines]
  )

  // The latest callbacks, read at use: the timeline outlives the render that started it.
  const latest = React.useRef({ root, spanUs, onLand, scopeOf, reduced })
  React.useEffect(() => {
    latest.current = { root, spanUs, onLand, scopeOf, reduced }
  })

  const configure = React.useCallback(
    (config: LaneConfig) => {
      const key = config.key
      const scene = key === MAIN_LANE ? undefined : key
      const engine = engineFor(key)
      const now = latest.current
      engine.configure({
        root: () => latest.current.root.current,
        scope: () => (scene && latest.current.scopeOf ? latest.current.scopeOf(scene) : null),
        spanUs: () => latest.current.spanUs(scene),
        onLand: (beat) => latest.current.onLand(beat),
        reduced: now.reduced,
        setBeats,
        delayMs: config.delayMs,
        paceFactor: config.paceFactor,
        setBusy: (busy) =>
          setBusyLanes((prev) => {
            if (prev.has(key) === busy) return prev
            const next = new Set(prev)
            if (busy) next.add(key)
            else next.delete(key)
            return next
          }),
      })
      return engine
    },
    [engineFor]
  )

  React.useEffect(() => {
    for (const config of lanes) configure(config)
  }, [lanes, configure, reduced])

  React.useEffect(() => () => engines.forEach((engine) => engine.cancel()), [engines])

  return React.useMemo(() => {
    /** Every engine there is, drawn or not: begin, finish and stop must reach them all. */
    const all = () => [...engines.values()]
    const views: LaneView[] = lanes.map((config) => {
      const engine = engineFor(config.key)
      return {
        key: config.key,
        label: config.label,
        support: config.support,
        attachMark: engine.attachMark,
        attachToolbar: engine.attachToolbar,
        attachCursor: engine.attachCursor,
        attachEchoes: engine.echoAttachers,
      }
    })
    return {
      beats,
      busy: busyLanes.size > 0,
      reduced,
      lanes: views,
      /**
       * The cursors for this run: one per scene being cut, in order, the first
       * leading. Called when a three-cuts run names its scenes; the main
       * lane stays for the single run.
       */
      setLanes: (configs: LaneConfig[]) => {
        // The last run's cuts are done: park their cursors and let them go,
        // so a lane that is no longer drawn can never hold the run busy.
        const keep = new Set([MAIN_LANE, ...configs.map((config) => config.key)])
        for (const [key, engine] of engines) {
          if (keep.has(key)) continue
          engine.stop()
          engines.delete(key)
        }
        for (const config of configs) {
          const engine = configure(config)
          if (open.current) engine.begin()
        }
        setLaneConfigs([MAIN, ...configs])
      },
      /** A run has started: the stream is open. */
      begin: () => {
        open.current = true
        all().forEach((engine) => engine.begin())
      },
      /** One `data-ops` part: it starts its approach now and lands at its press, in its scene's lane. */
      push: (beat: Beat) => {
        const key = beat.sceneId && engines.has(beat.sceneId) ? beat.sceneId : MAIN_LANE
        engineFor(key).push(beat)
      },
      /** The stream ended on its own: finish each queue, then park. */
      finish: () => {
        open.current = false
        all().forEach((engine) => engine.finish())
      },
      /**
       * Esc or Stop: cancel every wait, land what has arrived (it is already
       * in the run's working copy and will be saved), park.
       */
      stop: () => {
        open.current = false
        all().forEach((engine) => engine.stop())
      },
    }
  }, [beats, busyLanes, reduced, lanes, engineFor, engines, configure])
}

export type Director = ReturnType<typeof useDirector>
