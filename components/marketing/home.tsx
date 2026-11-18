import { PRICE } from "@/app/(marketing)/pricing/copy"
import { Friend } from "@/components/mascot"
import { BeatsPicture } from "@/components/showcase/demos/beats-picture"
import { HeldPicture } from "@/components/showcase/demos/held-picture"
import { HeroPicture } from "@/components/showcase/demos/hero-picture"
import { IdeasPicture } from "@/components/showcase/demos/ideas-picture"
import { MedianPicture } from "@/components/showcase/demos/median-picture"
import { ReadsAndPosts, type Connector } from "@/components/showcase/demos/reads-and-posts"
import { TextsPicture } from "@/components/showcase/demos/texts-picture"
import { channelLabel, isChannelEnabled } from "@/lib/channels"
import { CONNECTABLE_CHANNELS } from "@/lib/schema-app"
import { SOURCES } from "@/lib/sources"

import { MarketingButtonLink } from "./button"
import { NeverList } from "./never-list"
import { Section, SectionActions, SectionHeading, SectionMark, SectionPicture } from "./section"
import { WaitlistForm } from "./waitlist-form"

/**
 * The homepage, built from lab round 3's piece 31 "On the desk", with 34's
 * phone over the desk window as the hero picture and 35's thread at reading
 * size under it (plans/029; the owner's pick, 2026-11-15). Rendered at `/`
 * inside MarketingShell, and at /prototypes/landing for comparison.
 *
 * Every claim is the product's:
 * - What it reads comes from SOURCES in lib/sources.ts. Live: voice notes,
 *   GitHub and Circleback, plus text you paste in Studio, which is not a
 *   connected source and so is not in that list. Everything else there is
 *   "next" and says so.
 * - Where it posts comes from CONNECTABLE_CHANNELS and channelLabel.
 *   Instagram is listed there only when this deployment can connect it.
 *   Until then it sits with the rest, marked as next.
 * - The price and the never lines are the pricing page's (pricing/copy.ts).
 * - No customer, no logo, no signup count, no queue position (plans/023).
 *
 * The one form keeps `source: "landing-top"`, the value the old page's main
 * form stored (7 of its 8 rows), so the series continues.
 */

const LIVE_SOURCES = ["voice", "github", "circleback"]

const PASTE: Connector = { id: "paste", label: "Pasted text", gives: "Notes you paste in" }

function connectors() {
  const reads: Connector[] = [...LIVE_SOURCES.flatMap((id) => SOURCES.filter((s) => s.id === id)), PASTE]
  const instagramOn = isChannelEnabled("instagram")
  const next: Connector[] = [
    ...SOURCES.filter((s) => !LIVE_SOURCES.includes(s.id)),
    ...(instagramOn
      ? []
      : [{ id: "instagram", label: "Instagram", gives: "Captions, once a professional account is connected" }]),
  ]
  const posts: Connector[] = CONNECTABLE_CHANNELS.filter((c) => c !== "instagram" || instagramOn).map((c) => ({
    id: c,
    label: channelLabel(c),
    gives: "Posts at the time you approved",
  }))
  return { reads, next, posts }
}

/** Counts in a sentence read as words. Past nine, the figure. */
function words(n: number) {
  return ["None", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"][n] ?? String(n)
}

export function HomePage() {
  const { reads, next, posts } = connectors()

  return (
    <>
      <Section labelledBy="hero-title" position="first">
        <SectionHeading id="hero-title" size="xl" title={["It finds the post.", "It brings it to you."]}>
          Quincy reads what you merged, said or pasted. When there is a post in it, Quincy writes to you first,
          and the draft waits until you say yes.
        </SectionHeading>
        <SectionActions>
          <MarketingButtonLink href="#join" size="lg">
            Join the waitlist
          </MarketingButtonLink>
          <span className="text-kit-ink-muted">
            {PRICE.figure} {PRICE.period}
          </span>
        </SectionActions>
        <SectionPicture width="lg" gap="lg">
          <HeroPicture />
        </SectionPicture>
      </Section>

      <Section labelledBy="texts-title">
        <SectionHeading id="texts-title" title="It writes to you first.">
          You never open a tool to find out what to post. Quincy sends a few lines when it has something, and
          every one ends with your choice.
        </SectionHeading>
        <SectionPicture width="sm">
          <TextsPicture />
        </SectionPicture>
      </Section>

      <Section labelledBy="sources-title">
        <SectionHeading id="sources-title" title={["It reads where you work.", "It posts where you are."]}>
          {`${words(reads.length)} ways in today, ${words(posts.length).toLowerCase()} ways out. The rest are listed as next until they work.`}
        </SectionHeading>
        <SectionPicture width="md">
          <ReadsAndPosts reads={reads} posts={posts} next={next} />
        </SectionPicture>
      </Section>

      <Section labelledBy="ideas-title" id="how">
        <SectionHeading id="ideas-title" title="It brings you ideas, not a feed.">
          Two or three from one merge, each named by where it came from. You pick the one worth saying.
        </SectionHeading>
        <SectionPicture width="md">
          <IdeasPicture />
        </SectionPicture>
      </Section>

      <Section labelledBy="beats-title">
        <SectionHeading id="beats-title" title="It drafts in three beats.">
          What you did, what happened, what it meant. The number sits on its own line, and you can point at
          where it came from.
        </SectionHeading>
        <SectionPicture width="lg">
          <BeatsPicture />
        </SectionPicture>
      </Section>

      <Section labelledBy="held-title">
        <SectionHeading id="held-title" title="Held for your read.">
          Quincy drafts. You send. A note can ask, and it can wait, but nothing goes out under your name until
          you press Approve.
        </SectionHeading>
        <SectionPicture width="full" gap="lg">
          <HeldPicture />
        </SectionPicture>
      </Section>

      <Section labelledBy="numbers-title" layout="split">
        <SectionHeading id="numbers-title" size="md" align="start" title="It counts against you.">
          A feed judges the post, not the account. So each post is set against your own median, and you never
          see a follower count.
        </SectionHeading>
        <MedianPicture />
      </Section>

      <Section labelledBy="price-title" id="pricing">
        <SectionHeading id="price-title" size="price" title={`${PRICE.figure} ${PRICE.period}.`}>
          One plan. {PRICE.currency}
          {PRICE.tax ? `, ${PRICE.tax}` : ""}. It posts to X and LinkedIn.
        </SectionHeading>
        <SectionPicture width="full" gap="lg">
          <NeverList />
        </SectionPicture>
      </Section>

      {/* Resting, because nothing is running yet. */}
      <Section labelledBy="join-title" id="join" position="last">
        <SectionMark>
          <Friend state="resting" size={64} />
        </SectionMark>
        <SectionHeading id="join-title" title="Quiet until there is something.">
          Invites go out in small groups.
        </SectionHeading>
        <SectionActions>
          <WaitlistForm id="waitlist-form" source="landing-top" />
        </SectionActions>
      </Section>
    </>
  )
}
