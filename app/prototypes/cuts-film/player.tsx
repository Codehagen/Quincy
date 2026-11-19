"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Camera } from "./camera"
import { loadWave } from "./take"
import { VOICE, CUES, DURATION, FPS, SCENES, STAGE, STARTS, sceneAt, scenesAt } from "./storyboard"

// The film as a page. Preview: play, scrub, jump to a scene; `?t=12400` opens at a time.
// `?render=1` drops the controls and exposes window.__film for scripts/render.ts, which steps the clock
// one frame at a time and screenshots the stage.

declare global {
  interface Window {
    __film?: { duration: number; fps: number; cues: typeof CUES; voice: typeof VOICE; seek: (ms: number) => Promise<void> }
  }
}

function Stage({ t }: { t: number }) {
  return (
    <div data-film-stage className="relative isolate overflow-hidden bg-kit-ground text-kit-ink antialiased" style={{ width: STAGE.width, height: STAGE.height }}>
      {/* Product spinners spin on the film's clock: the stage kills their CSS animation. */}
      <style>{`[data-film-stage] .animate-spin{rotate:${((t * 0.36) % 360).toFixed(1)}deg}`}</style>
      <Camera t={t} />
      {scenesAt(t).map(({ scene, local }) => (
        <div key={scene.id} className="absolute inset-0">
          <scene.Component t={local} abs={t} duration={scene.duration} scene={scene} />
        </div>
      ))}
    </div>
  )
}

