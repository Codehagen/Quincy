"use client"

/*
 * 24 — The receipt.
 *
 * From the receipt both kept heroes end on. Pushed: the receipt is the
 * page's spine. The hero window shows Quincy's run with its checked lines
 * and one empty circle; below it, a rule runs down the left of the page and
 * each line of the receipt opens into its own section, with its own picture
 * on a plain grey stage. Four lines are ticked by Quincy. The fifth, Approve,
 * is the only one it cannot tick, and the page stops there to say so.
 */

import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon } from "@hugeicons/core-free-icons"
import { Window } from "@/components/showcase"

import { Hand, Margin, Ring } from "../../round-1/a/marks"
import { Pointer } from "../../round-1/b/frame"

import { Sheet } from "./sheet"
import { Cta, Footer, NEVER, Pic, PRICE_LINES, PriceFigure, TopLine, Waitlist } from "./parts"
import { Checks, Draft, Ideas, Numbers, RUN, Side, VoiceNote, Who } from "./product"

function Tick({ open = false, size = 16 }: { open?: boolean; size?: number }) {
  return open ? (
    <span style={{ width: size, height: size }} className="block flex-none rounded-full border-[1.5px] border-kit-ink-muted bg-kit-ground" />
  ) : (
    <span style={{ width: size, height: size }} className="grid flex-none place-items-center rounded-full bg-kit-success text-kit-success-on">
      <HugeiconsIcon icon={Tick02Icon} size={size * 0.68} strokeWidth={2.6} aria-hidden />
    </span>
  )
}

function Line({
  did,
  result,
  open = false,
  faint = false,
  children,
  picture,
}: {
  did: string
  result: string
  open?: boolean
  faint?: boolean
  children: React.ReactNode
  picture?: React.ReactNode
}) {
  return (
    <div className="relative grid grid-cols-[96px_380px_1fr] gap-x-0 pb-[96px]">
      <div className="flex justify-center pt-1.5">
        <div className={faint ? "opacity-50" : ""}>
          <Tick open={open} size={28} />
        </div>
      </div>
      <div className="pr-12">
        <div className={`text-[30px] leading-[1.15] font-[600] tracking-[-0.03em] ${faint ? "text-kit-ink-muted" : ""}`}>{did}</div>
        <div className="mt-1 text-[20px] leading-[1.3] tracking-[-0.01em] text-kit-ink-muted">→ {result}</div>
        <div className="mt-5 text-[16px] leading-[1.6] text-kit-ink-muted text-pretty">{children}</div>
      </div>
      {picture ? <div>{picture}</div> : <div />}
    </div>
  )
}

function Plate({ h, children }: { h: number; children: React.ReactNode }) {
  return (
    <div style={{ height: h }} className="relative w-[596px] overflow-hidden rounded-[24px] bg-kit-stage">
      <Pic width={596} height={h} className="absolute inset-0">
        {children}
      </Pic>
    </div>
  )
}

