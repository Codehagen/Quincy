"use client"

import * as React from "react"
import type { PlayerRef } from "@remotion/player"

import { framesFor, usForFrame } from "@/lib/editor/frames"
import { us, type Us } from "@/lib/editor/time"

/**
 * The playhead, on top of Remotion's player.
 *
 * This used to be a `<video>` element, a `requestVideoFrameCallback` loop, and
 * a conversion between timeline time and source time — because the element knew
 * nothing about the cut and had to be told, every frame, which part of the
 * recording it was supposed to be showing. All of that is gone. The composition
 * states which clip is which window of which source, and the player is
 * responsible for being on the right frame of it. The timeline-to-source
 * conversion that briefly lived in lib/editor/playback.ts went with the loop:
 * it existed to reconcile two clocks, and a compositor has one.
 *
 * What is left is a unit conversion and the one rule that has not changed:
 * **the playhead is the user's**. While playing, the player is the source of
 * truth and the timeline follows it. While seeking, the timeline is the source
 * of truth and the player follows. Mixing those produces the scrub-fight, where
 * a frame event arrives mid-drag and yanks the playhead back to wherever the
 * picture happens to be.
 *
 * Microseconds everywhere except the handful of lines that touch the player,
 * which counts frames. The conversion lives here so no component holds both.
 */

export type Player = {
  ref: React.RefObject<PlayerRef | null>
  playing: boolean
  /** The player is waiting on media. Seeks into unbuffered footage show this. */
  buffering: boolean
  error: string | null
  play: () => void
  pause: () => void
  toggle: () => void
  /** Move the playhead and the picture together. */
  seekTo: (timeUs: Us) => void
  /** Preview an instant without committing. Pass null to go back. */
  previewAt: (timeUs: Us | null) => void
  /**
   * The playhead, on demand. Event handlers read this at call time; nothing
   * should render from it directly — that is what `subscribePlayhead` and
   * `usePlayheadSelector` are for.
   */
  readPlayhead: () => Us
  /**
   * Every playhead movement — one call per frame while playing, one per seek
   * while not. This is deliberately not React state: a frame arrives 30–60
   * times a second, and a `setState` here re-rendered the Studio root, the
   * whole timeline and the transcript on every one of them. Subscribers that
   * genuinely move per frame (the needle, the clock) write the DOM directly;
   * everything else derives a coarse value through `usePlayheadSelector` and
   * re-renders only when that value changes.
   */
  subscribePlayhead: (listener: (atUs: Us) => void) => () => void
}

/**
 * A value derived from the playhead, at the value's own cadence.
 *
 * The selector runs on every frame, but state only moves when its result
 * does — the word under the playhead changes a few times a second, the clip
 * under it a few times a minute, and that is how often the caller re-renders.
 * Recomputed when `selector`'s identity changes, so pass one wrapped in
 * `useCallback` keyed on whatever it closes over.
 */
export function usePlayheadSelector<T>(
  player: Player,
  selector: (atUs: Us) => T
): T {
  const [value, setValue] = React.useState<T>(() =>
    selector(player.readPlayhead())
  )

  React.useEffect(() => {
    const apply = (atUs: Us) =>
      setValue((prev) => {
        const next = selector(atUs)
        return Object.is(prev, next) ? prev : next
      })

    // The document may have changed under an unmoved playhead — an agent run
    // deleting the active clip must clear it without waiting for a frame.
    apply(player.readPlayhead())
    return player.subscribePlayhead(apply)
  }, [player, selector])

  return value
}

