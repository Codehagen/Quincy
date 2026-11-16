import * as React from "react"

import { MarketingButton } from "@/components/marketing/button"
import { SectionHeading } from "@/components/marketing/section"
import { WaitlistForm } from "@/components/marketing/waitlist-form"
import { HeldPicture } from "@/components/showcase/demos/held-picture"
import { HeroPicture } from "@/components/showcase/demos/hero-picture"
import { IdeasPicture } from "@/components/showcase/demos/ideas-picture"
import { ReadsAndPosts, type Connector } from "@/components/showcase/demos/reads-and-posts"
import { TextsPicture } from "@/components/showcase/demos/texts-picture"
import { channelLabel } from "@/lib/channels"
import { CONNECTABLE_CHANNELS } from "@/lib/schema-app"
import { SOURCES } from "@/lib/sources"

import { Code, Compare, P, type Section } from "../doc"
import {
  KitButtons,
  KitChoices,
  KitForm,
  KitHeldDraft,
  KitIdeas,
  KitPageHeader,
  KitQuotedSource,
  KitSources,
} from "../landing-demos"

/*
 * Round 1 of "the landing is the reference" (2026-11-16): each kit component
 * rebuilt to match the landing, beside the landing piece it was measured
 * from. The landing half is the real component from components/showcase or
 * components/marketing, never a copy.
 */

// The same rows the landing feeds ReadsAndPosts (components/marketing/home.tsx).
const LIVE = ["voice", "github", "circleback"]
const READS: Connector[] = [
  ...LIVE.flatMap((id) => SOURCES.filter((s) => s.id === id)),
  { id: "paste", label: "Pasted text", gives: "Notes you paste in" },
]
const NEXT: Connector[] = SOURCES.filter((s) => !LIVE.includes(s.id))
const POSTS: Connector[] = CONNECTABLE_CHANNELS.map((c) => ({
  id: c,
  label: channelLabel(c),
  gives: "Posts at the time you approved",
}))

export const landing: Section[] = [
  {
    id: "landing",
    title: "Landing and kit",
    group: "Reference",
    doc: "README.md",
    body: (
      <>
        <P>
          The landing page is the reference. Each pair puts the landing piece
          (left, or above) beside the kit component rebuilt to look like it
          (right, or below). The page ground is white; the grey is only a
          recess inside an object or a picture&apos;s backdrop. The primary
          button is ink, as the landing&apos;s call to action. Blue is left for
          the pen.
        </P>
        <Compare
          caption={
            <>
              <Code>Button</Code>: the ink pill and the white pill, 36px (md) and
              44px (lg), 16 and 22 at the sides, as <Code>MarketingButton</Code>.{" "}
              <Code>IconButton</Code> stays round; <Code>MenuTrigger</Code> is a pill.
            </>
          }
          landing={
            <div className="flex flex-col gap-kit-group">
              <div className="flex flex-wrap items-center gap-kit-controls">
                <MarketingButton size="lg">Join the waitlist</MarketingButton>
                <MarketingButton size="lg" variant="quiet">
                  How it works
                </MarketingButton>
              </div>
              <div className="flex flex-wrap items-center gap-kit-controls">
                <MarketingButton>Join the waitlist</MarketingButton>
                <MarketingButton variant="quiet">Pricing</MarketingButton>
              </div>
            </div>
          }
          kit={<KitButtons />}
        />
        <Compare
          caption={
            <>
              <Code>Card</Code> on the ground, 28 × 24 padding from 40rem (18 on
              a phone), the held draft&apos;s 20px groups. Approve is the ink pill
              here; the picture still paints it blue.
            </>
          }
          landing={<HeldPicture />}
          kit={<KitHeldDraft />}
        />
        <Compare
          caption={
            <>
              <Code>List</Code> and <Code>ListRow</Code>: rows 16px in, 4px apart,
              the picked one in the selected grey with ink, never blue.{" "}
              <Code>Tag</Code> is the &quot;Next&quot; chip: ring, no fill, 24px.
            </>
          }
          landing={<IdeasPicture />}
          kit={<KitIdeas />}
        />
        <Compare
          stack
          caption={
            <>
              Rows with a glyph and a status, and the <Code>Tags</Code> under them.
            </>
          }
          landing={<ReadsAndPosts reads={READS} posts={POSTS} next={NEXT} />}
          kit={<KitSources next={NEXT.map((c) => c.label)} />}
        />
        <Compare
          stack
          caption={
            <>
              <Code>Well</Code>: the pull request quoted back inside the object,
              12 at the sides, 10 top and bottom, lines 4px apart.
            </>
          }
          landing={
            <div className="h-[22rem] overflow-hidden rounded-kit-stage">
              <HeroPicture />
            </div>
          }
          kit={
            <div className="max-w-[34rem]">
              <KitQuotedSource />
            </div>
          }
        />
        <Compare
          caption={
            <>
              <Code>Segmented</Code> takes the picked reply chip: an ink pill
              sliding in a white pill. <Code>Switch</Code> is on in ink.
            </>
          }
          landing={<TextsPicture />}
          kit={<KitChoices />}
        />
        <Compare
          caption={
            <>
              <Code>Field</Code>, <Code>Input</Code> and <Code>Textarea</Code> were
              already the landing&apos;s (the waitlist form is built from them);
              only the submit button changed. The landing form is inert here, so
              nothing reaches the waitlist.
            </>
          }
          landing={
            <div inert>
              <WaitlistForm id="kit-lab-waitlist" source="kit-lab" />
            </div>
          }
          kit={<KitForm />}
        />
        <Compare
          caption={
            <>
              <Code>KitPage</Code>: the title is 28px at 600 (the landing&apos;s
              display-md at its phone size), the summary sits under it in muted,
              64px from the top, 56px to the first stage.
            </>
          }
          landing={
            <SectionHeading id="kit-lab-heading" size="md" align="start" title="It counts against you.">
              A feed judges the post, not the account. So each post is set against your own median.
            </SectionHeading>
          }
          kit={<KitPageHeader />}
        />
      </>
    ),
  },
]
