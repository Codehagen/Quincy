import Link from "next/link"

import { PRICE } from "@/app/(marketing)/pricing/copy"
import {
  MarketingButtonLink,
  MarketingShell,
  NavLink,
  Section,
  SectionActions,
  SectionHeading,
  SectionMark,
  SectionPicture,
  WaitlistForm,
} from "@/components/marketing"
import { Friend } from "@/components/mascot"
import { constructMetadata } from "@/lib/metadata"

import { Hero } from "./hero"
import { PRODUCT } from "./name"
import {
  EDITS,
  ExportPicture,
  IngestPicture,
  NOT_YET,
  NothingPicture,
  Rows,
  Steps,
  TranscriptPicture,
} from "./sections"

/**
 * The video editor's own page, a sub-page of the homepage: the same shell,
 * header, footer, sections and waitlist form (components/marketing).
 *
 * Every claim is in plans/031-video-page-facts.md's "Works today" column.
 * What is partly there is worded as such (one recording per cut, export in
 * a browser that can encode video), and what is not built is listed on the
 * page as not built: several takes, music, posting a cut, numbers for one.
 * No customer, no count, no competitor.
 *
 * The hero is the editor with the prompt and its receipt (hero.tsx), the
 * owner's pick of three (docs/design/decisions-landing.md, "Cuts hero").
 */
export const metadata = constructMetadata({
  title: PRODUCT,
  noIndex: true,
})

export default function VideoPage() {
  return (
    <MarketingShell>
      {/* Hero: say the edit, watch it cut. */}
      <Section labelledBy="hero-title" position="first">
        <p className="mb-kit-under-mark text-kit-ink-muted">
          <NavLink href="/">Quincy</NavLink>
          <span aria-hidden> / </span>
          <span className="text-kit-ink">{PRODUCT}</span>
        </p>
        <SectionHeading id="hero-title" size="xl" title={["Say the edit.", "Watch it cut."]}>
          Drop a recording into {PRODUCT} and tell Quincy what you want in a sentence. The timeline changes while
          it works. Every change is an edit you can undo, and nothing leaves until you export it.
        </SectionHeading>
        <SectionActions>
          <MarketingButtonLink href="#join" size="lg">
            Join the waitlist
          </MarketingButtonLink>
          <span className="text-kit-ink-muted">
            Part of Quincy, {PRICE.figure} {PRICE.period}
          </span>
        </SectionActions>
        <SectionPicture width="lg" gap="lg">
          <div className="overflow-hidden rounded-kit-stage">
            <Hero />
          </div>
        </SectionPicture>
      </Section>

      {/* How it works: four steps, the last one yours. */}
      <Section labelledBy="how-title" id="how">
        <SectionHeading id="how-title" title="Four steps. The last one is yours.">
          {PRODUCT} reads the recording before you touch it, so the first thing you do is say what you want.
        </SectionHeading>
        <SectionPicture width="md">
          <IngestPicture />
          <Steps />
        </SectionPicture>
      </Section>

      {/* The transcript as the edit surface. */}
      <Section labelledBy="transcript-title">
        <SectionHeading id="transcript-title" title="Cut the words, and the video follows.">
          The transcript sits beside the timeline. Drag across a sentence and press Delete, and the video loses
          that stretch. The captions keep up, because each word remembers when it was said.
        </SectionHeading>
        <SectionPicture width="md">
          <TranscriptPicture />
        </SectionPicture>
      </Section>

      {/* What it does: only the edits that exist. */}
      <Section labelledBy="edits-title">
        <SectionHeading id="edits-title" title="Say it the way you would say it.">
          These are the edits Quincy can make today. Each one is also a button, so a sentence and a click land as
          the same edit.
        </SectionHeading>
        <SectionPicture width="full" gap="lg">
          <Rows rows={EDITS} state="idle" label="What you can ask for, and what it does" />
        </SectionPicture>
      </Section>

      {/* A tool that changed nothing says so. */}
      <Section labelledBy="nothing-title">
        <SectionHeading id="nothing-title" title="When there is nothing to do, it says so.">
          Every edit reports what it changed. If it changed nothing, you hear that, not a cheerful done.
        </SectionHeading>
        <SectionPicture width="md">
          <NothingPicture />
        </SectionPicture>
      </Section>

      {/* Quincy cuts, you export. */}
      <Section labelledBy="export-title">
        <SectionHeading id="export-title" title="Quincy cuts. You export.">
          The cut waits in the editor until you have watched it. {PRODUCT} does not post video anywhere yet. When
          it does, a cut will wait for your Approve like every post.
        </SectionHeading>
        <SectionPicture width="full" gap="lg">
          <ExportPicture />
        </SectionPicture>
      </Section>

      {/* Not yet: the honest list. */}
      <Section labelledBy="notyet-title">
        <SectionHeading id="notyet-title" title="What it doesn’t do yet.">
          Written down here, so you don’t find out halfway through an edit.
        </SectionHeading>
        <SectionPicture width="full" gap="lg">
          <Rows rows={NOT_YET} state="resting" label="What is not built yet" />
        </SectionPicture>
      </Section>

      {/* Price and the waitlist in one: the price is the plan's, and the page has one form. */}
      <Section labelledBy="join-title" id="join" position="last">
        <SectionMark>
          <Friend state="idle" size={64} />
        </SectionMark>
        <SectionHeading id="join-title" title={`${PRODUCT} comes with Quincy.`}>
          <span id="pricing" className="scroll-mt-kit-under-mark">
            One plan, {PRICE.figure} {PRICE.period}. Editing runs on the same daily limit as the chat.{" "}
            <Link
              href="/#pricing"
              className="rounded-[2px] text-kit-ink underline decoration-kit-link-line underline-offset-(--kit-link-offset) transition-[text-decoration-color] duration-(--kit-duration-state) ease-kit-out hover:decoration-current motion-reduce:transition-none"
            >
              See the plan
            </Link>
          </span>
        </SectionHeading>
        <SectionActions>
          <WaitlistForm id="waitlist-form" source="video-v1" />
        </SectionActions>
      </Section>
    </MarketingShell>
  )
}
