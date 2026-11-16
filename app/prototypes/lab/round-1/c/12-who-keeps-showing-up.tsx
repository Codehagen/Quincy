"use client"

import * as React from "react"

import { Face, Frame, Lead, Pen, Skel, Tile, faint, grey, lift, mono, px, tx } from "./kit"

const ACCENT = "#1F6FEB"

const PEOPLE = [
  { i: "ML", n: 5 },
  { i: "JO", n: 4 },
  { i: "PR", n: 3 },
  { i: "EN", n: 3 },
  { i: "AS", n: 2 },
  { i: "TH", n: 2 },
  { i: "KB", n: 2 },
  { i: "RV", n: 2 },
]

export default function WhoKeepsShowingUp() {
  const [state, setState] = React.useState<"idle" | "sent">("idle")
  const [pressed, setPressed] = React.useState(false)
  const sent = state === "sent"

  return (
    <Frame>
      <div
        className="grid size-full"
        style={{
          gridTemplateColumns: "1.25fr 1fr",
          gridTemplateRows: "1fr 1fr",
          gap: px(8),
        }}
      >
        {/* A — copy and the faces, cropped by the right edge */}
        <Tile>
          <Lead
            bold="The same few people."
            rest="They reply to most of what you post, and Quincy keeps count."
            style={{ position: "absolute", left: px(20), top: px(18), right: px(24) }}
          />
          <div
            className="absolute flex"
            style={{ left: px(20), bottom: px(18), gap: px(10) }}
          >
            {PEOPLE.map((p, k) => (
              <div key={p.i} className="flex flex-col items-center" style={{ gap: px(6) }}>
                <Face initials={p.i} size={40} tone={k} />
                <span
                  style={{
                    fontFamily: mono,
                    fontSize: tx(10.5),
                    color: k === 0 ? "#111" : faint,
                  }}
                >
                  {p.n}/6
                </span>
              </div>
            ))}
          </div>
        </Tile>

        {/* B — the one piece of UI: her reply, Quincy's draft, your send */}
        <Tile style={{ gridRow: "span 2" }}>
          <div
            className="absolute bg-white"
            style={{
              left: px(16),
              right: px(-30),
              top: px(22),
              bottom: px(-40),
              borderRadius: px(12),
              boxShadow: lift,
              padding: px(16),
            }}
          >
            <div className="flex items-center" style={{ gap: px(8) }}>
              <Face initials="ML" size={24} />
              <span style={{ fontSize: tx(12.5), fontWeight: 560 }}>
                Maya Lindqvist
              </span>
              <span style={{ fontSize: tx(12.5), color: faint }}>2h</span>
            </div>
            <p
              style={{
                margin: `${px(8)} 0 0`,
                fontSize: tx(12.5),
                lineHeight: 18 / 12.5,
                paddingRight: px(40),
              }}
            >
              We did the same with signup last spring. Tickets halved. Did you
              cut anything you later put back?
            </p>

            <div
              style={{
                marginTop: px(14),
                paddingTop: px(12),
                borderTop: "1px solid rgba(17,17,17,0.07)",
                paddingRight: px(40),
              }}
            >
              <span style={{ fontSize: tx(11), color: grey }}>
                Quincy drafted · your voice
              </span>
              <p
                style={{
                  margin: `${px(6)} 0 0`,
                  fontSize: tx(12.5),
                  lineHeight: 18 / 12.5,
                }}
              >
                One. The workspace name screen came back a week later, people
                kept asking where to rename it.
              </p>
              <div className="flex flex-col" style={{ gap: px(6), marginTop: px(10) }}>
                <Skel w={150} />
                <Skel w={96} />
              </div>

              <div className="flex items-center" style={{ gap: px(8), marginTop: px(16) }}>
                <button
                  type="button"
                  disabled={sent}
                  onClick={() => setState("sent")}
                  onPointerDown={() => setPressed(true)}
                  onPointerUp={() => setPressed(false)}
                  onPointerLeave={() => setPressed(false)}
                  className="c12-press relative inline-flex items-center justify-center text-white outline-none"
                  style={{
                    height: px(30),
                    padding: `0 ${px(14)}`,
                    borderRadius: px(8),
                    background: sent ? "#111" : ACCENT,
                    fontSize: tx(12.5),
                    fontWeight: 560,
                    transform: pressed ? "scale(0.97)" : "scale(1)",
                    transition: "transform 120ms ease-out, background-color 200ms ease-out",
                    touchAction: "manipulation",
                  }}
                >
                  {sent ? "Sent from you" : "Approve and send"}
                </button>
                {sent ? (
                  <button
                    type="button"
                    onClick={() => setState("idle")}
                    style={{ fontSize: tx(12.5), color: grey }}
                  >
                    Undo
                  </button>
                ) : (
                  <span style={{ fontSize: tx(12.5), color: grey }}>Edit</span>
                )}
              </div>
            </div>
          </div>
        </Tile>

        {/* C — typography only, with the one margin note */}
        <Tile>
          <p
            style={{
              position: "absolute",
              left: px(20),
              top: px(18),
              right: px(20),
              margin: 0,
              fontSize: tx(14),
              lineHeight: 22 / 14,
            }}
          >
            <span style={{ fontWeight: 580 }}>Maya, 5 of your last 6.</span>{" "}
            <span style={{ color: grey }}>
              Jonas 4. Priya and Ella 3. Four more, twice. Everyone else, once.
            </span>
          </p>
          <div
            className="absolute flex items-end"
            style={{ right: px(18), bottom: px(18), gap: px(6) }}
          >
            <Pen style={{ transform: "rotate(-3deg)" }}>answer her first</Pen>
            <svg
              aria-hidden
              viewBox="0 0 40 30"
              style={{ width: px(40), height: px(30), overflow: "visible" }}
            >
              <path
                d="M2 26 C 18 26, 30 18, 36 4 M30 8 L36 4 L37 11"
                fill="none"
                stroke="rgba(18,18,18,0.55)"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </Tile>
      </div>

      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .c12-press { transform: none !important; transition: background-color 200ms ease-out !important; }
        }
      `}</style>
    </Frame>
  )
}