export default function TheReceipt() {
  return (
    <Sheet>
      <TopLine />

      {/* Hero */}
      <section className="flex flex-col items-center pt-[84px] text-center">
        <h1 className="text-[70px] leading-[1.02] font-[600] tracking-[-0.055em]">It shows its work. You send.</h1>
        <p className="mt-5 max-w-[50ch] text-[18px] leading-[1.5] text-kit-ink-muted">
          Give Quincy a voice note, a merged pull request or your notes. Every
          time, it tells you what it did, and the last line is left for you.
        </p>
        <div className="mt-8 flex items-center gap-4">
          <Cta />
          <span className="text-[15px] text-kit-ink-muted">$49 a month, one plan</span>
        </div>
      </section>

      <div className="relative mx-16 mt-16 h-[520px] overflow-hidden rounded-t-[26px] bg-kit-stage">
        <Pic width={1072} height={520} className="absolute inset-0">
          <Window url="hirequincy.com/studio" className="absolute top-14 left-14 h-[520px] w-[960px]">
            <div className="flex h-full bg-kit-object">
              <Side />
              <div className="min-w-0 flex-1 px-8 pt-7">
                <div className="flex justify-end">
                  <div className="rounded-kit-object bg-kit-stage px-4 py-2.5 text-[14px]">Voice note from my walk. Anything in it?</div>
                </div>
                <div className="mt-6">
                  <Who quincy>07:44</Who>
                </div>
                <div className="mt-4 flex flex-col gap-3 text-[16px]">
                  <Checks lines={RUN} size={16} />
                  <div className="flex items-baseline gap-2.5">
                    <span className="translate-y-[3px]">
                      <Tick open />
                    </span>
                    <span>
                      <span className="font-[560]">Approve</span>
                      <span className="text-kit-ink-muted"> → waiting for you</span>
                    </span>
                  </div>
                </div>
                <div className="mt-6 w-[360px]">
                  <Margin note="yours" tone="pen" gap={14} width={100}>
                    <div className="text-[15px] leading-[1.55]">
                      The draft is below. I left the last line open. Only you
                      can tick that one.
                    </div>
                  </Margin>
                </div>
                <div className="mt-6 w-[440px] rounded-kit-object px-6 pt-5 pb-8 shadow-kit-object">
                  <div className="font-kit-mono text-[11px] text-kit-ink-muted">Draft for LinkedIn · waiting for you</div>
                  <div className="mt-3 text-[15px] leading-[1.5]">I cut our signup form from nine fields to three.</div>
                </div>
              </div>
            </div>
          </Window>
        </Pic>
      </div>

      {/* The spine */}
      <section className="relative mx-16 pt-[120px]">
        <div aria-hidden className="absolute top-[132px] bottom-[96px] left-[47px] w-px bg-kit-hairline" />

        <Line
          did="Listened"
          result="0:48, one voice note"
          picture={
            <Plate h={250}>
              <div className="absolute top-[72px] left-12 rounded-kit-object bg-kit-object p-1.5 shadow-kit-object">
                <VoiceNote width={380} sweep />
              </div>
            </Plate>
          }
        >
          You bring what you already have. A voice note from a walk, a pull
          request you merged, notes you paste in. It keeps your words as they
          were said.
        </Line>

        <Line
          did="Found ideas"
          result="3 in what you said"
          picture={
            <Plate h={340}>
              <div className="absolute top-12 left-[120px] shadow-kit-lifted rounded-kit-object">
                <Ideas width={400} />
              </div>
            </Plate>
          }
        >
          It marks the line worth posting, and names each idea by where it came
          from. Most notes hold two or three.
        </Line>

        <Line
          did="Drafted"
          result="in three beats, in your voice"
          picture={
            <Plate h={380}>
              <div className="absolute top-12 left-12 h-[380px] w-[440px] rounded-kit-object bg-kit-object px-7 pt-6 shadow-kit-object">
                <div className="font-kit-mono text-[11px] text-kit-ink-muted">Draft for LinkedIn</div>
                <div className="mt-4">
                  <Draft width={220} gap={14} note={150} size={15} />
                </div>
              </div>
            </Plate>
          }
        >
          What I did, what happened, what it meant. The number goes on its own
          line. It writes from what you have already published, so it sounds
          like you.
        </Line>

        <Line
          did="Checked your median"
          result="44% finish in a usual week"
          picture={
            <Plate h={300}>
              <Window url="hirequincy.com/numbers" className="absolute top-12 left-6 h-[300px] w-[640px]">
                <div className="h-full bg-kit-object px-7 pt-6">
                  <Numbers
                    width={530}
                    ring={
                      <span className="mr-1">
                        <Ring tone="pen">3.4× your median</Ring>
                      </span>
                    }
                  />
                </div>
              </Window>
            </Plate>
          }
        >
          Every number is set against your own usual post. Quincy has no
          follower chart. Reach follows the post now, not the account.
        </Line>

        <Line
          did="Approve"
          result="waiting for you"
          open
          picture={
            <Plate h={230}>
              <div className="absolute top-[72px] left-12 h-[300px] w-[520px] rounded-kit-object bg-kit-object px-8 pt-8 shadow-kit-object">
                <div className="text-[18px] leading-[1.5]">People weren&apos;t lazy. The form was.</div>
                <div className="mt-6 flex items-center gap-3">
                  <span className="inline-flex h-12 items-center rounded-kit-control bg-kit-action px-6 text-[17px] font-[560] text-kit-action-on">
                    Approve
                  </span>
                  <span className="inline-flex h-12 items-center rounded-kit-control bg-kit-control px-5 text-[17px] font-[560] shadow-kit-control">
                    Edit
                  </span>
                  <span className="ml-2 font-kit-mono text-[13px] text-kit-ink-muted">Thu 08:00 · LinkedIn</span>
                </div>
                <Pointer style={{ left: 104, top: 112 }} />
              </div>
              <div className="absolute top-[24px] left-[300px]">
                <Hand tone="pen">only you tick this one</Hand>
              </div>
            </Plate>
          }
        >
          Quincy writes in your name, so it never sends on its own. Nothing goes
          out until you press Approve, and there is no switch that turns this
          off. Then it waits in your week, on X or LinkedIn.
        </Line>

        <Line did="Next" result="the people who keep showing up" open faint>
          Views are rented. The people who reply are yours. The next line Quincy
          learns is who keeps replying, with a draft answer for each of them
          that you send. It is not built yet, so it has no tick.
        </Line>
      </section>

      {/* Price, as the bill */}
      <section className="mx-16 grid grid-cols-[96px_380px_1fr] border-t border-kit-hairline pt-14">
        <div />
        <div>
          <h2 className="text-[30px] leading-[1.15] font-[600] tracking-[-0.03em]">The bill is one line.</h2>
          <div className="mt-5">
            <PriceFigure />
          </div>
          <div className="mt-4 text-[15px] leading-[1.6] text-kit-ink-muted">
            {PRICE_LINES.map((l) => (
              <div key={l}>{l}</div>
            ))}
          </div>
        </div>
        <div className="flex flex-col">
          {NEVER.map((r) => (
            <div key={r.never} className="border-b border-kit-hairline py-3.5 first:pt-0">
              <div className="text-[15px] font-[560]">{r.never}</div>
              <div className="mt-0.5 text-[14px] leading-[1.5] text-kit-ink-muted">{r.because}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Final */}
      <section className="mt-[136px] flex flex-col items-center pb-[120px] text-center">
        <h2 className="text-[48px] leading-[1.05] font-[600] tracking-[-0.045em]">Leave the last line to you.</h2>
        <div className="mt-8">
          <Waitlist />
        </div>
      </section>

      <Footer />
    </Sheet>
  )
}
