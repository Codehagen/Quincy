"use client"

import * as React from "react"

import {
  BOX_SNAP_PX,
  FULL_FRAME,
  moveBox,
  resizeBox,
  type Handle,
  type SnapGuide,
} from "@/lib/editor/box"
import { MAX_TEXT_LENGTH } from "@/lib/editor/titles"
import type { Box, ImageElement, TextElement, VideoElement } from "@/lib/editor/types"

import { usePlayheadSelector, type Player } from "./use-player"

/**
 * Handles on the preview for the selected picture or text (plan 042, "UI
 * patterns to get right").
 *
 * A picture (b-roll, an image) gets a box: drag inside to move, a corner to
 * resize keeping its shape, an edge to stretch one side. It snaps to the
 * frame's edges and centre lines within 8 screen pixels, with a guide drawn
 * where it snapped; Shift turns snapping off. A text gets a box around where
 * it is drawn: drag to move it, double-click to change what it says in place.
 *
 * The drag lives here and only lands on release, as one edit and one undo.
 * The frame rect is the preview's letterboxed picture, not the panel.
 */

export type FrameRect = { left: number; top: number; width: number; height: number }

export type HandleSelection =
  | { kind: "box"; element: VideoElement | ImageElement }
  | { kind: "text"; element: TextElement }

const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]

const HANDLE_POS: Record<Handle, { left: string; top: string; cursor: string }> = {
  nw: { left: "0%", top: "0%", cursor: "nwse-resize" },
  n: { left: "50%", top: "0%", cursor: "ns-resize" },
  ne: { left: "100%", top: "0%", cursor: "nesw-resize" },
  e: { left: "100%", top: "50%", cursor: "ew-resize" },
  se: { left: "100%", top: "100%", cursor: "nwse-resize" },
  s: { left: "50%", top: "100%", cursor: "ns-resize" },
  sw: { left: "0%", top: "100%", cursor: "nesw-resize" },
  w: { left: "0%", top: "50%", cursor: "ew-resize" },
}

/** The handles, only while the playhead is inside the selected thing. */
export function SelectedOnFrame({
  player,
  selection,
  ...props
}: React.ComponentProps<typeof PreviewHandles> & { player: Player }) {
  const element = selection?.element
  const on = usePlayheadSelector(player, (atUs) =>
    element ? atUs >= element.startUs && atUs < element.startUs + element.durationUs : false
  )
  return on ? <PreviewHandles selection={selection} {...props} /> : null
}

export function PreviewHandles({
  selection,
  frame,
  canvas,
  container,
  onBox,
  onTextMove,
  onTextEdit,
}: {
  selection: HandleSelection | null
  frame: FrameRect
  canvas: { width: number; height: number }
  /** The preview's own node, to find a text where the compositor drew it. */
  container: HTMLElement | null
  onBox: (box: Box) => void
  onTextMove: (position: { x: number; y: number }) => void
  onTextEdit: (content: string) => void
}) {
  if (!selection || frame.width <= 0) return null
  if (selection.kind === "box")
    return <BoxHandles element={selection.element} frame={frame} canvas={canvas} onBox={onBox} />
  return (
    <TextHandles
      element={selection.element}
      frame={frame}
      canvas={canvas}
      container={container}
      onMove={onTextMove}
      onEdit={onTextEdit}
    />
  )
}

function BoxHandles({
  element,
  frame,
  canvas,
  onBox,
}: {
  element: VideoElement | ImageElement
  frame: FrameRect
  canvas: { width: number; height: number }
  onBox: (box: Box) => void
}) {
  const committed = element.box ?? FULL_FRAME
  const [live, setLive] = React.useState<{ box: Box; guides: SnapGuide[] } | null>(null)
  const box = live?.box ?? committed
  const canvasAspect = canvas.width / canvas.height

  const begin = (event: React.PointerEvent, handle: Handle | "move") => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const target = event.currentTarget as HTMLElement
    target.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startY = event.clientY
    const start = committed
    const aspect = (start.width * canvasAspect) / start.height
    let last: { box: Box; guides: SnapGuide[] } | null = null

    const move = (next: PointerEvent) => {
      const delta = {
        x: (next.clientX - startX) / frame.width,
        y: (next.clientY - startY) / frame.height,
      }
      const snap = !next.shiftKey
      if (handle === "move") {
        last = moveBox(start, delta, { snap, threshold: BOX_SNAP_PX / frame.width })
      } else {
        last = { box: resizeBox(start, handle, delta, { aspect, canvasAspect }), guides: [] }
      }
      setLive(last)
    }
    const end = () => {
      target.removeEventListener("pointermove", move)
      target.removeEventListener("pointerup", end)
      target.removeEventListener("pointercancel", end)
      setLive(null)
      if (last) onBox(last.box)
    }
    target.addEventListener("pointermove", move)
    target.addEventListener("pointerup", end)
    target.addEventListener("pointercancel", end)
  }

  const nudge = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 0.05 : 0.01
    const delta =
      event.key === "ArrowLeft"
        ? { x: -step, y: 0 }
        : event.key === "ArrowRight"
          ? { x: step, y: 0 }
          : event.key === "ArrowUp"
            ? { x: 0, y: -step }
            : event.key === "ArrowDown"
              ? { x: 0, y: step }
              : null
    if (!delta) return
    event.preventDefault()
    event.stopPropagation()
    onBox(moveBox(committed, delta, { snap: false }).box)
  }

  return (
    <>
      {live?.guides.map((guide) => (
        <div
          key={`${guide.axis}-${guide.at}`}
          aria-hidden="true"
          className="pointer-events-none absolute bg-kit-focus"
          style={
            guide.axis === "x"
              ? { left: frame.left + guide.at * frame.width, top: frame.top, width: 1, height: frame.height }
              : { top: frame.top + guide.at * frame.height, left: frame.left, height: 1, width: frame.width }
          }
        />
      ))}
      <div
        role="group"
        tabIndex={0}
        aria-label={`${element.name}: drag to move, arrow keys to nudge`}
        onPointerDown={(event) => begin(event, "move")}
        onKeyDown={nudge}
        className="absolute cursor-move outline-1 outline-kit-focus outline-solid focus-visible:outline-2"
        style={{
          left: frame.left + box.x * frame.width,
          top: frame.top + box.y * frame.height,
          width: box.width * frame.width,
          height: box.height * frame.height,
        }}
      >
        {HANDLES.map((handle) => (
          <span
            key={handle}
            aria-hidden="true"
            onPointerDown={(event) => begin(event, handle)}
            className="absolute size-2.5 -translate-1/2 rounded-[2px] border border-kit-focus bg-white before:absolute before:-inset-2"
            style={{
              left: HANDLE_POS[handle].left,
              top: HANDLE_POS[handle].top,
              cursor: HANDLE_POS[handle].cursor,
            }}
          />
        ))}
      </div>
    </>
  )
}

