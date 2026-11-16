"use client"

/*
 * 21 — The same hills.
 *
 * From 05: the app window on a grey wallpaper. Pushed: the wallpaper is the
 * page's backdrop all the way down. Every product picture stands on a crop
 * of one long landscape, and each crop starts further along it, so scrolling
 * the page is walking along one horizon. The rests between them (depth,
 * price) are plain ground, and the page ends where the hills do.
 */

import { Hand, Margin, Ring } from "../../round-1/a/marks"
import { Window } from "@/components/showcase"

import { Sheet } from "./sheet"
import { Cta, Footer, Hills, NEVER, Pic, PRICE_LINES, PriceFigure, TopLine, Waitlist } from "./parts"
import { ApproveRow, Checks, Draft, Ideas, Numbers, RUN, Side, VoiceNote, Week, Who } from "./product"

function Plate({
  w,
  h,
  at,
  horizon,
  children,
  className = "",
}: {
  w: number
  h: number
  at: number
  horizon?: number
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div style={{ width: w, height: h }} className={`relative flex-none overflow-hidden rounded-[26px] ${className}`}>
      <Hills width={w} height={h} at={at} horizon={horizon} />
      {children}
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <span className="w-6 flex-none pt-0.5 font-kit-mono text-[13px] text-kit-ink-muted">0{n}</span>
      <div>
        <h3 className="text-[18px] leading-[1.35] font-[600] tracking-[-0.015em]">{title}</h3>
        <p className="mt-1.5 text-[15px] leading-[1.55] text-kit-ink-muted text-pretty">{children}</p>
      </div>
    </div>
  )
}

