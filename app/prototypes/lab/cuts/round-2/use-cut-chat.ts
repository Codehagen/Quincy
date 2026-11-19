"use client"

/*
 * One piece's conversation: useChat on a scripted transport, plus what the
 * editor reads off the stream. The lanes, the cursor and the margin are all
 * views of `messages`; nothing here keeps a second timeline.
 *
 * - The cut: every edit part in `output-available`, folded into a CutState.
 * - The aim: the newest edit part in `input-available` (the glide), else the
 *   newest landed one while the stream runs, else `park`.
 * - The press: the toolCallId of the newest landed part.
 *
 * Plays once when the piece is first on screen (lab rule), holds the end,
 * and replays only on Replay. Esc stops a running stream. Undo returns to
 * the checkpoint before the run; Redo puts the run back. `rewind` walks the
 * run's parts off one by one, so the cursor runs backwards over them.
 */

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import { lastAssistantMessageIsCompleteWithApprovalResponses } from "ai"

import { SEGMENTS, TAKE } from "../round-1/fixture"
import { type ActPart, cutsFallback, type CutsUIMessage, isAct, isEdit, type tightenChat } from "./chat"
import type { CutState } from "./ops"

export type CutChat = ReturnType<typeof useCutChat>

/**
 * Send the follow-up once an approval is answered, and only once. The stock
 * check keeps answering true when the reply continues the same message and
 * the approved tool never gets an output of its own (our plan_cut does not:
 * the edits that follow are its result), which resends the run forever.
 * So: the stock check, and nothing has arrived after the answered plan yet.
 */
function approvedAndUnanswered({ messages }: { messages: CutsUIMessage[] }) {
  if (!lastAssistantMessageIsCompleteWithApprovalResponses({ messages })) return false
  const last = messages.at(-1)
  if (!last || last.role !== "assistant") return false
  const i = last.parts.findLastIndex((p) => p.type === "tool-plan_cut")
  if (i < 0) return true
  return !last.parts.slice(i + 1).some((p) => p.type !== "step-start")
}

const strip = (t: string) => t.replace(/^[a-z]:/, "")

/** The take after these landed edits. `prefix` reads one variant's targets only. */
export function cutFrom(parts: readonly { type: string; input?: { target: string } }[], prefix = ""): CutState & { vertical: boolean } {
  const mine = parts.filter((p) => (p.input?.target ?? "").startsWith(prefix))
  const removed = new Set(
    mine
      .filter((p) => p.type === "tool-remove_silences" || p.type === "tool-delete_clip")
      .map((p) => strip(p.input!.target)),
  )
  const gone = SEGMENTS.filter((s) => removed.has(s.id)).reduce((t, s) => t + s.end - s.at, 0)
  const has = (tool: string) => mine.some((p) => p.type === `tool-${tool}`)
  return {
    removed,
    captions: has("add_captions"),
    zoom: has("punch_in"),
    lift: has("move_captions"),
    vertical: has("reframe"),
    seconds: Math.round((TAKE.seconds - gone) * 10) / 10,
  }
}

