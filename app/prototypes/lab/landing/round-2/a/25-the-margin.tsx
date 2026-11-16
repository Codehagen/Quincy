"use client"

/*
 * 25 — The margin.
 *
 * From both kept pieces' marks: the highlighter, the graphite note, the blue
 * pen. Pushed: the page has an editor's margin. Under the hero a wide
 * column on the left runs to the footer, and Quincy's handwriting fills it,
 * one note per section, each beside a close-up of the product taken at 1.4×
 * so the marks are as large as the words. The fewest pictures of the five,
 * and the biggest. The wallpaper comes back once, under the last line, and
 * the phone once, for the number.
 */

import { Phone, Window } from "@/components/showcase"

import { BracketLine, Hand, Hl, Ring } from "../../round-1/a/marks"
import { Pointer } from "../../round-1/b/frame"

import { Sheet } from "./sheet"
import { Cta, Footer, Hills, NEVER, Pic, PRICE_LINES, PriceFigure, TopLine, Waitlist } from "./parts"
import { Checks, RUN } from "./product"

const SCREEN = "var(--kit-object)"

/** One section: a note in the margin, the content beside it. */
function Row({
  note,
  tone = "graphite",
  children,
  top = 8,
}: {
  note: React.ReactNode
  tone?: "graphite" | "pen"
  children: React.ReactNode
  top?: number
}) {
  return (
    <div className="grid grid-cols-[248px_1fr] border-t border-kit-hairline">
      <div className="relative pr-8 text-right" style={{ paddingTop: top + 48 }}>
        <Hand tone={tone} size={30}>
          {note}
        </Hand>
      </div>
      <div className="pt-12 pb-[104px]">{children}</div>
    </div>
  )
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[40px] leading-[1.08] font-[600] tracking-[-0.04em]">{children}</h2>
}

