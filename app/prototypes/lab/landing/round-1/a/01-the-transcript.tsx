"use client"

import * as React from "react"

import { useInView } from "@/components/kit"

import { Canvas } from "./canvas"
import { aNewsreader } from "./fonts"
import { Cta, Hand, Hl, Margin, TopLine } from "./marks"

/**
 * The hero is a voice-note transcript set like a book page. On first sight
 * the highlighter sweeps the one line, then Quincy writes in the margin. The
 * headline comes after the page: you read what was said before you are told
 * what Quincy is.
 */
export default function TheTranscript() {
  const [ref, seen] = useInView<HTMLDivElement>({ threshold: 0.5 })

  return (
    <Canvas>
      <TopLine />

      <div ref={ref} className="absolute top-[100px] left-[120px] w-[790px]">
        <p className="font-kit-mono text-[13px] text-kit-ink-muted">
          voice note · Tuesday 08:12 · 2 min 14 s, on a walk
        </p>
        <div
          className={`${aNewsreader.className} mt-5 flex flex-col gap-4 text-[29px] leading-[1.4] tracking-[-0.005em] text-kit-ink`}
        >
          <p>
            Okay, quick one before I forget. This week we cut the onboarding
            email down to one question. Just, what are you trying to get done?
            I honestly thought nobody would answer it.
          </p>
          <Margin note="this is the post" show={seen} delay={1100} gap={36}>
            <p>
              <Hl sweep delay={250}>Thirty-one people wrote back in the first week.</Hl>{" "}
              We usually get six.
            </p>
          </Margin>
          <p className="text-kit-ink-muted">
            I think people answer a question and skip a brochure. Anyway.
            Remind me to tell the team.
          </p>
        </div>
      </div>

      <div className="absolute top-[500px] left-[120px] w-[960px]">
        <h1 className="max-w-[20ch] text-[44px] leading-[1.08] font-[600] tracking-[-0.03em]">
          The post was already in what you said.
        </h1>
        <div className="mt-5 flex items-end justify-between gap-12">
          <p className="max-w-[46ch] text-[17px] leading-[1.5] text-kit-ink-muted">
            Quincy reads your voice notes and the pull requests you merge, marks
            the one line worth posting, and drafts it in your voice for X and
            LinkedIn. Nothing goes out until you send it.
          </p>
          <Cta>Join the waitlist</Cta>
        </div>
      </div>

      {/* The first section: the line, drafted. Cropped by the frame on purpose. */}
      <section className="absolute top-[770px] right-0 left-0 h-[130px] bg-kit-stage">
        <div className="absolute top-7 left-[120px] w-[260px]">
          <h2 className="text-[17px] font-[600] tracking-[-0.01em]">Then it drafts the post.</h2>
          <p className="mt-1 text-[15px] leading-[1.45] text-kit-ink-muted">
            Three beats, the number on its own line. You send it.
          </p>
        </div>
        <div className="absolute top-6 left-[440px] w-[520px] rounded-t-kit-object bg-kit-object px-7 pt-6 pb-10 shadow-kit-object">
          <div className="flex items-baseline justify-between">
            <span className="font-kit-mono text-[12px] text-kit-ink-muted">Draft for LinkedIn</span>
            <Hand size={22}>from Tuesday&apos;s walk</Hand>
          </div>
          <p className="mt-3 text-[16px] leading-[1.5]">
            I cut our onboarding email down to one question.
          </p>
          <p className="mt-2 text-[16px] leading-[1.5] text-kit-ink-muted">Replies in the first week:</p>
          <p className="text-[26px] leading-[1.3] font-[600] tabular-nums">31</p>
        </div>
      </section>
    </Canvas>
  )
}
