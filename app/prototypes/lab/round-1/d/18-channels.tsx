"use client"

import * as React from "react"

import { caveat } from "./fonts"
import { Bar, GREY, MONO, OBJECT, Stage, Ticker } from "./stage"

/**
 * 18 — One idea, cut per channel.
 *
 * A segmented control whose thumb slides, and a first line that is re-cut
 * rather than reflowed. The length meter is the reason the cuts differ: each
 * channel shows a different amount before it folds.
 */

const VIOLET = "#6D4AE8"

const CUTS = [
  {
    id: "x",
    label: "X",
    hook: "We rewrote CSV export. Support tickets went from 31 a week to 4.",
    fold: 280,
    foldLabel: "limit",
  },
  {
    id: "li",
    label: "LinkedIn",
    hook: "The best support project we ran this year never touched the support team. It was a rewrite nobody asked for.",
    fold: 210,
    foldLabel: "before “see more”",
  },
  {
    id: "yt",
    label: "Shorts",
    hook: "How we cut CSV support tickets by 87%",
    fold: 100,
    foldLabel: "title, searched",
  },
] as const

export default function Channels() {
  const [i, setI] = React.useState(0)
  const cut = CUTS[i]
  const len = cut.hook.length

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") setI((v) => (v + 1) % CUTS.length)
    if (e.key === "ArrowLeft") setI((v) => (v + CUTS.length - 1) % CUTS.length)
  }

  return (
    <Stage
      lead="One idea, three first lines."
      rest="Pasting the same text everywhere is what feeds learn to bury."
    >
      <style>{css}</style>

      <div
        style={{
          ...OBJECT,
          position: "absolute",
          left: "1.7em",
          top: "6.4em",
          width: "25.5em",
          height: "26em",
          padding: "0.9em 1.25em",
        }}
      >
        {/* Segmented control. The thumb slides; the labels stay put. */}
        <div
          role="tablist"
          aria-label="Channel"
          onKeyDown={onKey}
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: `repeat(${CUTS.length}, 1fr)`,
            padding: "0.2em",
            borderRadius: "0.65em",
            background: "#F2F2F1",
          }}
        >
          <span
            aria-hidden
            className="ch-thumb"
            style={{
              position: "absolute",
              top: "0.2em",
              bottom: "0.2em",
              left: "0.2em",
              width: `calc((100% - 0.4em) / ${CUTS.length})`,
              transform: `translateX(${i * 100}%)`,
              borderRadius: "0.5em",
              background: "#fff",
              boxShadow:
                "0 0 0 1px rgba(18,18,18,0.06), 0 1px 2px rgba(18,18,18,0.06)",
            }}
          />
          {CUTS.map((c, k) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={k === i}
              tabIndex={k === i ? 0 : -1}
              onClick={() => setI(k)}
              className="ch-tab"
              style={{
                position: "relative",
                height: "2.1em",
                borderRadius: "0.5em",
                fontWeight: 560,
                color: k === i ? "#111" : GREY,
                cursor: "pointer",
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        <p
          style={{
            marginTop: "1.1em",
            color: GREY,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>First line</span>
          <span style={{ fontFamily: MONO, fontSize: "0.9em" }}>
            <span style={{ color: "#111" }}>
              <Ticker value={len} ms={380} />
            </span>{" "}
            / {cut.fold} {cut.foldLabel}
          </span>
        </p>

        <p
          key={cut.id}
          className="ch-hook"
          role="tabpanel"
          style={{
            marginTop: "0.35em",
            fontSize: "1.18em",
            lineHeight: 1.36,
            fontWeight: 560,
            letterSpacing: "-0.012em",
            minHeight: "4.1em",
            textWrap: "pretty",
          }}
        >
          {cut.hook}
        </p>

        {/* Length against the fold: the reason the three cuts differ. */}
        <div
          aria-hidden
          style={{
            marginTop: "0.8em",
            height: "0.3em",
            borderRadius: 999,
            background: "#F0F0EF",
            overflow: "hidden",
          }}
        >
          <span
            className="ch-meter"
            style={{
              display: "block",
              height: "100%",
              width: "100%",
              transform: `scaleX(${Math.min(1, len / cut.fold)})`,
              transformOrigin: "left",
              background: VIOLET,
              borderRadius: 999,
            }}
          />
        </div>

        <div style={{ marginTop: "1.4em" }}>
          <Bar w="92%" />
          <Bar w="84%" style={{ marginTop: "0.65em" }} />
          <Bar w="58%" style={{ marginTop: "0.65em" }} />
        </div>
      </div>

      <div aria-hidden className="ch-note">
        <svg
          viewBox="0 0 40 60"
          fill="none"
          stroke={GREY}
          strokeWidth="1.4"
          strokeLinecap="round"
          style={{ width: "1.6em", height: "6.6em", display: "block" }}
        >
          <path d="M6 4 C 20 6, 20 54, 6 56" />
        </svg>
        <span className={caveat.className}>
          same idea,
          <br />
          new first line
        </span>
      </div>
    </Stage>
  )
}

const css = `
.ch-thumb { transition: transform 260ms cubic-bezier(.3,.9,.3,1); }
.ch-tab { transition: color 160ms ease; }
.ch-tab:hover { color: #111 !important; }
.ch-meter { transition: transform 380ms cubic-bezier(.2,.8,.3,1); }
.ch-hook { animation: ch-in 240ms cubic-bezier(.2,.8,.3,1) both; }
@keyframes ch-in {
  from { opacity: 0; transform: translateY(0.35em); }
  to   { opacity: 1; transform: none; }
}
.ch-note {
  position: absolute;
  left: 27.5em;
  top: 12.6em;
  display: flex;
  align-items: center;
  gap: 0.3em;
  color: ${GREY};
}
.ch-note span { font-size: 1.45em; line-height: 1.05; transform: rotate(-3deg); }
@container (max-width: 460px) { .ch-note { display: none; } }
@media (prefers-reduced-motion: reduce) {
  .ch-thumb, .ch-meter, .ch-tab { transition: none; }
  .ch-hook { animation: none; }
}
`
