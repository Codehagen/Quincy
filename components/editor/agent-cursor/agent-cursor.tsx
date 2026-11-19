"use client"

/*
 * What Quincy draws on the desk while it cuts: an ink arrow with its name tag,
 * the selection mark over the target, the Zoom control that appears over a
 * selection, and the extra stretches a grouped cut lights at its press. The
 * director (./director.ts) owns where each one is and writes to these nodes
 * directly; this only draws what they are.
 *
 * Everything here takes no pointer events and is hidden from assistive tech:
 * your pointer stays yours, and the margin's live region says what each run
 * changed in words. Under reduced motion there is no cursor and no drag; only
 * the mark's opacity-only highlight remains.
 */

import { ECHO_COUNT, type Director, type LaneView } from "./director"
import "./agent-cursor.css"

/**
 * Every cursor of the run: one for a run on the scene on screen, one per cut
 * for three cuts. The lead carries the full tag and the ring; a support
 * cursor (B, C) is smaller, 70% opacity, with no ring (agent-cursor.css).
 */
export function AgentCursors({ director }: { director: Director }) {
  return director.lanes.map((lane) => (
    <AgentCursor key={lane.key} lane={lane} reduced={director.reduced} />
  ))
}

function AgentCursor({ lane, reduced }: { lane: LaneView; reduced: boolean }) {
  const { label, support, attachMark, attachToolbar, attachCursor, attachEchoes } = lane
  return (
    <div aria-hidden className="agent-layer">
      <div ref={attachMark} className="agent-mark">
        <span className="agent-mark-hover" />
        <span className="agent-mark-sel" />
        <span className="agent-mark-hot" />
      </div>
      {Array.from({ length: ECHO_COUNT }, (_, index) => (
        <div
          key={index}
          ref={attachEchoes[index]}
          className="agent-mark agent-echo"
        >
          <span className="agent-mark-hot" />
        </div>
      ))}
      {reduced ? null : (
        <>
          {/* The Zoom control over a drag-selected line. Measured and pressed
              like any target, so it carries one. */}
          <div ref={attachToolbar} className="agent-toolbar">
            <span data-target="control:zoom" className="agent-toolbar-button">
              Zoom
            </span>
          </div>
          <div ref={attachCursor} className="agent-cursor" data-support={support || undefined}>
            <span className="agent-ring" />
            <span className="agent-arrow">
              <svg width="18" height="23" viewBox="0 0 22 28">
                <path
                  d="M2 1.5v21.2l5.3-5.1 3.4 8 3.7-1.6-3.4-7.8H18L2 1.5Z"
                  className="fill-kit-ink stroke-kit-object"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="agent-tag">
              {label}
              <span className="agent-cap">⌫</span>
            </span>
          </div>
        </>
      )}
    </div>
  )
}