export function useCutChat(
  make: () => ReturnType<typeof tightenChat>,
  {
    prompt,
    autoplay = true,
    delayMs = 18,
    fallback = cutsFallback,
  }: { prompt?: string; autoplay?: boolean; delayMs?: number; fallback?: typeof cutsFallback } = {},
) {
  const [transport] = React.useState(() => make().transport({ delayMs, fallback }))
  const chat = useChat<CutsUIMessage>({
    transport,
    throttle: 30,
    sendAutomaticallyWhen: approvedAndUnanswered,
  })
  const { messages, status, sendMessage, setMessages, stop } = chat
  const busy = status === "submitted" || status === "streaming"

  /* --------------------------------------------------- reading the stream */

  const acts = messages.filter((m) => m.role === "assistant").flatMap((m) => m.parts.filter(isAct))
  const landed = acts.filter((p): p is Extract<ActPart, { state: "output-available" }> => p.state === "output-available")
  const [rewinding, setRewinding] = React.useState(false)
  const moving = busy || rewinding
  // A stopped stream leaves its last part without an output: the cursor parks.
  const working = busy ? [...acts].reverse().find((p) => p.state === "input-available") : undefined
  const last = landed.at(-1)
  const aim = working?.input.target ?? (moving ? (last?.input.target ?? null) : messages.length ? "park" : null)
  const pressKey = last?.toolCallId ?? null
  const hot = moving ? (last?.input.target ?? null) : null
  const cut = cutFrom(landed.filter(isEdit))

  /* ----------------------------------------------------------- controls */

  const root = React.useRef<HTMLDivElement | null>(null)
  const sendRef = React.useRef(sendMessage)
  React.useLayoutEffect(() => {
    sendRef.current = sendMessage
  })

  // A new message starts from here: an earlier undo's Redo no longer applies.
  const [stash, setStash] = React.useState<CutsUIMessage[] | null>(null)
  const send = React.useCallback((text: string) => {
    setStash(null)
    void sendRef.current({ text })
  }, [])

  const bind = React.useCallback(
    (el: HTMLDivElement | null) => {
      root.current = el
      if (!el || !autoplay || !prompt) return
      const io = new IntersectionObserver(
        ([entry]) => {
          if (!entry?.isIntersecting) return
          io.disconnect()
          void sendRef.current({ text: prompt })
        },
        { threshold: 0.5 },
      )
      io.observe(el)
      return () => io.disconnect()
    },
    [autoplay, prompt],
  )

  const replay = React.useCallback(() => {
    setStash(null)
    setMessages([])
    if (prompt) window.setTimeout(() => void sendRef.current({ text: prompt }), 0)
  }, [prompt, setMessages])

  // Esc stops a running stream. The cursor parks where it is.
  React.useEffect(() => {
    if (!busy) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void stop()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [busy, stop])

  /* --------------------------------------------- checkpoint: undo / redo */

  const runStart = messages.findLastIndex((m) => m.role === "user")

  const undo = React.useCallback(() => {
    if (runStart < 0) return
    setStash(messages)
    setMessages(messages.slice(0, runStart))
  }, [messages, runStart, setMessages])

  const redo = React.useCallback(() => {
    if (!stash) return
    setMessages(stash)
    setStash(null)
  }, [stash, setMessages])

  /** Undo that shows itself: the run's edit parts come off newest first. */
  const rewind = () => {
    if (runStart < 0) return
    const full = messages
    const msg = full.at(-1)
    if (!msg || msg.role !== "assistant") return
    setStash(full)
    setRewinding(true)
    // The receipt goes first, then each edit, newest first.
    const base = msg.parts.filter((p) => isAct(p))
    base.forEach((_, k) => {
      window.setTimeout(() => {
        setMessages([...full.slice(0, -1), { ...msg, parts: base.slice(0, base.length - 1 - k) }])
      }, 60 + k * 150)
    })
    window.setTimeout(
      () => {
        setMessages(full.slice(0, runStart))
        setRewinding(false)
      },
      60 + base.length * 150 + 220,
    )
  }

  return {
    ...chat,
    busy,
    root,
    bind,
    send,
    replay,
    acts,
    landed,
    working,
    aim,
    pressKey,
    hot,
    cut,
    undo,
    redo,
    rewind,
    rewinding,
    undone: stash !== null && !rewinding,
  }
}

/** For a variant: the aim and press of the edits whose targets carry `prefix`. */
export function readVariant(steps: readonly { target: string; done: boolean }[], streaming: boolean) {
  const next = steps.find((s) => !s.done)
  const done = steps.filter((s) => s.done)
  return {
    aim: next?.target ?? (streaming ? (done.at(-1)?.target ?? null) : "park"),
    pressKey: done.at(-1)?.target ?? null,
    hot: streaming ? (done.at(-1)?.target ?? null) : null,
    cut: cutFrom(
      done.map((s) => ({
        type: `tool-${/^.:(p\d|um)$/.test(s.target) ? (s.target.endsWith("um") ? "delete_clip" : "remove_silences") : s.target.endsWith("captions") ? "add_captions" : "punch_in"}`,
        input: { target: s.target },
      })),
    ),
  }
}
