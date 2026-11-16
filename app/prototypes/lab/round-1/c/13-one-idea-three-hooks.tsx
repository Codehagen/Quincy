"use client"

import * as React from "react"

import { Frame, Lead, Pen, Skel, Tile, faint, grey, lift, mono, px, tx } from "./kit"

const ACCENT = "#FFD43B"

const HOOKS = [
  {
    id: "x",
    label: "X",
    rule: "the first line is the post",
    hook: "Nine onboarding screens. We deleted six.",
    tail: [210, 168],
  },
  {
    id: "li",
    label: "LinkedIn",
    rule: "first line sits above “see more”",
    hook: "I was sure cutting onboarding would flood support. It did the opposite.",
    tail: [240, 200, 120],
  },
  {
    id: "yt",
    label: "Shorts",
    rule: "the title is a search term",
    hook: "How we cut onboarding to 3 screens (tickets fell 40%)",
    tail: [180],
  },
] as const

export default function OneIdeaThreeHooks() {
  const [tab, setTab] = React.useState(0)

  return (
    <Frame>
      <Tile className="size-full">
        <Lead
          bold="One idea, a new first line per channel."
          rest="Quincy rewrites the hook for where it will be read, rather than pasting one string everywhere."
          style={{ position: "absolute", left: px(26), top: px(24), width: px(330) }}
        />

        <div
          className="absolute flex flex-col items-start"
          style={{ right: px(34), top: px(30), gap: px(2) }}
        >
          <Pen style={{ transform: "rotate(-4deg)" }}>same idea,</Pen>
          <Pen style={{ transform: "rotate(-4deg)", marginLeft: px(12) }}>
            new first line
          </Pen>
          <svg
            aria-hidden
            viewBox="0 0 30 56"
            style={{ width: px(30), height: px(56), marginLeft: px(40), overflow: "visible" }}
          >
            <path
              d="M6 2 C 2 22, 10 40, 22 52 M14 50 L22 52 L22 44"
              fill="none"
              stroke="rgba(18,18,18,0.55)"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* The one window in the composition, running off the bottom edge. */}
        <div
          className="absolute overflow-hidden bg-white"
          style={{
            left: px(26),
            right: px(26),
            top: px(128),
            bottom: px(-24),
            borderRadius: px(12),
            boxShadow: lift,
          }}
        >
          <div
            className="flex items-center"
            style={{
              height: px(32),
              padding: `0 ${px(12)}`,
              gap: px(6),
              borderBottom: "1px solid rgba(17,17,17,0.06)",
            }}
          >
            {[0, 1, 2].map((d) => (
              <span
                key={d}
                aria-hidden
                style={{
                  width: px(9),
                  height: px(9),
                  borderRadius: "50%",
                  background: "rgba(17,17,17,0.12)",
                }}
              />
            ))}
            <span
              className="mx-auto"
              style={{ fontFamily: mono, fontSize: tx(10.5), color: faint }}
            >
              hirequincy.com/ideas/nine-screens
            </span>
          </div>

          <div style={{ padding: `${px(16)} ${px(20)}` }}>
            <div className="flex items-baseline justify-between" style={{ gap: px(12) }}>
              <span style={{ fontSize: tx(12.5), fontWeight: 560 }}>Idea</span>
              <span style={{ fontFamily: mono, fontSize: tx(10.5), color: faint }}>
                walk-to-office.m4a · 02:41
              </span>
            </div>
            <p
              style={{
                margin: `${px(4)} 0 0`,
                fontSize: tx(12.5),
                lineHeight: 18 / 12.5,
                color: grey,
              }}
            >
              We cut onboarding from nine screens to three, and support tickets
              fell 40% in a month.
            </p>

            <div
              role="tablist"
              aria-label="Channel"
              className="flex"
              style={{
                gap: px(18),
                marginTop: px(16),
                borderBottom: "1px solid rgba(17,17,17,0.07)",
              }}
            >
              {HOOKS.map((h, i) => {
                const on = i === tab
                return (
                  <button
                    key={h.id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setTab(i)}
                    className="relative outline-none"
                    style={{
                      paddingBottom: px(8),
                      fontSize: tx(12.5),
                      fontWeight: on ? 580 : 460,
                      color: on ? "#111" : grey,
                      transition: "color 160ms ease-out",
                      touchAction: "manipulation",
                    }}
                  >
                    {h.label}
                    <span
                      aria-hidden
                      className="absolute left-0 right-0"
                      style={{
                        bottom: -1,
                        height: px(1.5),
                        background: "#111",
                        transform: `scaleX(${on ? 1 : 0})`,
                        transition: "transform 200ms ease-out",
                      }}
                    />
                  </button>
                )
              })}
            </div>

            <div className="relative" style={{ marginTop: px(14), height: px(120) }}>
              {HOOKS.map((h, i) => {
                const on = i === tab
                return (
                  <div
                    key={h.id}
                    role="tabpanel"
                    aria-hidden={!on}
                    className="c13-swap absolute inset-0"
                    style={{
                      opacity: on ? 1 : 0,
                      transform: `translateY(${on ? 0 : px(4)})`,
                      transition: "opacity 200ms ease-out, transform 200ms ease-out",
                    }}
                  >
                    <span style={{ fontFamily: mono, fontSize: tx(10.5), color: faint }}>
                      {h.rule}
                    </span>
                    <p
                      style={{
                        margin: `${px(6)} 0 0`,
                        fontSize: tx(15),
                        lineHeight: 22 / 15,
                        fontWeight: 560,
                        maxWidth: px(400),
                      }}
                    >
                      <mark
                        className="c13-mark"
                        style={{
                          color: "inherit",
                          backgroundColor: "transparent",
                          backgroundImage: `linear-gradient(${ACCENT}, ${ACCENT})`,
                          backgroundRepeat: "no-repeat",
                          backgroundPosition: "0 85%",
                          backgroundSize: on ? "100% 55%" : "0% 55%",
                          transition: "background-size 420ms cubic-bezier(.2,.7,.2,1) 120ms",
                          boxDecorationBreak: "clone",
                          WebkitBoxDecorationBreak: "clone",
                          padding: `0 ${px(2)}`,
                        }}
                      >
                        {h.hook}
                      </mark>
                    </p>
                    <div className="flex flex-col" style={{ gap: px(7), marginTop: px(12) }}>
                      {h.tail.map((w, k) => (
                        <Skel key={k} w={w} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </Tile>

      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .c13-swap { transform: none !important; transition: opacity 120ms linear !important; }
          .c13-mark { transition: none !important; }
        }
      `}</style>
    </Frame>
  )
}