export default function TheSameHills() {
  return (
    <Sheet>
      <TopLine />

      {/* Hero */}
      <section className="flex flex-col items-center pt-[88px] text-center">
        <h1 className="text-[72px] leading-[1] font-[600] tracking-[-0.06em]">Quincy drafts. You send.</h1>
        <p className="mt-5 max-w-[50ch] text-[18px] leading-[1.5] text-kit-ink-muted">
          Talk on a walk, merge a pull request, paste your notes. Quincy finds
          the post in it and writes it in your voice.
        </p>
        <div className="mt-8 flex items-center gap-4">
          <Cta />
          <span className="text-[15px] text-kit-ink-muted">$49 a month, one plan</span>
        </div>
      </section>

      <div className="mt-16 px-16">
        <Plate w={1072} h={600} at={0} horizon={0.36}>
          <Pic width={1072} height={600} className="absolute inset-0">
            <Window url="hirequincy.com/studio" className="absolute top-14 left-14 h-[600px] w-[960px]">
              <div className="flex h-full bg-kit-object">
                <Side />
                <div className="min-w-0 flex-1 px-7 pt-6">
                  <div className="flex flex-col items-end">
                    <Who>You · voice note</Who>
                    <div className="mt-1.5">
                      <VoiceNote sweep width={330} />
                    </div>
                  </div>
                  <div className="mt-6">
                    <Who quincy>14:06</Who>
                  </div>
                  <div className="mt-3.5">
                    <Checks lines={RUN} />
                  </div>
                  <div className="mt-4 text-[14px] leading-[1.55]">
                    The draft is on the right. Nothing went out.
                  </div>
                </div>
                <aside className="w-[344px] flex-none border-l border-kit-hairline pt-6 pl-6">
                  <div className="font-kit-mono text-[11px] text-kit-ink-muted">Draft for LinkedIn · waiting for you</div>
                  <div className="mt-4">
                    <Draft width={196} gap={12} note={100} size={14} labels={["did", "happened", "meant"]} />
                  </div>
                  <div className="mt-5">
                    <ApproveRow when="" />
                  </div>
                </aside>
              </div>
            </Window>
          </Pic>
        </Plate>
      </div>

      {/* How it works: three stretches of the same hills */}
      <section className="px-16 pt-[136px]">
        <div className="text-center">
          <p className="text-[14px] text-kit-ink-muted">How it works</p>
          <h2 className="mt-2 text-[48px] leading-[1.05] font-[600] tracking-[-0.045em]">You talk. It finds the post.</h2>
        </div>

        <div className="mt-16 flex items-center gap-16">
          <div className="flex w-[368px] flex-none flex-col gap-8">
            <Step n={1} title="Bring what you already have">
              A voice note from a walk, a pull request you merged, notes you
              paste in. Ramble and all.
            </Step>
            <Step n={2} title="Quincy finds the ideas">
              It reads the whole thing and marks the line worth posting.
              Usually two or three ideas, named by where they came from.
            </Step>
          </div>
          <Plate w={640} h={520} at={1180} horizon={0.5}>
            <Pic width={640} height={520} className="absolute inset-0">
              <div className="absolute top-9 left-10 rounded-kit-object bg-kit-object p-1.5 shadow-kit-lifted">
                <VoiceNote width={320} />
              </div>
              <div className="absolute top-[262px] left-[262px] rounded-kit-object shadow-kit-lifted">
                <Ideas width={330} />
              </div>
            </Pic>
          </Plate>
        </div>

        <div className="mt-20 flex items-center gap-16">
          <Plate w={640} h={430} at={2050} horizon={0.46}>
            <Pic width={640} height={430} className="absolute inset-0">
              <div className="absolute top-[72px] left-12 h-[400px] w-[400px] rounded-kit-object bg-kit-object px-6 pt-5 shadow-kit-lifted">
                <div className="font-kit-mono text-[11px] text-kit-ink-muted">Draft for LinkedIn · from your voice note</div>
                <div className="mt-4">
                  <Draft width={240} gap={14} note={110} size={14.5} labels={["did", "happened", "meant"]} />
                </div>
                <div className="mt-6">
                  <ApproveRow when="" />
                </div>
              </div>
            </Pic>
          </Plate>
          <div className="flex w-[368px] flex-none flex-col gap-8">
            <Step n={3} title="It drafts in three beats">
              What I did, what happened, what it meant. The number goes on its
              own line, next to your usual week.
            </Step>
            <Step n={4} title="You approve">
              Nothing goes out until you press Approve. Change a word first if
              one is wrong.
            </Step>
          </div>
        </div>

        <div className="mt-20 flex items-center gap-16">
          <div className="flex w-[368px] flex-none flex-col gap-8">
            <Step n={5} title="It lands in your week">
              An approved post takes its slot on X or LinkedIn. If Thursday is
              wrong, move it.
            </Step>
          </div>
          <Plate w={640} h={360} at={2900} horizon={0.58}>
            <Pic width={640} height={360} className="absolute inset-0">
              <Window url="hirequincy.com/week" className="absolute top-12 left-12 h-[360px] w-[640px]">
                <div className="h-full bg-kit-object px-7 pt-5">
                  <div className="text-[15px] font-[600]">This week</div>
                  <div className="mt-3">
                    <Week width={500} />
                  </div>
                </div>
              </Window>
            </Pic>
          </Plate>
        </div>
      </section>

      {/* Numbers */}
      <section className="px-16 pt-[136px]">
        <div className="text-center">
          <h2 className="text-[48px] leading-[1.05] font-[600] tracking-[-0.045em]">Your posts. Your median.</h2>
          <p className="mx-auto mt-4 max-w-[52ch] text-[17px] leading-[1.55] text-kit-ink-muted">
            Each post is measured against your usual one. Quincy has no
            follower chart. Reach follows the post now, not the account.
          </p>
        </div>
        <div className="mt-12">
          <Plate w={1072} h={400} at={3700} horizon={0.62}>
            <Pic width={1072} height={400} className="absolute inset-0">
              <Window url="hirequincy.com/numbers" className="absolute top-14 left-[64px] h-[400px] w-[944px]">
                <div className="flex h-full bg-kit-object">
                  <Side active="Numbers" />
                  <div className="px-9 pt-7">
                  <Numbers
                    width={570}
                    ring={
                      <span className="mr-1">
                        <Ring tone="pen">3.4× your median</Ring>
                      </span>
                    }
                  />
                  </div>
                </div>
              </Window>
              <div className="absolute top-[156px] left-[866px]">
                <Hand tone="pen">this one, again</Hand>
              </div>
            </Pic>
          </Plate>
        </div>
      </section>

      {/* Held for your read */}
      <section className="flex items-center gap-16 px-16 pt-[136px]">
        <div className="w-[440px] flex-none">
          <h2 className="text-[38px] leading-[1.08] font-[600] tracking-[-0.04em]">It shows its work. You decide.</h2>
          <p className="mt-4 text-[16px] leading-[1.6] text-kit-ink-muted text-pretty">
            Every run ends in a receipt of what Quincy read and what it made.
            The last line is always the same. There is no switch that turns
            approval off.
          </p>
        </div>
        <Plate w={568} h={330} at={4500} horizon={0.66}>
          <Pic width={568} height={330} className="absolute inset-0">
            <div className="absolute top-12 left-12 h-[330px] w-[456px] rounded-kit-object bg-kit-object px-6 pt-5 shadow-kit-lifted">
              <Who quincy>Thursday 07:12</Who>
              <div className="mt-4">
                <Checks lines={RUN} />
              </div>
              <div className="mt-5 w-[300px]">
                <Margin note="every time" gap={14} width={110}>
                  <div className="text-[14px] leading-[1.55]">
                    Nothing went out. It waits for you, parked for 08:00.
                  </div>
                </Margin>
              </div>
            </div>
          </Pic>
        </Plate>
      </section>

      {/* Depth, as an aim */}
      <section className="mx-16 mt-[136px] grid grid-cols-[1fr_1fr] gap-16 border-t border-kit-hairline pt-12">
        <div>
          <p className="text-[14px] text-kit-ink-muted">Where this is going</p>
          <h2 className="mt-2 text-[34px] leading-[1.1] font-[600] tracking-[-0.035em]">Views are rented. People are yours.</h2>
        </div>
        <p className="pt-7 text-[16px] leading-[1.6] text-kit-ink-muted text-pretty">
          The next thing Quincy learns is who keeps showing up. The people who
          reply, then reply again. It will draft an answer for each of them, and
          you will send those too. It does not do this yet.
        </p>
      </section>

      {/* Price */}
      <section className="mx-16 mt-[120px] grid grid-cols-[360px_1fr] gap-16">
        <div>
          <h2 className="text-[34px] leading-[1.1] font-[600] tracking-[-0.035em]">One plan.</h2>
          <div className="mt-5">
            <PriceFigure />
          </div>
          <ul className="mt-5 flex flex-col gap-1.5 text-[15px] text-kit-ink-muted">
            {PRICE_LINES.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
        <dl className="flex flex-col">
          {NEVER.map((r) => (
            <div key={r.never} className="grid grid-cols-[300px_1fr] gap-8 border-t border-kit-hairline py-4 text-[15px] leading-[1.5]">
              <dt className="font-[560]">{r.never}</dt>
              <dd className="text-kit-ink-muted">{r.because}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* The end of the walk */}
      <div className="mt-[136px] px-16 pb-16">
        <Plate w={1072} h={460} at={5600} horizon={0.68}>
          <div className="absolute inset-x-0 top-[72px] flex flex-col items-center text-center">
            <h2 className="text-[48px] leading-[1.05] font-[600] tracking-[-0.045em]">Start with one voice note.</h2>
            <p className="mt-3 text-[17px] text-kit-ink-muted">Quincy drafts it. You send it, or you don&apos;t.</p>
            <div className="mt-8">
              <Waitlist tone="object" />
            </div>
          </div>
        </Plate>
      </div>

      <Footer />
    </Sheet>
  )
}
