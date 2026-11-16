"use client"

/*
 * 23 — Desk and pocket.
 *
 * Both kept pictures at once: 05's window on the grey wallpaper, and 09's
 * phone, here as a satellite straddling the window's edge. One event told
 * twice: the pull request you merged at your desk, and the draft it became,
 * waiting on your phone with Approve. The denser page of the five: how it
 * works is a row of five small cropped tiles, the numbers sit in a window
 * on the hills again, and the middle of the page is one sentence in type.
 */

import { Phone, Window } from "@/components/showcase"

import { Hand, Hl, Margin, Ring } from "../../round-1/a/marks"
import { Pointer } from "../../round-1/b/frame"

import { Sheet } from "./sheet"
import { Cta, Footer, Hills, NEVER, Pic, PRICE_LINES, PriceFigure, TopLine, Waitlist } from "./parts"
import { Checks, Ideas, Numbers, Side, Week } from "./product"

const SCREEN = "var(--kit-object)"

const PR_RUN = [
  ["Read #212", "4 paragraphs, 184 lines"],
  ["Found the number", "27 tickets to 2"],
  ["Cut the backstory", "it reads fine without it"],
  ["Drafted", "1 for X, 1 for LinkedIn, held for your read"],
] as const

function PhoneDraft() {
  return (
    <div className="flex flex-col gap-3 px-5 pt-4 text-[18px] leading-[1.45]">
      <div className="text-[14px] text-kit-ink-muted">Draft for X · from #212</div>
      <div>Invoices now go out in the customer&apos;s own currency.</div>
      <div>
        <div>Currency tickets, first week:</div>
        <div className="text-[1.5em] leading-[1.3] font-[600] tracking-[-0.02em] tabular-nums">27 → 2</div>
      </div>
      <div>Nobody minded the price. They could not read the bill.</div>
      <div className="mt-2 flex items-center gap-2">
        <span className="inline-flex h-11 flex-1 items-center justify-center rounded-[14px] bg-kit-action text-[16px] font-[560] text-kit-action-on">
          Approve
        </span>
        <span className="inline-flex h-11 items-center rounded-[14px] bg-kit-control px-5 text-[16px] font-[560] shadow-kit-control">
          Edit
        </span>
      </div>
      <div className="text-center font-kit-mono text-[13px] text-kit-ink-muted">Mon 08:00 · X</div>
    </div>
  )
}

function Tile({ n, title, body, children }: { n: number; title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="relative h-[360px] overflow-hidden rounded-[20px] bg-kit-stage">
      <div className="px-5 pt-5">
        <div className="font-kit-mono text-[12px] text-kit-ink-muted">0{n}</div>
        <div className="mt-1.5 text-[16px] font-[600] tracking-[-0.01em]">{title}</div>
        <div className="mt-1 text-[14px] leading-[1.45] text-kit-ink-muted text-pretty">{body}</div>
      </div>
      {children}
    </div>
  )
}

