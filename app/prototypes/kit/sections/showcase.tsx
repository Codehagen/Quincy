import * as React from "react"

import { BentoDemo } from "@/components/showcase/demos/bento"
import { ChannelsCard } from "@/components/showcase/demos/channels-card"
import { HeroDemo } from "@/components/showcase/demos/hero"
import { MedianCard } from "@/components/showcase/demos/median-card"
import { FeatureCard } from "@/components/showcase/feature-card"

import { Replay } from "../../showcase/replay"
import { Code, P, Plate, type Section } from "../doc"

/*
 * The four showcase demos, as the landing page will use them. Each plays
 * once and holds; Replay remounts it, so the return to the opening frame has
 * a cause. Under reduced motion each shows its poster, the held ending.
 */
export const showcase: Section[] = [
  {
    id: "showcase",
    title: "Showcase",
    group: "Showcase",
    doc: "showcase.md",
    body: (
      <>
        <P>
          Pictures of Quincy for the landing page and docs, after Stageshow.
          Never inside the app: there, <Code>Stage</Code>, <Code>Window</Code>{" "}
          and <Code>Button</Code> come from the kit. Simplified, framed by a
          crop, every motion caused, played once and held. Data never rewinds
          in view.
        </P>
        <Plate caption="HeroDemo. Window in a corner bleed: the angle is highlighted, the draft arrives in three beats, the cursor approves, the slot flies into Thursday and holds.">
          <Replay label="hero demo">
            <HeroDemo />
          </Replay>
        </Plate>
      </>
    ),
  },
  {
    id: "feature-cards",
    title: "Feature cards",
    group: "Showcase",
    doc: "showcase.md",
    body: (
      <>
        <P>
          One claim, one picture. The claim is page text above; the picture is
          pinned to the bottom edge and cut by it. When the system acts on its
          own there is no cursor.
        </P>
        <Plate caption="MedianCard. Thirty posts against their own median; one clears it at 3.4×.">
          <Replay label="median card">
            <FeatureCard
              lead="Every number is against your own median."
              rest="No follower counts. Just whether this post beat your usual."
              height={420}
            >
              <MedianCard />
            </FeatureCard>
          </Replay>
        </Plate>
        <Plate caption="ChannelsCard. One idea, a different first line per channel.">
          <Replay label="channels card">
            <FeatureCard
              lead="One idea, a different first line per channel."
              rest="Rewritten for each feed, never pasted."
              height={420}
            >
              <ChannelsCard />
            </FeatureCard>
          </Replay>
        </Plate>
      </>
    ),
  },
  {
    id: "bento",
    title: "Bento",
    group: "Showcase",
    doc: "showcase.md",
    body: (
      <>
        <P>
          Five claims as one picture, for the landing page only: inside the app
          bento splits were discarded. Each tile is its own stage at 1:1; two of
          five show product UI and only one has window chrome. This column is
          narrower than 600px, so the grid stacks its tiles in one column here.
        </P>
        <Plate caption="BentoDemo. Each tile plays one beat, once, 110ms after the one before it.">
          <Replay label="feature grid">
            <BentoDemo />
          </Replay>
        </Plate>
      </>
    ),
  },
]
