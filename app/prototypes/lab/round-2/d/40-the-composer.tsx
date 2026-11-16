"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Attachment01Icon,
  Cancel01Icon,
  Mic01Icon,
  SentIcon,
  StopIcon,
} from "@hugeicons/core-free-icons"

import { ActionButton, Arrive, Avatar, Card, Mono, Stage, Text, u } from "../kit"
import { color, elevation, motion, radius } from "../tokens"

/**
 * 40 — The composer.
 *
 * Studio's input, which is the primary interface: everything else in Quincy is
 * a window onto what gets said here. Type, attach a real file, or record (no
 * microphone is opened; the take is simulated, with a ceiling). ⌘ or Ctrl +
 * Enter sends, and the hint reads the platform after mount so server and
 * client markup agree. Sending is what moves the thread; Quincy's reply only
 * arrives because you sent something.
 */

/** A forgotten record tap stops on its own. */
const MAX_TAKE_SECONDS = 45

type Clip = { id: number; name: string; meta: string }
type Message = { id: number; from: "me" | "quincy"; text: string; clips?: Clip[] }

const FIRST: Message = {
  id: 0,
  from: "quincy",
  text: "Morning. Wednesday 09:00 is open and I have nothing for it yet. What happened this week?",
}

function subscribeNothing() {
  return () => {}
}

/** "⌘" on Apple platforms, "Ctrl" everywhere else, and "Ctrl" on the server. */
function useModKey() {
  return React.useSyncExternalStore(
    subscribeNothing,
    () => {
      const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
      const p = nav.userAgentData?.platform ?? nav.platform ?? ""
      return /mac|iphone|ipad|ipod/i.test(p) ? "⌘" : "Ctrl"
    },
    () => "Ctrl",
  )
}

function clock(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

function bytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function replyTo(text: string, clips: Clip[]) {
  if (clips.length > 0) {
    return "Got it. I'll read it before you do and mark the one thing worth a post."
  }
  if (/\d/.test(text)) {
    return "There's a number in that, so there's a post. I'll draft it for Wednesday 09:00. It waits in Drafts until you say yes."
  }
  return "Good. Who noticed, and what changed after? Give me that and I'll draft it for Wednesday."
}

const css = `
.d40-thread {
  display: flex; flex-direction: column; justify-content: flex-end; gap: ${u(12)};
  height: ${u(132)}; overflow: hidden;
  mask-image: linear-gradient(to bottom, transparent, #000 ${u(28)});
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 ${u(28)});
}
.d40-msg { display: flex; gap: ${u(10)}; align-items: flex-start; }
.d40-msg > div { display: flex; flex-direction: column; gap: ${u(6)}; min-width: 0; padding-top: ${u(2)}; }

.d40-box {
  margin-top: ${u(14)};
  border-radius: ${u(radius.control + 2)};
  box-shadow: ${elevation.inset};
  transition-property: box-shadow;
  transition-duration: ${motion.state}ms;
  transition-timing-function: ${motion.easeOut};
}
.d40-box:focus-within { box-shadow: 0 0 0 1px ${color.ink}; }
.d40-input {
  display: block; box-sizing: border-box; width: 100%;
  min-height: ${u(46)}; max-height: ${u(96)};
  padding: ${u(12)} ${u(12)} ${u(4)};
  border: 0; outline: none; resize: none;
  background: transparent; color: ${color.ink};
  font: inherit; field-sizing: content;
}
.d40-input::placeholder { color: ${color.faint}; }

.d40-clips { display: flex; flex-wrap: wrap; gap: ${u(6)}; padding: ${u(4)} ${u(10)} 0; }
.d40-clip {
  display: inline-flex; align-items: center; gap: ${u(6)};
  height: ${u(24)}; padding: 0 ${u(4)} 0 ${u(8)};
  border-radius: ${u(radius.chip)};
  background: ${color.well};
}

.d40-bar { display: flex; align-items: center; gap: ${u(2)}; padding: ${u(6)} ${u(6)} ${u(6)} ${u(6)}; }
.d40-tool {
  position: relative; display: inline-flex; align-items: center; gap: ${u(6)};
  height: ${u(30)}; min-width: ${u(30)}; padding: 0 ${u(7)};
  border: 0; border-radius: ${u(radius.control)};
  background: transparent; color: ${color.muted};
  cursor: pointer;
  transition-property: background-color, color;
  transition-duration: ${motion.state}ms;
  transition-timing-function: ${motion.easeOut};
}
.d40-tool[aria-pressed="true"] { background: ${color.well}; color: ${color.ink}; }
.d40-tool-x { height: ${u(18)}; min-width: ${u(18)}; padding: 0; justify-content: center; border-radius: ${u(4)}; }
@media (hover: hover) {
  .d40-tool:hover { color: ${color.ink}; }
}
@media (pointer: coarse) {
  .d40-tool::after { content: ""; position: absolute; left: 50%; top: 50%; width: 44px; height: 44px; translate: -50% -50%; }
}
.d40-icon { width: ${u(16)}; height: ${u(16)}; flex: none; }
.d40-icon-s { width: ${u(12)}; height: ${u(12)}; }
.d40-hint { margin-left: auto; margin-right: ${u(8)}; }
.d40-file { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }

@media (prefers-reduced-motion: reduce) {
  .d40-box, .d40-tool { transition-duration: 0ms; }
}
`

/** Mounts hidden and opens on the next frame, so its arrival is a transition. */
function Arriving({ children }: { children: React.ReactNode }) {
  const [show, setShow] = React.useState(false)
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <Arrive show={show} from="below">
      {children}
    </Arrive>
  )
}

