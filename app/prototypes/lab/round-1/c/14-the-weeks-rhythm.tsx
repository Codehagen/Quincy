import { Frame, Lead, Tile, faint, grey, lift, mono, px, tx } from "./kit"

const ACCENT = "#0FA36B"

type Slot = { t: string; ch: "X" | "LinkedIn"; title: string; waits?: boolean }

const WEEK: { day: string; slots: Slot[] }[] = [
  {
    day: "Mon 16",
    slots: [
      { t: "08:10", ch: "X", title: "Nine screens to three" },
      { t: "09:00", ch: "LinkedIn", title: "Nine screens to three" },
    ],
  },
  { day: "Tue 17", slots: [{ t: "08:10", ch: "X", title: "Support tickets are a roadmap" }] },
  {
    day: "Wed 18",
    slots: [{ t: "12:00", ch: "LinkedIn", title: "Hiring our first designer", waits: true }],
  },
  {
    day: "Thu 19",
    slots: [
      { t: "08:10", ch: "X", title: "The call I almost didn’t take" },
      { t: "09:00", ch: "LinkedIn", title: "The call I almost didn’t take", waits: true },
    ],
  },
  { day: "Fri 20", slots: [{ t: "16:00", ch: "X", title: "Friday ship log" }] },
  { day: "Sat 21", slots: [] },
  { day: "Sun 22", slots: [{ t: "18:00", ch: "LinkedIn", title: "What a week of calls taught me" }] },
]

function Chip({ s }: { s: Slot }) {
  return (
    <div
      className="flex shrink-0 items-center bg-white"
      style={{
        height: px(34),
        padding: `0 ${px(12)}`,
        gap: px(10),
        borderRadius: px(9),
        boxShadow: lift,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontFamily: mono, fontSize: tx(10.5), color: faint }}>
        {s.t} {s.ch === "X" ? "X" : "in"}
      </span>
      <span style={{ fontSize: tx(12.5), fontWeight: 520 }}>{s.title}</span>
      {s.waits ? (
        <span style={{ fontSize: tx(12.5), color: grey }}>· waits for you</span>
      ) : null}
    </div>
  )
}

export default function TheWeeksRhythm() {
  return (
    <Frame>
      <div
        className="grid size-full"
        style={{
          gridTemplateColumns: "1.55fr 1fr",
          gridTemplateRows: "1.15fr 1fr",
          gap: px(8),
        }}
      >
        {/* A — the week, running off the right and bottom edges */}
        <Tile style={{ gridRow: "span 2" }}>
          <Lead
            bold="Next week, already drafted."
            rest="Seven posts from three voice notes. Two wait for you."
            style={{ position: "absolute", left: px(20), top: px(18), right: px(20) }}
          />
          <div
            className="absolute flex flex-col"
            style={{ left: px(20), top: px(84), gap: px(8), width: px(600) }}
          >
            {WEEK.map((d) => (
              <div key={d.day} className="flex items-center" style={{ gap: px(8) }}>
                <span
                  className="shrink-0"
                  style={{
                    width: px(50),
                    fontFamily: mono,
                    fontSize: tx(10.5),
                    color: d.slots.length ? grey : faint,
                  }}
                >
                  {d.day}
                </span>
                {d.slots.length ? (
                  d.slots.map((s, k) => <Chip key={k} s={s} />)
                ) : (
                  <span
                    className="flex items-center"
                    style={{
                      height: px(34),
                      fontSize: tx(12.5),
                      color: faint,
                    }}
                  >
                    Nothing. A day off is part of the rhythm.
                  </span>
                )}
              </div>
            ))}
          </div>
        </Tile>

        {/* B — copy only: the claim, stated against the person's own history */}
        <Tile>
          <Lead
            bold="Tuesday 08:10 is yours."
            rest="Posts in that slot beat your own median twice as often as any other hour, so Quincy keeps putting the strongest one there."
            style={{ position: "absolute", left: px(18), top: px(18), right: px(18) }}
          />
        </Tile>

        {/* C — a ritual, running right now */}
        <Tile>
          <div
            className="absolute flex flex-col"
            style={{ left: px(18), right: px(18), top: px(18), bottom: px(18) }}
          >
            <div className="flex items-center" style={{ gap: px(8) }}>
              <span
                aria-hidden
                className="c14-dot relative block"
                style={{
                  width: px(8),
                  height: px(8),
                  borderRadius: "50%",
                  background: ACCENT,
                }}
              />
              <span style={{ fontSize: tx(14), fontWeight: 580 }}>Sunday plan</span>
              <span style={{ fontSize: tx(14), color: grey }}>running</span>
            </div>
            <div className="mt-auto">
              <p
                style={{
                  margin: 0,
                  fontSize: tx(12.5),
                  lineHeight: 18 / 12.5,
                  color: grey,
                }}
              >
                <span style={{ color: "#111" }}>Reading this week’s replies</span>{" "}
                to decide what Monday leads with.
              </p>
              <div
                className="relative overflow-hidden"
                style={{
                  marginTop: px(12),
                  height: px(4),
                  borderRadius: px(4),
                  background: "rgba(18,18,18,0.08)",
                }}
              >
                <span
                  className="c14-bar absolute inset-y-0 left-0 block"
                  style={{ width: "100%", background: ACCENT, borderRadius: px(4) }}
                />
              </div>
              <div
                className="flex justify-between"
                style={{
                  marginTop: px(8),
                  fontFamily: mono,
                  fontSize: tx(10.5),
                  color: faint,
                }}
              >
                <span>step 2 of 4</span>
                <span>21:40</span>
              </div>
            </div>
          </div>
        </Tile>
      </div>

      <style>{`
        .c14-bar { transform-origin: left; transform: scaleX(0.5); animation: c14-fill 6s cubic-bezier(.4,0,.2,1) infinite; }
        @keyframes c14-fill { from { transform: scaleX(0.28); } to { transform: scaleX(0.72); } }
        .c14-dot::after { content: ""; position: absolute; inset: 0; border-radius: 50%; border: 1.5px solid ${ACCENT}; animation: c14-ping 2s ease-out infinite; }
        @keyframes c14-ping { from { transform: scale(1); opacity: .7; } to { transform: scale(2.6); opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          .c14-bar { animation: none; transform: scaleX(0.5); }
          .c14-dot::after { animation: none; opacity: 0; }
        }
      `}</style>
    </Frame>
  )
}