function Lead({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 max-w-[52ch] text-[17px] leading-[1.6] text-kit-ink-muted text-pretty">{children}</p>
}

/** A beat, at close-up size: the line, the bracket, the pen. */
function Beat({ label, children, h }: { label: string; children: React.ReactNode; h: number }) {
  return (
    <div className="flex items-stretch gap-5">
      <div className="w-[600px]">{children}</div>
      <div className="flex items-center gap-3" style={{ height: h }}>
        <BracketLine tone="pen" side="right" />
        <Hand tone="pen" size={34}>
          {label}
        </Hand>
      </div>
    </div>
  )
}

export default function TheMargin() {
  return (
    <Sheet>
      <TopLine />

      {/* Hero */}
      <section className="flex flex-col items-center pt-[84px] text-center">
        <h1 className="text-[70px] leading-[1.02] font-[600] tracking-[-0.055em]">Quincy marks it up. You send it.</h1>
        <p className="mt-5 max-w-[50ch] text-[18px] leading-[1.5] text-kit-ink-muted">
          Quincy reads your voice notes, pull requests and notes like an editor
          reads a page. It finds the line worth posting and drafts the post in
          your voice.
        </p>
        <div className="mt-8 flex items-center gap-4">
          <Cta />
          <span className="text-[15px] text-kit-ink-muted">$49 a month, one plan</span>
        </div>
      </section>

      {/* The close-up: a draft at 1.4×, cut by both sides */}
      <div className="relative mt-16 h-[500px] overflow-hidden bg-kit-stage">
        <Pic width={1200} height={500} className="absolute inset-0">
          <Window url="hirequincy.com/studio" className="absolute top-14 left-[150px] h-[640px] w-[1120px]">
            <div className="h-full bg-kit-object px-14 pt-10">
              <div className="font-kit-mono text-[15px] text-kit-ink-muted">Draft for LinkedIn · from your voice note · waiting for you</div>
              <div className="mt-8 flex flex-col gap-7 text-[24px] leading-[1.45] tracking-[-0.01em]">
                <Beat label="what I did" h={35}>
                  <div>I cut our signup form from nine fields to three.</div>
                </Beat>
                <Beat label="what happened" h={120}>
                  <div>
                    <div>A week later, finished signups:</div>
                    <div className="text-[40px] leading-[1.25] font-[600] tracking-[-0.03em] tabular-nums">41% → 68%</div>
                    <div className="text-[19px] text-kit-ink-muted">Your median week is 44%.</div>
                  </div>
                </Beat>
                <Beat label="what it meant" h={35}>
                  <div>
                    <Hl sweep delay={300}>People weren&apos;t lazy. The form was.</Hl>
                  </div>
                </Beat>
              </div>
            </div>
          </Window>
        </Pic>
      </div>

      <div className="mx-16 mt-[104px]">
        {/* Raw material */}
        <Row note="it starts with what you said">
          <H2>Bring the raw thing.</H2>
          <Lead>
            A voice note from a walk, a pull request you merged, notes you paste
            in. Quincy keeps your words and marks the one line worth posting.
            The rest stays as it was.
          </Lead>
          <div className="relative mt-10 h-[260px] overflow-hidden rounded-l-[24px] bg-kit-stage">
            <Pic width={888} height={260} className="absolute inset-0">
              <div className="absolute top-10 left-10 h-[260px] w-[900px] rounded-kit-object bg-kit-object px-8 pt-7 text-[21px] leading-[1.55] shadow-kit-object">
                <div className="font-kit-mono text-[13px] text-kit-ink-muted">voice note · 0:48</div>
                <div className="mt-3 w-[700px] text-kit-ink-muted">
                  &hellip;so we cut the signup form from nine fields to three, and
                  honestly I thought nobody would notice. A week later 68% finish
                  it.{" "}
                  <span className="text-kit-ink">
                    <Hl sweep>People weren&apos;t lazy. The form was.</Hl>
                  </span>{" "}
                  Anyway, the other thing&hellip;
                </div>
              </div>
            </Pic>
          </div>
        </Row>

        {/* Three beats */}
        <Row note="every draft, three beats" tone="pen">
          <H2>Did. Happened. Meant.</H2>
          <Lead>
            Each draft has three beats, in the first person. The number goes on
            its own line, next to your usual week. You saw it above at full
            size, with the pen still on it.
          </Lead>
          <div className="mt-8 grid grid-cols-3 gap-6 text-[15px] leading-[1.5]">
            {[
              ["what I did", "The change, in one sentence."],
              ["what happened", "The number, on a line of its own."],
              ["what it meant", "What you learned. Usually the line you said out loud."],
            ].map(([k, v]) => (
              <div key={k} className="border-t border-kit-hairline pt-4">
                <Hand tone="pen" size={26}>
                  {k}
                </Hand>
                <div className="mt-2 text-kit-ink-muted">{v}</div>
              </div>
            ))}
          </div>
        </Row>

        {/* Approve */}
        <Row note="the one press that is yours">
          <H2>Nothing goes out until you press it.</H2>
          <Lead>
            Approve, or change a word first. Then it waits in your week, on X or
            LinkedIn. There is no switch that sends without you.
          </Lead>
          <div className="relative mt-10 h-[220px] overflow-hidden rounded-l-[24px] bg-kit-stage">
            <Pic width={888} height={220} className="absolute inset-0">
              <div className="absolute top-12 left-12 h-[220px] w-[900px] rounded-kit-object bg-kit-object px-9 pt-9 shadow-kit-object">
                <div className="flex items-center gap-4">
                  <span className="inline-flex h-[60px] items-center rounded-[16px] bg-kit-action px-8 text-[22px] font-[560] text-kit-action-on">
                    Approve
                  </span>
                  <span className="inline-flex h-[60px] items-center rounded-[16px] bg-kit-control px-7 text-[22px] font-[560] shadow-kit-control">
                    Edit
                  </span>
                  <span className="ml-4 font-kit-mono text-[17px] text-kit-ink-muted">Thu 08:00 · LinkedIn</span>
                </div>
                <div className="absolute" style={{ left: 120, top: 66, transform: "scale(1.4)", transformOrigin: "0 0" }}>
                  <Pointer style={{ left: 0, top: 0 }} />
                </div>
              </div>
            </Pic>
          </div>
        </Row>

        {/* Numbers: the phone, once */}
        <Row note="against you, never followers" tone="pen">
          <div className="grid grid-cols-[1fr_360px] gap-10">
            <div>
              <H2>One number, and your usual one.</H2>
              <Lead>
                Reach follows the post now, not the account. So every post is set
                against your own median, and the follower count is not in Quincy
                at all.
              </Lead>
            </div>
            <div className="relative h-[340px] overflow-hidden rounded-t-[24px] bg-kit-stage">
              <div className="absolute top-10 left-[40px]">
                <Pic width={280} height={600}>
                  <Phone width={280} time="10:14" wallpaper={SCREEN}>
                    <div className="flex flex-col px-5 pt-4">
                      <div className="text-[14px] text-kit-ink-muted">Thursday 08:00 · LinkedIn</div>
                      <div className="mt-2 text-[18px] leading-[1.45]">I cut our signup form from nine fields to three.</div>
                      <div className="mt-6 text-[14px] text-kit-ink-muted">Views at 48 hours</div>
                      <div className="text-[48px] leading-[1.1] font-[600] tracking-[-0.03em] tabular-nums">4,210</div>
                      <div className="mt-2 ml-3 text-[18px] font-[560]">
                        <Ring tone="pen">3.4× your median</Ring>
                      </div>
                      <div className="mt-2 text-[15px] text-kit-ink-muted">Your median is 1,240.</div>
                    </div>
                  </Phone>
                </Pic>
              </div>
            </div>
          </div>
        </Row>

        {/* Held */}
        <Row note="how every run ends">
          <H2>Held for your read.</H2>
          <div className="mt-8 w-[560px] rounded-[22px] bg-kit-stage p-7">
            <Checks lines={RUN} size={17} />
            <div className="mt-5 text-[17px] leading-[1.55]">Nothing went out. It waits for you.</div>
          </div>
        </Row>

        {/* Depth */}
        <Row note="not yet">
          <H2>Then the people who keep showing up.</H2>
          <Lead>
            Views are rented. The people who reply are yours. Next, Quincy
            learns who keeps replying and drafts an answer to each of them, for
            you to send. It does not do this today.
          </Lead>
        </Row>

        {/* Price */}
        <Row note="one line on the bill">
          <div className="grid grid-cols-[280px_1fr] gap-12">
            <div>
              <PriceFigure />
              <div className="mt-4 text-[15px] leading-[1.6] text-kit-ink-muted">
                {PRICE_LINES.map((l) => (
                  <div key={l}>{l}</div>
                ))}
              </div>
            </div>
            <div className="flex flex-col">
              {NEVER.map((r) => (
                <div key={r.never} className="border-b border-kit-hairline py-3.5 first:pt-0">
                  <div className="text-[16px] font-[560]">{r.never}</div>
                  <div className="mt-0.5 text-[15px] leading-[1.5] text-kit-ink-muted">{r.because}</div>
                </div>
              ))}
            </div>
          </div>
        </Row>
      </div>

      {/* Final, on the hills */}
      <div className="px-16 pb-16">
        <div className="relative h-[440px] overflow-hidden rounded-[26px]">
          <Hills width={1072} height={440} at={300} horizon={0.7} />
          <div className="absolute inset-x-0 top-[70px] flex flex-col items-center text-center">
            <h2 className="text-[48px] leading-[1.05] font-[600] tracking-[-0.045em]">Your next page, marked up.</h2>
            <div className="mt-8">
              <Waitlist tone="object" />
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </Sheet>
  )
}