export default function TheComposer() {
  const mod = useModKey()
  const [messages, setMessages] = React.useState<Message[]>([FIRST])
  const [text, setText] = React.useState("")
  const [clips, setClips] = React.useState<Clip[]>([])
  const [recording, setRecording] = React.useState(false)
  const [secs, setSecs] = React.useState(0)
  const [thinking, setThinking] = React.useState(false)
  const nextId = React.useRef(1)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const reply = React.useRef<number>(0)

  React.useEffect(() => () => window.clearTimeout(reply.current), [])

  // The take. One tick a second, and a ceiling.
  React.useEffect(() => {
    if (!recording) return
    const t0 = performance.now()
    const id = window.setInterval(() => {
      const s = Math.floor((performance.now() - t0) / 1000)
      setSecs(s)
      if (s >= MAX_TAKE_SECONDS) stopTake(s)
    }, 250)
    return () => window.clearInterval(id)
  }, [recording])

  function stopTake(s: number) {
    setRecording(false)
    const n = nextId.current++
    setClips((c) => [...c, { id: n, name: `voice-note-${n}.m4a`, meta: clock(Math.max(1, s)) }])
  }

  const toggleRecord = () => {
    if (recording) {
      stopTake(secs)
    } else {
      setSecs(0)
      setRecording(true)
    }
  }

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    setClips((c) => [
      ...c,
      ...files.map((f) => ({ id: nextId.current++, name: f.name, meta: bytes(f.size) })),
    ])
    e.target.value = ""
  }

  const canSend = !recording && !thinking && (text.trim().length > 0 || clips.length > 0)

  const send = () => {
    if (!canSend) return
    const said = text.trim()
    const sent = clips
    setMessages((m) => [...m, { id: nextId.current++, from: "me", text: said, clips: sent }])
    setText("")
    setClips([])
    setThinking(true)
    reply.current = window.setTimeout(() => {
      setThinking(false)
      setMessages((m) => [
        ...m,
        { id: nextId.current++, from: "quincy", text: replyTo(said, sent) },
      ])
    }, 900)
  }

  return (
    <Stage
      lead="Tell it like you'd tell a colleague."
      rest="Type it, drop the file in, or say it out loud. Quincy finds the post."
    >
      <style href="lab-r2-d40" precedence="default">
        {css}
      </style>
      <Card>
        <div className="d40-thread" aria-live="polite">
          {messages.map((m, i) => {
            const body = (
              <div className="d40-msg">
                <Avatar initials={m.from === "me" ? "C" : "Q"} />
                <div>
                  {m.text ? (
                    <Text tone={m.from === "me" ? "ink" : "muted"}>{m.text}</Text>
                  ) : null}
                  {m.clips && m.clips.length > 0 ? (
                    <span style={{ display: "flex", flexWrap: "wrap", gap: u(10) }}>
                      {m.clips.map((c) => (
                        <Mono key={c.id}>
                          {c.name} · {c.meta}
                        </Mono>
                      ))}
                    </span>
                  ) : null}
                </div>
              </div>
            )
            return i === 0 ? (
              <React.Fragment key={m.id}>{body}</React.Fragment>
            ) : (
              <Arriving key={m.id}>{body}</Arriving>
            )
          })}
          {thinking ? (
            <div className="d40-msg">
              <Avatar initials="Q" />
              <div>
                <Text tone="faint">Reading…</Text>
              </div>
            </div>
          ) : null}
        </div>

        <form
          className="d40-box"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <textarea
            className="d40-input"
            rows={2}
            value={text}
            placeholder="I moved the build cache on Tuesday. Deploys went from 11 minutes to under 3."
            aria-label="Message Quincy"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                send()
              }
            }}
          />

          {clips.length > 0 ? (
            <div className="d40-clips">
              {clips.map((c) => (
                <span key={c.id} className="d40-clip">
                  <Mono tone="ink">{c.name}</Mono>
                  <Mono>{c.meta}</Mono>
                  <button
                    type="button"
                    className="d40-tool d40-tool-x"
                    aria-label={`Remove ${c.name}`}
                    onClick={() => setClips((all) => all.filter((x) => x.id !== c.id))}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="d40-icon-s" aria-hidden />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <div className="d40-bar">
            <input
              ref={fileRef}
              type="file"
              multiple
              tabIndex={-1}
              aria-hidden
              className="d40-file"
              onChange={onFiles}
            />
            <button
              type="button"
              className="d40-tool"
              aria-label="Attach a file"
              onClick={() => fileRef.current?.click()}
            >
              <HugeiconsIcon icon={Attachment01Icon} strokeWidth={1.8} className="d40-icon" aria-hidden />
            </button>
            <button
              type="button"
              className="d40-tool"
              aria-pressed={recording}
              aria-label={recording ? "Stop recording" : "Record a voice note"}
              onClick={toggleRecord}
            >
              <HugeiconsIcon
                icon={recording ? StopIcon : Mic01Icon}
                strokeWidth={1.8}
                className="d40-icon"
                aria-hidden
              />
              {recording ? <Mono tone="ink">{clock(secs)}</Mono> : null}
            </button>
            <span className="d40-hint">
              <Text size="small" tone="faint" as="span">
                {mod} Enter to send
              </Text>
            </span>
            <ActionButton type="submit" icon={SentIcon} disabled={!canSend}>
              Send
            </ActionButton>
          </div>
        </form>
      </Card>
    </Stage>
  )
}
