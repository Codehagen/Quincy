"use client"

import * as React from "react"

import { Button, Slider, Switch, Text, Textarea } from "@/components/kit"
import { cn } from "@/lib/utils"

import {
  levelOf,
  pickRecorderType,
  scrollPixelsPerSecond,
  SILENT_LEVEL,
  silentTooLong,
  takeFileName,
} from "./record-take"

/**
 * Record a take here, with the script in front of you.
 *
 * The take goes into the same upload as a dropped file, so everything after
 * the stop button (the editing copy, the waveform, the transcript, the
 * cleaned voice) is the path a recording already takes. Nothing leaves the
 * browser until the person stops and the upload starts.
 *
 * The script stays on this device (localStorage), because it is a draft the
 * person is reading from, not part of any cut.
 */

const SCRIPT_KEY = "quincy:cuts:prompter-script"

type Phase = "asking" | "ready" | "recording" | "denied" | "unsupported"

export function RecordTakePanel({
  onDone,
  onCancel,
}: {
  onDone: (file: File) => void
  onCancel: () => void
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const recorderRef = React.useRef<MediaRecorder | null>(null)
  const chunksRef = React.useRef<Blob[]>([])
  const prompterRef = React.useRef<HTMLDivElement | null>(null)

  const [phase, setPhase] = React.useState<Phase>("asking")
  const [level, setLevel] = React.useState(0)
  const [silent, setSilent] = React.useState(false)
  const [elapsedMs, setElapsedMs] = React.useState(0)

  const [script, setScript] = React.useState(() => {
    try {
      return window.localStorage.getItem(SCRIPT_KEY) ?? ""
    } catch {
      return ""
    }
  })
  const [pace, setPace] = React.useState(140)
  const [fontPx, setFontPx] = React.useState(32)
  const [mirror, setMirror] = React.useState(false)

  React.useEffect(() => {
    try {
      window.localStorage.setItem(SCRIPT_KEY, script)
    } catch {
      // Private window: the script lives for this visit only.
    }
  }, [script])

  // The camera and microphone, for as long as the panel is open.
  React.useEffect(() => {
    let live = true
    let audio: AudioContext | null = null
    let frame = 0

    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setPhase("unsupported")
      return
    }

    void navigator.mediaDevices
      .getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: { echoCancellation: true, noiseSuppression: false },
      })
      .then((stream) => {
        if (!live) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        setPhase("ready")

        // The level meter: a time-domain read a frame, kept as React state
        // only at the meter's own resolution.
        audio = new AudioContext()
        const analyser = audio.createAnalyser()
        analyser.fftSize = 1024
        audio.createMediaStreamSource(stream).connect(analyser)
        const samples = new Uint8Array(analyser.fftSize)
        const tick = () => {
          analyser.getByteTimeDomainData(samples)
          const next = Math.round(levelOf(samples) * 50) / 50
          setLevel((prev) => (prev === next ? prev : next))
          frame = requestAnimationFrame(tick)
        }
        tick()
      })
      .catch(() => {
        if (live) setPhase("denied")
      })

    return () => {
      live = false
      cancelAnimationFrame(frame)
      void audio?.close()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  // While recording: the clock, the silence warning and the prompter scroll.
  const quietSinceRef = React.useRef<number | null>(null)
  React.useEffect(() => {
    if (phase !== "recording") return
    const started = performance.now()
    let last = started
    let frame = 0
    const tick = (now: number) => {
      setElapsedMs(now - started)
      const prompter = prompterRef.current
      if (prompter) {
        prompter.scrollTop +=
          (scrollPixelsPerSecond(pace, fontPx) * (now - last)) / 1000
      }
      last = now
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [phase, pace, fontPx])

  React.useEffect(() => {
    if (phase !== "recording") {
      quietSinceRef.current = null
      setSilent(false)
      return
    }
    const now = performance.now()
    if (level > SILENT_LEVEL) quietSinceRef.current = null
    else quietSinceRef.current ??= now
    setSilent(silentTooLong(quietSinceRef.current, now))
  }, [level, phase])

  const start = React.useCallback(() => {
    const stream = streamRef.current
    if (!stream) return
    const type = pickRecorderType((candidate) =>
      MediaRecorder.isTypeSupported(candidate)
    )
    if (!type) {
      setPhase("unsupported")
      return
    }
    chunksRef.current = []
    const recorder = new MediaRecorder(stream, { mimeType: type })
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type })
      onDone(
        new File([blob], takeFileName(type, new Date()), {
          type: type.split(";")[0],
        })
      )
    }
    recorderRef.current = recorder
    if (prompterRef.current) prompterRef.current.scrollTop = 0
    recorder.start(1000)
    setPhase("recording")
  }, [onDone])

  const stop = React.useCallback(() => {
    recorderRef.current?.stop()
    recorderRef.current = null
    setPhase("ready")
  }, [])

  if (phase === "denied" || phase === "unsupported") {
    return (
      <div className="flex flex-col items-center gap-kit-related">
        <Text>
          {phase === "denied"
            ? "The camera or microphone was not allowed. Allow them in the browser's site settings, then try again."
            : "This browser cannot record video here. Record in another app and drop the file instead."}
        </Text>
        <Button onClick={onCancel}>Back</Button>
      </div>
    )
  }

  const seconds = Math.floor(elapsedMs / 1000)
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`

  return (
    <div className="flex flex-col gap-kit-related text-left">
      <div className="relative aspect-video overflow-hidden rounded-kit-chip bg-black">
        {/* The preview is mirrored, the way a front camera is expected to
            look; the recording is not, so text in shot reads correctly. */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="h-full w-full -scale-x-100 object-cover"
        />
        {script.trim() ? (
          <div
            ref={prompterRef}
            aria-label="Script"
            className={cn(
              "absolute inset-x-0 top-0 h-1/2 overflow-hidden bg-black/55 px-6 py-4 text-center text-white",
              "[mask-image:linear-gradient(to_bottom,black_70%,transparent)]",
              mirror && "-scale-x-100"
            )}
            style={{ fontSize: fontPx, lineHeight: 1.4 }}
          >
            {/* Room above and below, so the first line starts at the top and
                the last can scroll out of the way. */}
            <div className="pb-[50vh] whitespace-pre-wrap">{script}</div>
          </div>
        ) : null}
        <div className="absolute right-3 bottom-3 left-3 flex items-center gap-2">
          {phase === "recording" ? (
            <span className="rounded bg-black/60 px-2 py-0.5 text-kit-small text-white tabular-nums">
              ● {clock}
            </span>
          ) : null}
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/25"
            role="meter"
            aria-label="Microphone level"
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={level}
          >
            <div
              className="h-full bg-white transition-[width] duration-75 ease-out"
              style={{ width: `${Math.min(100, level * 300)}%` }}
            />
          </div>
        </div>
      </div>

      {silent ? (
        <Text variant="small" role="alert">
          The microphone is not hearing anything. Check that the right one is
          selected.
        </Text>
      ) : null}

      <Textarea
        value={script}
        onValueChange={setScript}
        placeholder="Paste a script to read from, or leave this empty."
        rows={3}
        shortcutHint={false}
        disabled={phase === "recording"}
      />

      <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        <label className="flex flex-col">
          <Text variant="small" tone="muted">
            Pace, {pace} words a minute
          </Text>
          <Slider
            aria-label="Pace"
            min={80}
            max={220}
            step={10}
            value={pace}
            onValueChange={setPace}
          />
        </label>
        <label className="flex flex-col">
          <Text variant="small" tone="muted">
            Text size, {fontPx}px
          </Text>
          <Slider
            aria-label="Text size"
            min={18}
            max={56}
            step={2}
            value={fontPx}
            onValueChange={setFontPx}
          />
        </label>
      </div>
      <Switch
        label="Mirror the script (for a teleprompter glass)"
        checked={mirror}
        onCheckedChange={setMirror}
      />

      <div className="flex items-center justify-end gap-2">
        <Button onClick={onCancel} disabled={phase === "recording"}>
          Cancel
        </Button>
        {phase === "recording" ? (
          <Button variant="action" onClick={stop}>
            Stop and use this take
          </Button>
        ) : (
          <Button variant="action" onClick={start} disabled={phase !== "ready"}>
            Record
          </Button>
        )}
      </div>
    </div>
  )
}