function clock(ms: number) {
  const s = ms / 1000
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`
}

export function Player({ start, render }: { start: number; render: boolean }) {
  const [t, setT] = useState(() => Math.min(DURATION, start))
  const [playing, setPlaying] = useState(false)
  const [scale, setScale] = useState(1)
  const [sound, setSound] = useState(true)
  // A fresh URL on every page load, so a reload after a new mix never plays a cached one.
  const [mixVersion] = useState(() => Date.now())
  // Named mixes (scripts/mix.ts --name) to compare in the film; "" is the current mix.
  const [mixes, setMixes] = useState<string[]>([])
  const [mix, setMix] = useState("")
  useEffect(() => {
    fetch(`/prototypes/cuts-mock/local/film-audio/mixes.json?v=${mixVersion}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((names: string[]) => setMixes(names))
      .catch(() => {})
  }, [mixVersion])
  const frame = useRef<HTMLDivElement>(null)
  const audio = useRef<HTMLAudioElement>(null)
  const now = useRef(t)
  useEffect(() => {
    now.current = t
  }, [t])

  useEffect(() => {
    window.__film = {
      duration: DURATION,
      fps: FPS,
      // Scene cues plus the hero's landings, in time order.
      cues: CUES,
      voice: VOICE,
      seek: (ms) =>
        new Promise((done) => {
          setT(ms)
          requestAnimationFrame(() =>
            requestAnimationFrame(async () => {
              await loadWave()
              await document.fonts.ready
              const images = [...document.querySelectorAll<HTMLImageElement>("[data-film-stage] img")]
              await Promise.all(images.map((img) => img.decode().catch(() => {})))
              const videos = [...document.querySelectorAll<HTMLVideoElement>("[data-film-stage] video")]
              await Promise.all(videos.map((v) => (v.seeking || v.readyState < 2 ? new Promise((r) => { v.addEventListener("seeked", r, { once: true }); v.addEventListener("loadeddata", r, { once: true }); setTimeout(r, 3000) }) : null)))
              done()
            })
          )
        }),
    }
  }, [])

  // Playback on real time; the film itself never reads the wall clock. With sound on, the mix
  // (scripts/mix.ts → public/film-audio) is the clock, so picture and sound can't drift apart.
  useEffect(() => {
    if (!playing) return
    const el = audio.current
    if (el && sound) {
      el.currentTime = now.current / 1000
      void el.play().catch(() => {})
    }
    let id = 0
    let prev = performance.now()
    const tick = (stamp: number) => {
      const dt = stamp - prev
      prev = stamp
      const heard = el && sound && !el.paused && el.readyState >= 2 ? el.currentTime * 1000 : null
      setT((x) => {
        const next = heard ?? x + dt
        if (next >= DURATION) {
          setPlaying(false)
          return DURATION
        }
        return next
      })
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(id)
      el?.pause()
    }
  }, [playing, sound])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== "range") return
      if (e.key === " ") {
        e.preventDefault()
        setPlaying((p) => !p)
      }
      const step = e.shiftKey ? 1000 : 1000 / FPS
      if (e.key === "ArrowRight") setT((x) => Math.min(DURATION, x + step))
      if (e.key === "ArrowLeft") setT((x) => Math.max(0, x - step))
      if (e.key === "k" || e.key === "K") setPlaying(false)
      if (e.key === "l" || e.key === "L") setPlaying(true)
      if (e.key === "j" || e.key === "J") {
        setPlaying(false)
        setT((x) => Math.max(0, x - 1000))
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useLayoutEffect(() => {
    const el = frame.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setScale(entry!.contentRect.width / STAGE.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [render])

  if (render) return <Stage t={t} />

  const { index, scene } = sceneAt(t)
  return (
    <main className="mx-auto flex max-w-[1280px] flex-col gap-4 p-6">
      <div ref={frame} className="relative w-full overflow-hidden rounded-xl shadow-(--film-shadow-card)" style={{ aspectRatio: `${STAGE.width} / ${STAGE.height}` }}>
        <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `scale(${scale})` }}>
          <Stage t={t} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (t >= DURATION) setT(0)
            setPlaying((p) => !p)
          }}
          className="h-10 w-20 rounded-md bg-foreground text-sm font-medium text-background transition-transform duration-150 ease-out active:scale-[0.96]"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          aria-pressed={sound}
          onClick={() => setSound((on) => !on)}
          className="h-10 rounded-md bg-muted px-3 text-sm font-medium transition-transform duration-150 ease-out active:scale-[0.96]"
        >
          {sound ? "Sound on" : "Sound off"}
        </button>
        {/* Effects and music, no speech, so no captions. */}
        <audio ref={audio} src={`/prototypes/cuts-mock/local/film-audio/${mix ? `mix-${mix}` : "mix"}.m4a?v=${mixVersion}`} preload="auto" />
        {mixes.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Voice
            <select
              value={mix}
              onChange={(e) => {
                setPlaying(false)
                setMix(e.target.value)
              }}
              className="h-10 rounded-md bg-muted px-2 text-sm text-foreground"
            >
              <option value="">Current</option>
              {mixes.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="w-36 font-mono text-sm text-muted-foreground tabular-nums">
          {clock(t)} · f{Math.round((t * FPS) / 1000)}
        </span>
        <input
          type="range"
          aria-label="Time"
          min={0}
          max={DURATION}
          step={1000 / FPS}
          value={t}
          onChange={(e) => {
            setPlaying(false)
            setT(Number(e.target.value))
          }}
          className="flex-1 accent-foreground"
        />
        <span className="w-20 text-right font-mono text-sm text-muted-foreground tabular-nums">{clock(DURATION)}</span>
      </div>

      <ol className="flex gap-1">
        {SCENES.map((s, i) => (
          <li key={s.id} style={{ flexGrow: s.duration }} className="basis-0">
            <button
              type="button"
              onClick={() => {
                setPlaying(false)
                setT(STARTS[i]!)
              }}
              className={[
                "h-10 w-full truncate rounded-md px-2 text-left font-mono text-xs transition-transform duration-150 ease-out active:scale-[0.96]",
                i === index ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
              ].join(" ")}
            >
              {String(i + 1).padStart(2, "0")} {s.eyebrow}
            </button>
          </li>
        ))}
      </ol>

      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">VO </span>
        {scene.vo}
      </p>
      <p className="text-xs text-muted-foreground">Space or L plays, K pauses, J steps back a second. Arrows step one frame, Shift+arrows one second. ?t=4200 opens at 4.2 s.</p>
    </main>
  )
}
