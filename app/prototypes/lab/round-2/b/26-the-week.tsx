"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { DragDropVerticalIcon } from "@hugeicons/core-free-icons"

import { Mono, Stage, Text, u, useReducedMotion, Window } from "../kit"
import { color, elevation, MONO_STACK, motion, radius, type } from "../tokens"

/**
 * 26 — The week. The lineup page itself: five slots that stay put (their hour
 * and your own median for that hour), and the posts that sit in them. Drag a
 * post, or focus it and press Space then ↑ ↓, and the rest of the week makes
 * room. The slot keeps its number, so moving a post changes what you can
 * expect from it.
 */

const ROW = 42
const SLOTS = [
  { day: "Mon 16", time: "08:10", median: 1420 },
  { day: "Tue 17", time: "12:30", median: 1190 },
  { day: "Wed 18", time: "09:00", median: 1530 },
  { day: "Thu 19", time: "07:45", median: 1700 },
  { day: "Fri 20", time: "16:00", median: 860 },
] as const

type Id = "changelog" | "pricing" | "open" | "cache" | "hiring"

const POSTS: Record<Exclude<Id, "open">, { title: string; from: string }> = {
  changelog: { title: "The changelog got its own page", from: "PR" },
  pricing: { title: "The call that changed our pricing", from: "call" },
  cache: { title: "Deploys went from 11 min to 2:40", from: "voice note" },
  hiring: { title: "Why I stopped writing job posts", from: "voice note" },
}

const INITIAL: Id[] = ["changelog", "pricing", "open", "cache", "hiring"]

function move<T>(list: T[], from: number, to: number) {
  const next = list.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item!)
  return next
}

const fmt = (n: number) => n.toLocaleString("en-US")