export default function DeskAndPocket() {
  return (
    <Sheet>
      <TopLine />

      {/* Hero */}
      <section className="flex flex-col items-center pt-[84px] text-center">
        <h1 className="text-[72px] leading-[1] font-[600] tracking-[-0.06em]">You ship. It drafts.</h1>
        <p className="mt-5 max-w-[50ch] text-[18px] leading-[1.5] text-kit-ink-muted">
          Quincy reads the pull requests you merge, finds the post in them and
          drafts it in your voice. You approve it at your desk or from your
          phone.
        </p>
        <div className="mt-8 flex items-center gap-4">
          <Cta />
          <span className="text-[15px] text-kit-ink-muted">$49 a month, one plan</span>
        </div>
      </section>

      <div className="relative mx-16 mt-16 h-[640px] overflow-hidden rounded-[26px]">
        <Hills width={1072} height={640} at={900} horizon={0.3} />
        <Pic width={1072} height={640} className="absolute inset-0">
          <Window url="hirequincy.com/studio" className="absolute top-14 left-12 h-[640px] w-[820px]">
            <div className="flex h-full bg-kit-object">
              <Side width={160} />
              <div className="min-w-0 flex-1 px-7 pt-6">
                <div className="flex items-center gap-3 font-kit-mono text-[12px] text-kit-ink-muted">
                  <span>#212</span>
                  <span>merged Friday 16:40</span>
                  <span>+184 −61</span>
                </div>
                <div className="mt-2.5 text-[18px] leading-[1.3] font-[600] tracking-[-0.015em]">
                  Send invoices in the customer&apos;s own currency
                </div>
                <div className="mt-4 flex w-[330px] flex-col gap-3 text-[14px] leading-[1.55]">
                  <Margin note="they weren't there" gap={18} width={120}>
                    <div className="text-kit-ink-muted">
                      Every invoice went out in USD, wherever the customer was.
                      Support got a currency ticket most days.
                    </div>
                  </Margin>
                  <Margin note="the number" gap={18} width={120}>
                    <div>
                      <Hl sweep>Currency tickets since Monday: 2.</Hl> The week
                      before: 27.
                    </div>
                  </Margin>
                </div>
                <div className="mt-6 border-t border-kit-hairline pt-5">
                  <div className="flex items-center gap-2 text-[13px]">
                    <span className="font-[600]">Quincy</span>
                    <span className="text-kit-ink-muted">Friday 16:52</span>
                  </div>
                  <div className="mt-3">
                    <Checks lines={PR_RUN} />
                  </div>
                </div>
              </div>
            </div>
          </Window>
          <div className="absolute top-[150px] left-[760px]">
            <Pic width={280} height={600}>
              <Phone width={280} time="17:03" wallpaper={SCREEN}>
                <PhoneDraft />
              </Phone>
            </Pic>
          </div>
        </Pic>
      </div>

      {/* How it works: five tiles */}
      <section className="px-16 pt-[128px]">
        <div className="flex items-end justify-between">
          <h2 className="text-[44px] leading-[1.05] font-[600] tracking-[-0.045em]">
            Five steps.
            <br />
            You take two of them.
          </h2>
          <p className="max-w-[40ch] pb-1 text-[16px] leading-[1.55] text-kit-ink-muted">
            Material in, a draft out, and nothing in between that sends on its
            own. It works from pull requests, voice notes and notes you paste.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-5 gap-4">
          <Tile n={1} title="You merge" body="Or talk on a walk, or paste your notes.">
            <div className="absolute top-[200px] left-5 h-[200px] w-[260px] rounded-kit-object bg-kit-object px-4 py-3.5 shadow-kit-object">
              <div className="font-kit-mono text-[11px] text-kit-ink-muted">#212 · merged</div>
              <div className="mt-1.5 text-[14px] leading-[1.35] font-[600]">Send invoices in the customer&apos;s own currency</div>
              <div className="mt-2.5 flex flex-col gap-1.5">
                <span className="h-1.5 w-[200px] rounded-full bg-kit-skeleton" />
                <span className="h-1.5 w-[170px] rounded-full bg-kit-skeleton" />
                <span className="h-1.5 w-[190px] rounded-full bg-kit-skeleton" />
                <span className="h-1.5 w-[120px] rounded-full bg-kit-skeleton" />
                <span className="h-1.5 w-[180px] rounded-full bg-kit-skeleton" />
                <span className="h-1.5 w-[150px] rounded-full bg-kit-skeleton" />
              </div>
            </div>
          </Tile>
          <Tile n={2} title="It finds ideas" body="Two or three, named by where they came from.">
            <div className="absolute top-[160px] left-5">
              <Ideas width={300} />
            </div>
          </Tile>
          <Tile n={3} title="It drafts" body="Three beats, the number on its own line.">
            <div className="absolute top-[160px] left-5 h-[240px] w-[280px] rounded-kit-object bg-kit-object px-4 pt-4 shadow-kit-object text-[14px] leading-[1.45]">
              <div>Currency tickets:</div>
              <div className="mt-1 ml-2 text-[22px] leading-[1.3] font-[600] tabular-nums">
                <Ring tone="pen">27 → 2</Ring>
              </div>
              <div className="mt-4 text-kit-ink-muted">Nobody minded the price.</div>
              <div className="mt-3">
                <Hand tone="pen" size={22}>what happened</Hand>
              </div>
            </div>
          </Tile>
          <Tile n={4} title="You approve" body="Nothing goes out before this press.">
            <div className="absolute top-[236px] left-5 h-[220px] w-[300px] rounded-kit-object bg-kit-object px-4 pt-5 shadow-kit-object">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-10 items-center rounded-kit-control bg-kit-action px-5 text-[15px] font-[560] text-kit-action-on">
                  Approve
                </span>
                <span className="inline-flex h-10 items-center rounded-kit-control bg-kit-control px-4 text-[15px] font-[560] shadow-kit-control">
                  Edit
                </span>
              </div>
              <Pointer style={{ left: 74, top: 38 }} />
            </div>
          </Tile>
          <Tile n={5} title="It waits" body="In your week, on X or LinkedIn.">
            <div className="absolute top-[160px] left-5 h-[240px] w-[340px] rounded-kit-object bg-kit-object px-4 pt-2 shadow-kit-object">
              <Week width={300} />
            </div>
          </Tile>
        </div>
      </section>

      {/* Numbers, on the hills again */}
      <section className="mt-[128px] grid grid-cols-[1fr_340px] items-center gap-14 px-16">
        <div className="relative h-[330px] overflow-hidden rounded-[26px]">
          <Hills width={680} height={330} at={2100} horizon={0.52} />
          <Pic width={680} height={330} className="absolute inset-0">
            <Window url="hirequincy.com/numbers" className="absolute top-12 left-12 h-[330px] w-[700px]">
              <div className="h-full bg-kit-object px-7 pt-6">
                <Numbers width={560} />
              </div>
            </Window>
          </Pic>
        </div>
        <div>
          <h2 className="text-[40px] leading-[1.06] font-[600] tracking-[-0.04em]">Your median, not your followers.</h2>
          <p className="mt-4 text-[16px] leading-[1.6] text-kit-ink-muted text-pretty">
            The feed judges each post on its own now, so Quincy does too. Every
            number sits next to your usual one. A follower chart is not in the
            product, on purpose.
          </p>
        </div>
      </section>

      {/* Held for your read: one sentence */}
      <section className="mx-16 mt-[128px] rounded-[26px] bg-kit-stage px-24 py-20 text-center">
        <div className="flex items-center justify-center gap-2 text-[14px] text-kit-ink-muted">
          <span className="font-[600] text-kit-ink">Quincy</span>
          <span>Friday 16:52</span>
        </div>
        <div className="mx-auto mt-5 max-w-[30ch] text-[40px] leading-[1.15] font-[560] tracking-[-0.035em]">
          Nothing went out. Two drafts are parked for Monday and wait for you.
        </div>
        <div className="mx-auto mt-6 w-fit">
          <Hand>every run ends like this</Hand>
        </div>
        <p className="mx-auto mt-6 max-w-[54ch] text-[16px] leading-[1.6] text-kit-ink-muted">
          Quincy writes in your name, so it never sends on its own. There is no
          switch that turns approval off.
        </p>
      </section>

      {/* Depth + price, side by side */}
      <section className="mx-16 mt-[128px] grid grid-cols-[1fr_1fr] gap-16">
        <div>
          <div className="text-[14px] text-kit-ink-muted">Where this is going</div>
          <h2 className="mt-2 text-[32px] leading-[1.1] font-[600] tracking-[-0.035em]">Views are rented. Replies are yours.</h2>
          <p className="mt-4 text-[16px] leading-[1.6] text-kit-ink-muted text-pretty">
            The next job is knowing who keeps showing up, and drafting a reply
            to each of them. You will send those too. It is not built yet.
          </p>
        </div>
        <div className="rounded-[22px] bg-kit-object p-8 shadow-kit-object">
          <div className="flex items-baseline justify-between">
            <PriceFigure size={56} />
            <span className="text-[14px] text-kit-ink-muted">One plan</span>
          </div>
          <div className="mt-3 text-[15px] leading-[1.6] text-kit-ink-muted">
            {PRICE_LINES.map((l) => (
              <div key={l}>{l}</div>
            ))}
          </div>
          <div className="mt-6 flex flex-col gap-2.5 border-t border-kit-hairline pt-5 text-[15px]">
            {NEVER.map((r) => (
              <div key={r.never}>{r.never}</div>
            ))}
          </div>
        </div>
      </section>

      {/* Final */}
      <section className="mt-[128px] flex flex-col items-center pb-[120px] text-center">
        <h2 className="text-[48px] leading-[1.05] font-[600] tracking-[-0.045em]">Merge on Friday. Read it Monday.</h2>
        <div className="mt-8">
          <Waitlist />
        </div>
      </section>

      <Footer />
    </Sheet>
  )
}