export function usePlayer({
  fps,
  durationUs,
}: {
  fps: number
  durationUs: Us
}): Player {
  const ref = React.useRef<PlayerRef | null>(null)

  const [playing, setPlaying] = React.useState(false)
  /**
   * The playhead, readable without depending on it.
   *
   * `previewAt` needs to know where to put the picture back, and taking that
   * from state would rebuild the callback on every frame — which rebuilds the
   * effect that calls it, which seeks, which emits a frame, which rebuilds the
   * callback. That loop is not theoretical: it is "Maximum update depth
   * exceeded" the moment you press play.
   *
   * This ref and the listener set below are now the *only* home the playhead
   * has. It used to be mirrored into state on every frame, which made the
   * whole editor re-render at the frame rate — see `subscribePlayhead` on the
   * Player type for the shape that replaced it.
   */
  const playheadRef = React.useRef<Us>(us(0))
  const listenersRef = React.useRef(new Set<(atUs: Us) => void>())
  const [buffering, setBuffering] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  /**
   * Set while the pointer is scrubbing the lane.
   *
   * The player's own frame events must not write the playhead back during a
   * hover preview — the picture is being moved somewhere the playhead has not
   * agreed to go, and letting the event through would drag it along.
   */
  const previewing = React.useRef(false)

  React.useEffect(() => {
    const player = ref.current
    if (!player) return

    const onFrame = ({ detail }: { detail: { frame: number } }) => {
      if (previewing.current) return
      const at = us(usForFrame(detail.frame, fps))
      playheadRef.current = at
      for (const listener of listenersRef.current) listener(at)
    }

    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnded = () => setPlaying(false)
    const onWaiting = () => setBuffering(true)
    const onResume = () => setBuffering(false)
    const onError = ({ detail }: { detail: { error: Error } }) =>
      setError(detail.error.message)

    player.addEventListener("frameupdate", onFrame)
    player.addEventListener("play", onPlay)
    player.addEventListener("pause", onPause)
    player.addEventListener("ended", onEnded)
    player.addEventListener("waiting", onWaiting)
    player.addEventListener("resume", onResume)
    player.addEventListener("error", onError)

    return () => {
      player.removeEventListener("frameupdate", onFrame)
      player.removeEventListener("play", onPlay)
      player.removeEventListener("pause", onPause)
      player.removeEventListener("ended", onEnded)
      player.removeEventListener("waiting", onWaiting)
      player.removeEventListener("resume", onResume)
      player.removeEventListener("error", onError)
    }
  }, [fps])

  const play = React.useCallback(() => {
    setError(null)
    ref.current?.play()
  }, [])

  const pause = React.useCallback(() => ref.current?.pause(), [])

  const toggle = React.useCallback(() => {
    const player = ref.current
    if (!player) return
    if (player.isPlaying()) player.pause()
    else player.play()
  }, [])

  const seekTo = React.useCallback(
    (timeUs: Us) => {
      const clamped = us(Math.max(0, Math.min(timeUs, durationUs)))
      previewing.current = false
      playheadRef.current = clamped
      // Notified here as well as from frame events: while paused the player
      // may not emit for the seek, and the needle has to land where you put it.
      for (const listener of listenersRef.current) listener(clamped)
      ref.current?.seekTo(framesFor(clamped, fps))
    },
    [durationUs, fps]
  )

  const readPlayhead = React.useCallback(() => playheadRef.current, [])

  const subscribePlayhead = React.useCallback(
    (listener: (atUs: Us) => void) => {
      listenersRef.current.add(listener)
      return () => {
        listenersRef.current.delete(listener)
      }
    },
    []
  )

  const previewAt = React.useCallback(
    (timeUs: Us | null) => {
      const player = ref.current
      if (!player || player.isPlaying()) return

      if (timeUs === null) {
        // Nothing to put back if we were never previewing. Seeking anyway is
        // what turned an idle editor into a seek-per-render.
        if (!previewing.current) return
        previewing.current = false
        player.seekTo(framesFor(playheadRef.current, fps))
        return
      }

      previewing.current = true
      player.seekTo(framesFor(Math.max(0, Math.min(timeUs, durationUs)), fps))
    },
    [durationUs, fps]
  )

  /**
   * Memoised, because components take effect dependencies on it. A fresh object
   * every render makes every one of those effects run every render, and the
   * ones that seek turn that into a loop.
   */
  return React.useMemo(
    () => ({
      ref,
      playing,
      buffering,
      error,
      play,
      pause,
      toggle,
      seekTo,
      previewAt,
      readPlayhead,
      subscribePlayhead,
    }),
    [
      playing,
      buffering,
      error,
      play,
      pause,
      toggle,
      seekTo,
      previewAt,
      readPlayhead,
      subscribePlayhead,
    ]
  )
}
