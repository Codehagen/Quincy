import { Canvas } from "./canvas"
import { Blob, Cta, Hl, Margin, Receipt } from "./marks"

/**
 * A reference sets its app window on a wallpaper. Here the wallpaper is a
 * quiet grey landscape and the window is Quincy at work: your voice note
 * with its one line highlighted, Quincy's receipt of what it did, and the
 * draft bracketed into its three beats, held for your read.
 */
export default function OnTheWallpaper() {
  return (
    <Canvas>
      <div className="absolute inset-x-16 top-9 flex items-center justify-between text-[15px]">
        <span className="flex items-center gap-2 font-[600] tracking-[-0.01em]">
          <Blob size={20} />
          Quincy
        </span>
        <span className="text-kit-ink-muted">Invites go out in small groups</span>
      </div>

      <div className="absolute inset-x-0 top-[100px] flex flex-col items-center text-center">
        <h1 className="text-[72px] leading-[1] font-[600] tracking-[-0.06em]">
          Quincy drafts. You send.
        </h1>
        <p className="mt-5 max-w-[48ch] text-[18px] leading-[1.5] text-kit-ink-muted">
          Talk on a walk, merge a pull request, paste your notes. Quincy finds
          the post and writes it in your voice.
        </p>
        <div className="mt-8 flex items-center gap-3">
          <Cta>Join the waitlist</Cta>
          <span className="text-[15px] text-kit-ink-muted">$49 a month, one plan</span>
        </div>
      </div>

      {/* The wallpaper: hills at dusk, in greys only. */}
      <div className="absolute top-[384px] left-16 h-[600px] w-[1068px] overflow-hidden rounded-[26px] bg-kit-stage">
        <svg aria-hidden viewBox="0 0 1068 600" preserveAspectRatio="none" className="absolute inset-0 size-full">
          <defs>
            <linearGradient id="a05-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--kit-stage)" />
              <stop offset="1" stopColor="var(--kit-object)" />
            </linearGradient>
          </defs>
          <rect width="1068" height="600" fill="url(#a05-sky)" />
          <path d="M0 250 C 160 200, 300 230, 420 210 S 700 160, 860 200 S 1000 230, 1068 215 L 1068 600 L 0 600 Z" fill="var(--kit-chrome)" />
          <path d="M0 320 C 200 270, 380 300, 560 280 S 900 250, 1068 290 L 1068 600 L 0 600 Z" fill="var(--kit-chrome)" />
          <path d="M0 400 C 240 350, 520 390, 760 360 S 980 350, 1068 370 L 1068 600 L 0 600 Z" fill="var(--kit-chrome)" />
        </svg>

        {/* The window. */}
        <div className="absolute top-12 left-1/2 flex h-[520px] w-[960px] -translate-x-1/2 overflow-hidden rounded-[18px] bg-kit-object shadow-kit-lifted">
          <nav className="w-[170px] flex-none border-r border-kit-hairline px-4 pt-5 text-[14px]">
            <div className="flex items-center gap-2 px-2">
              <Blob size={22} />
              <span className="font-[600]">Quincy</span>
            </div>
            <ul className="mt-5 flex flex-col gap-0.5">
              {["Studio", "Ideas", "Week", "Numbers"].map((x, i) => (
                <li key={x} className={`rounded-kit-control px-2 py-1.5 ${i === 0 ? "bg-kit-stage font-[560]" : "text-kit-ink-muted"}`}>
                  {x}
                </li>
              ))}
            </ul>
          </nav>

          {/* The conversation. */}
          <div className="flex-1 px-7 pt-6">
            <div className="ml-auto w-[300px] rounded-kit-object bg-kit-stage px-4 py-3 text-[14px] leading-[1.5]">
              <p className="font-kit-mono text-[11px] text-kit-ink-muted">voice note · 2 min 14 s</p>
              <p className="mt-1">
                &hellip;so we moved the annual toggle above the plans.{" "}
                <Hl>Annual went from nine to twenty-three.</Hl> Same prices.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-2.5">
              <Blob size={22} />
              <span className="text-[14px] font-[600]">Quincy</span>
            </div>
            <div className="mt-4">
              <Receipt
                lines={[
                  ["Listened", "2 min 14 s"],
                  ["Found the number", "9 to 23 annual signups"],
                  ["Drafted", "1 post that sounds like you, held for your read"],
                ]}
              />
            </div>
            <p className="mt-5 text-[14px] leading-[1.5]">
              It is on the right. I left out the footer and the logo, they were
              notes to yourself.
            </p>
          </div>

          {/* The draft, bracketed. */}
          <div className="w-[370px] flex-none border-l border-kit-hairline pt-6 pl-6">
            <p className="font-kit-mono text-[11px] text-kit-ink-muted">Draft for LinkedIn · waiting for you</p>
            <div className="mt-4 flex w-[210px] flex-col gap-3 text-[14px] leading-[1.5]">
              <Margin note="did" gap={12} width={100}>
                <p>I moved the annual toggle above our plans. Same prices.</p>
              </Margin>
              <Margin note="happened" gap={12} width={100}>
                <div>
                  <p className="text-kit-ink-muted">Annual signups this month:</p>
                  <p className="text-[24px] leading-[1.3] font-[600] tabular-nums">23</p>
                  <p className="text-kit-ink-muted">Last month it was 9.</p>
                </div>
              </Margin>
              <Margin note="meant" gap={12} width={100}>
                <p>Nobody changed the price. People just saw it first.</p>
              </Margin>
            </div>
            <div className="mt-5 flex gap-2">
              <button type="button" className="h-9 rounded-full bg-kit-ink px-4 text-[14px] font-[560] text-kit-ground">
                Send
              </button>
              <button type="button" className="h-9 rounded-full bg-kit-control px-4 text-[14px] font-[560] shadow-kit-control">
                Edit
              </button>
            </div>
          </div>
        </div>
      </div>
    </Canvas>
  )
}