function TextHandles({
  element,
  frame,
  canvas,
  container,
  onMove,
  onEdit,
}: {
  element: TextElement
  frame: FrameRect
  canvas: { width: number; height: number }
  container: HTMLElement | null
  onMove: (position: { x: number; y: number }) => void
  onEdit: (content: string) => void
}) {
  const scale = frame.width / canvas.width
  const [rect, setRect] = React.useState<FrameRect | null>(null)
  const [drag, setDrag] = React.useState<{ x: number; y: number } | null>(null)
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(element.content)

  // Where the compositor drew the text, read from the page, so the box is
  // exactly the text however its role laid it out.
  React.useLayoutEffect(() => {
    if (!container) return
    const read = () => {
      const node = container.querySelector<HTMLElement>(
        `[data-text-id="${CSS.escape(element.id)}"]`
      )
      const host = container.getBoundingClientRect()
      if (!node) return setRect(null)
      const r = node.getBoundingClientRect()
      setRect({ left: r.left - host.left, top: r.top - host.top, width: r.width, height: r.height })
    }
    read()
    const id = window.setInterval(read, 250)
    return () => window.clearInterval(id)
  }, [container, element.id, element.transform.position.x, element.transform.position.y, element.content])

  if (!rect) return null

  const begin = (event: React.PointerEvent) => {
    if (event.button !== 0 || editing) return
    event.preventDefault()
    event.stopPropagation()
    const target = event.currentTarget as HTMLElement
    target.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startY = event.clientY
    let last: { x: number; y: number } | null = null
    const move = (next: PointerEvent) => {
      last = { x: next.clientX - startX, y: next.clientY - startY }
      setDrag(last)
    }
    const end = () => {
      target.removeEventListener("pointermove", move)
      target.removeEventListener("pointerup", end)
      target.removeEventListener("pointercancel", end)
      setDrag(null)
      if (last && (Math.abs(last.x) > 2 || Math.abs(last.y) > 2)) {
        onMove({
          x: element.transform.position.x + last.x / scale,
          y: element.transform.position.y + last.y / scale,
        })
      }
    }
    target.addEventListener("pointermove", move)
    target.addEventListener("pointerup", end)
    target.addEventListener("pointercancel", end)
  }

  const finish = (save: boolean) => {
    setEditing(false)
    if (save && draft.trim() && draft !== element.content) onEdit(draft)
    else setDraft(element.content)
  }

  return (
    <div
      role="group"
      aria-label={`${element.content}: drag to move, double-click to edit`}
      onPointerDown={begin}
      onDoubleClick={() => {
        setDraft(element.content)
        setEditing(true)
      }}
      className="absolute cursor-move outline-1 outline-kit-focus outline-solid"
      style={{
        left: rect.left + (drag?.x ?? 0),
        top: rect.top + (drag?.y ?? 0),
        width: rect.width,
        height: rect.height,
      }}
    >
      {editing ? (
        <input
          autoFocus
          aria-label="Text"
          value={draft}
          maxLength={MAX_TEXT_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => finish(true)}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === "Enter") finish(true)
            if (event.key === "Escape") finish(false)
          }}
          className="absolute inset-x-0 top-full mt-1 h-9 min-w-48 rounded-kit-control border border-kit-hairline bg-kit-object px-2 text-kit-body text-kit-ink outline-hidden"
        />
      ) : null}
    </div>
  )
}
