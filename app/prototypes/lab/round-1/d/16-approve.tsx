"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon } from "@hugeicons/core-free-icons"

import { caveat } from "./fonts"
import { Bar, GREY, INK, MONO, OBJECT, Stage, Ticker } from "./stage"

/**
 * 16 — Approve.
 *
 * The most repeated control in the product, built as the thing itself: a
 * draft in your name, one blue button, a press that gives, and a queue count
 * that ticks down because you just cleared one.
 */

const BLUE = "#2563EB"

export default function Approve() {
  const [approved, setApproved] = React.useState(false)

  return (
    <Stage
      lead="Quincy drafts, you send."
      rest="Nothing goes out in your name until you press it."
    >
      <style>{css}</style>

      {/* The card. Runs off the bottom edge: it is one of a queue. */}
      <div
        style={{
          ...OBJECT,
          position: "absolute",
          left: "1.7em",
          top: "6.4em",
          width: "25.5em",
          padding: "1.15em 1.25em 1.1em",
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: "0.6em" }}
        >
          <span
            aria-hidden
            style={{
              width: "1.7em",
              height: "1.7em",
              borderRadius: 999,
              background: "#E4E4E2",
              flexShrink: 0,
            }}
          />
          <span style={{ fontWeight: 560 }}>Maren Holt</span>
          <span style={{ color: GREY }}>@marenholt</span>
          <span
            style={{
              marginLeft: "auto",
              fontFamily: MONO,
              fontSize: "0.86em",
              color: GREY,
            }}
          >
            X · Tue 09:10
          </span>
        </div>

        <p style={{ marginTop: "0.8em", textWrap: "pretty" }}>
          Merged the export rewrite on Friday. CSV tickets went from 31 a week
          to 4.
        </p>
        <p style={{ marginTop: "0.5em", textWrap: "pretty" }}>
          Nobody files a ticket for a thing that just works.
        </p>

        <div
          style={{
            marginTop: "1.1em",
            display: "flex",
            alignItems: "center",
            gap: "0.5em",
          }}
        >
          <span
            aria-live="polite"
            style={{
              color: GREY,
              flex: 1,
              minWidth: 0,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {approved ? (
              <span key="a" className="d-rise">
                Goes out Tue 09:10, as you
              </span>
            ) : (
              <span key="b">From a voice note, Sunday</span>
            )}
          </span>
          {approved ? (
            <button
              type="button"
              className="d-press"
              onClick={() => setApproved(false)}
              style={{
                height: "2.3em",
                padding: "0 0.8em",
                borderRadius: "0.6em",
                background: "transparent",
                color: GREY,
                cursor: "pointer",
              }}
            >
              Undo
            </button>
          ) : (
            <button
              type="button"
              className="d-press ap-ghost"
              style={{
                height: "2.3em",
                padding: "0 0.85em",
                borderRadius: "0.6em",
                background: "#F2F2F1",
                cursor: "pointer",
              }}
            >
              Edit
            </button>
          )}
          <button
            type="button"
            className="d-press ap-go"
            data-done={approved || undefined}
            onClick={() => setApproved(true)}
            aria-pressed={approved}
            style={{
              height: "2.3em",
              minWidth: "6.6em",
              padding: "0 0.95em",
              borderRadius: "0.6em",
              fontWeight: 560,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.35em",
              cursor: approved ? "default" : "pointer",
            }}
          >
            {approved ? (
              <>
                <HugeiconsIcon
                  icon={Tick02Icon}
                  size="1.1em"
                  strokeWidth={2.2}
                  aria-hidden
                />
                Approved
              </>
            ) : (
              "Approve"
            )}
          </button>
        </div>
      </div>

      {/* The rest of the queue, peeking. */}
      <div
        aria-hidden
        style={{
          ...OBJECT,
          position: "absolute",
          left: "1.7em",
          top: "20.6em",
          width: "25.5em",
          height: "12em",
          padding: "1.25em",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.6em" }}>
          <span
            style={{
              width: "1.7em",
              height: "1.7em",
              borderRadius: 999,
              background: "#EDEDEB",
            }}
          />
          <Bar w="7em" />
          <Bar w="4.5em" style={{ marginLeft: "auto" }} />
        </div>
        <Bar w="88%" style={{ marginTop: "1em" }} />
        <Bar w="64%" style={{ marginTop: "0.6em" }} />
      </div>

      {/* Waiting count, top right. Ticks when a draft is cleared. */}
      <p
        style={{
          position: "absolute",
          right: "1.7em",
          top: "1.5em",
          color: GREY,
          textAlign: "right",
        }}
      >
        <span style={{ fontWeight: 560, color: INK }}>
          <Ticker value={approved ? 2 : 3} ms={360} />
        </span>{" "}
        waiting
      </p>

      {/* Margin note, wide frames only. */}
      <div aria-hidden className="ap-note">
        <span className={caveat.className}>the only way out</span>
        <svg
          viewBox="0 0 60 40"
          style={{ width: "3.6em", height: "2.4em", display: "block" }}
          fill="none"
          stroke={GREY}
          strokeWidth="1.4"
          strokeLinecap="round"
        >
          <path d="M40 3 C 34 18, 22 30, 5 36" />
          <path d="M5 36 l 6 -6.5 M5 36 l 8.5 1" />
        </svg>
      </div>
    </Stage>
  )
}

const css = `
.ap-go { background: ${BLUE}; color: #fff; }
.ap-go[data-done] { background: #EAF0FD; color: ${BLUE}; }
.ap-go:not([data-done]):hover { background: #1D4FD8; }
.ap-ghost:hover { background: #EAEAE8; }
.ap-note {
  position: absolute;
  left: 27.9em;
  top: 14.6em;
  color: ${GREY};
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.ap-note span { font-size: 1.5em; line-height: 1; transform: rotate(-4deg); white-space: nowrap; }
.ap-note svg { margin-left: -1.6em; margin-top: 0.1em; }
@container (max-width: 460px) { .ap-note { display: none; } }
`