export default function TheWeek() {
  const reduced = useReducedMotion()
  const layerRef = React.useRef<HTMLDivElement>(null)
  const [order, setOrder] = React.useState<Id[]>(INITIAL)
  const [drag, setDrag] = React.useState<{
    id: Id
    from: number
    y0: number
    dy: number
    unit: number
  } | null>(null)
  const [lifted, setLifted] = React.useState<Id | null>(null)
  const [moved, setMoved] = React.useState<Id | null>(null)

  const over = drag
    ? Math.max(0, Math.min(SLOTS.length - 1, Math.round(drag.from + drag.dy / ROW)))
    : null
  const shown = drag && over !== null ? move(order, drag.from, over) : order

  const commit = (next: Id[], id: Id) => {
    setOrder(next)
    if (next.indexOf(id) !== order.indexOf(id)) setMoved(id)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>, id: Id) => {
    const layer = layerRef.current
    if (!layer || e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const unit = layer.getBoundingClientRect().height / (ROW * SLOTS.length)
    setLifted(null)
    setDrag({ id, from: order.indexOf(id), y0: e.clientY, dy: 0, unit })
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return
    const max = (SLOTS.length - 1 - drag.from) * ROW + ROW * 0.4
    const min = -drag.from * ROW - ROW * 0.4
    const dy = Math.max(min, Math.min(max, (e.clientY - drag.y0) / drag.unit))
    setDrag({ ...drag, dy })
  }
  const onPointerUp = () => {
    if (!drag) return
    commit(shown, drag.id)
    setDrag(null)
  }

  const onKeyDown = (e: React.KeyboardEvent, id: Id) => {
    const i = order.indexOf(id)
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault()
      setLifted(lifted === id ? null : id)
    } else if (e.key === "Escape") {
      setLifted(null)
    } else if (lifted === id && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault()
      const to = i + (e.key === "ArrowUp" ? -1 : 1)
      if (to < 0 || to >= SLOTS.length) return
      commit(move(order, i, to), id)
    }
  }

  const movedSlot = moved ? SLOTS[order.indexOf(moved)] : null
  const openSlot = SLOTS[order.indexOf("open")]!

  return (
    <Stage
      accent="green"
      lead="Move a post and the week makes room."
      rest="The slot keeps its hour and your median there. The post takes them on."
    >
      <style>{css}</style>
      <Window address="hirequincy.com/lineup" width={500}>
        <div style={{ display: "flex", alignItems: "baseline", gap: u(8) }}>
          <Text as="span" weight="strong">
            Week 47
          </Text>
          <Text as="span" tone="muted">
            Nov 16 – 20 · X
          </Text>
          <span style={{ marginLeft: "auto" }}>
            <Mono tone="faint">your median</Mono>
          </span>
        </div>

        <div
          aria-live="polite"
          style={{
            marginTop: u(4),
            marginBottom: u(10),
            display: "flex",
            alignItems: "center",
            gap: u(6),
            minHeight: u(18),
          }}
        >
          {moved && movedSlot ? (
            <>
              <span
                aria-hidden
                style={{
                  width: u(6),
                  height: u(6),
                  borderRadius: "50%",
                  background: "var(--k2-accent)",
                  flex: "none",
                }}
              />
              <Text as="span" size="small" tone="muted">
                Moved to {movedSlot.day.slice(0, 3)} {movedSlot.time}. Your median there is{" "}
                {fmt(movedSlot.median)}, and {openSlot.day.slice(0, 3)} is open.
              </Text>
            </>
          ) : (
            <Text as="span" size="small" tone="muted">
              Drag a post to another slot. Or focus it, press Space, then ↑ ↓.
            </Text>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: `${u(92)} 1fr ${u(64)}`,
            columnGap: u(10),
          }}
        >
          {/* The slots: fixed. */}
          <div>
            {SLOTS.map((s, i) => (
              <div
                key={s.day}
                style={{
                  height: u(ROW),
                  display: "flex",
                  alignItems: "center",
                  gap: u(8),
                  borderTop: i ? `1px solid ${color.hairline}` : undefined,
                }}
              >
                <Text as="span" size="small" weight="strong">
                  {s.day.slice(0, 3)}
                </Text>
                <Mono>{s.time}</Mono>
              </div>
            ))}
          </div>

          {/* The posts: they move. */}
          <div
            ref={layerRef}
            role="list"
            aria-label="Posts this week, in slot order"
            style={{ position: "relative", height: u(ROW * SLOTS.length) }}
          >
            {SLOTS.map((_, i) =>
              i ? (
                <span
                  key={i}
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: u(ROW * i),
                    height: 1,
                    background: color.hairline,
                  }}
                />
              ) : null,
            )}
            {/* Stable DOM order: moving a node would drop its transition. */}
            {INITIAL.map((id) => {
              const at = shown.indexOf(id)
              const isDrag = drag?.id === id
              const y = isDrag ? drag.from * ROW + drag.dy : at * ROW
              const slot = SLOTS[at]!
              const style: React.CSSProperties = {
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                height: u(ROW),
                padding: `${u(4)} 0`,
                transform: `translateY(${u(y)})`,
                zIndex: isDrag || lifted === id ? 2 : 1,
                transitionDuration: isDrag || reduced ? "0ms" : `${motion.enter}ms`,
              }
              if (id === "open") {
                return (
                  <div key={id} role="listitem" className="r2b26-post" style={style}>
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        height: "100%",
                        paddingLeft: u(10),
                        borderRadius: u(radius.control),
                        outline: `1px dashed rgba(18, 18, 18, 0.18)`,
                        outlineOffset: -1,
                        color: color.faint,
                      }}
                    >
                      Open
                    </span>
                  </div>
                )
              }
              const post = POSTS[id]
              const up = lifted === id || isDrag
              return (
                <div key={id} role="listitem" className="r2b26-post" style={style}>
                  <button
                    type="button"
                    className="r2b26-chip"
                    data-up={up || undefined}
                    aria-label={`${post.title}, ${slot.day} ${slot.time}`}
                    aria-pressed={lifted === id}
                    aria-roledescription="movable post"
                    onPointerDown={(e) => onPointerDown(e, id)}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    onKeyDown={(e) => onKeyDown(e, id)}
                    onBlur={() => setLifted((l) => (l === id ? null : l))}
                  >
                    <HugeiconsIcon
                      icon={DragDropVerticalIcon}
                      strokeWidth={2}
                      aria-hidden
                      style={{ width: u(14), height: u(14), flex: "none", color: color.faint }}
                    />
                    <span
                      style={{ fontWeight: type.strongWeight, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                    >
                      {post.title}
                    </span>
                    <span style={{ color: color.faint, flex: "none", marginLeft: "auto" }}>
                      {post.from}
                    </span>
                    {moved === id && !drag ? (
                      <span
                        aria-hidden
                        style={{
                          width: u(6),
                          height: u(6),
                          borderRadius: "50%",
                          background: "var(--k2-accent)",
                          flex: "none",
                        }}
                      />
                    ) : null}
                  </button>
                </div>
              )
            })}
          </div>

          {/* Your median per slot: fixed, like the hour. */}
          <div>
            {SLOTS.map((s, i) => {
              const target = over === i && drag !== null
              return (
                <div
                  key={s.day}
                  style={{
                    height: u(ROW),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    borderTop: i ? `1px solid ${color.hairline}` : undefined,
                  }}
                >
                  <span
                    className="r2b26-median"
                    style={{ color: target ? "var(--k2-accent)" : color.muted }}
                  >
                    {fmt(s.median)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </Window>
    </Stage>
  )
}

const css = `
.r2b26-post {
  transition-property: transform;
  transition-timing-function: ${motion.easeOut};
}
.r2b26-chip {
  width: 100%; height: 100%;
  display: flex; align-items: center; gap: ${u(8)};
  padding: 0 ${u(10)} 0 ${u(8)};
  border: 0; border-radius: ${u(radius.control)};
  background: ${color.well};
  text-align: left; cursor: grab; touch-action: none;
  font-size: ${u(12.5)};
  transition-property: background-color, box-shadow;
  transition-duration: ${motion.state}ms;
  transition-timing-function: ${motion.easeOut};
}
.r2b26-chip[data-up] {
  background: ${color.surface};
  box-shadow: ${elevation.lifted};
  cursor: grabbing;
}
.r2b26-median {
  font-family: ${MONO_STACK}; font-size: ${u(type.mono.size)}; letter-spacing: 0;
  font-variant-numeric: tabular-nums;
  transition-property: color;
  transition-duration: ${motion.state}ms;
}
@media (prefers-reduced-motion: reduce) {
  .r2b26-chip, .r2b26-median { transition-duration: 0ms; }
}
`
