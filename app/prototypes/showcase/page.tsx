import { KitRoot } from "@/components/kit"
import { BentoDemo } from "@/components/showcase/demos/bento"
import { ChannelsCard } from "@/components/showcase/demos/channels-card"
import { HeroDemo } from "@/components/showcase/demos/hero"
import { MedianCard } from "@/components/showcase/demos/median-card"
import { FeatureCard } from "@/components/showcase/feature-card"

import { Replay } from "./replay"

/**
 * The showcase: Quincy's faux product UI for the landing page and docs,
 * built on components/showcase (after Stageshow, MIT). Each demo stands on
 * its own with one line saying what it shows. Dev and preview only, through
 * app/prototypes/layout.tsx.
 */
export const metadata = {
  title: "Showcase",
  robots: { index: false, follow: false },
}

function Caption({ children }: { children: React.ReactNode }) {
  return <p className="max-w-[40rem] text-kit-body text-kit-ink-muted">{children}</p>
}

export default function ShowcasePage() {
  return (
    <KitRoot>
      <main className="mx-auto flex min-h-dvh max-w-[61.5rem] flex-col gap-24 px-4 py-16 sm:px-6">
        <section className="flex flex-col gap-4" aria-label="Hero demo">
          <Caption>
            Hero. A voice note becomes a post: Quincy marks the angle, drafts it
            in three beats, and Thursday takes it once you approve.
          </Caption>
          <Replay label="hero demo">
            <HeroDemo />
          </Replay>
        </section>

        <section className="flex flex-col gap-4" aria-label="Median feature card">
          <Caption>
            Feature card. Thirty posts against their own median line; the one
            that cleared it says so in a person’s words.
          </Caption>
          <div className="w-full max-w-[27.5rem]">
            <Replay label="median card">
              <FeatureCard
                lead="Every number is against your own median."
                rest="No follower counts. Just whether this post beat your usual."
                height={420}
              >
                <MedianCard />
              </FeatureCard>
            </Replay>
          </div>
        </section>

        <section className="flex flex-col gap-4" aria-label="Channels feature card">
          <Caption>
            Feature card. One idea, three posts, and each channel opens on its
            own first line.
          </Caption>
          <div className="w-full max-w-[27.5rem]">
            <Replay label="channels card">
              <FeatureCard
                lead="One idea, a different first line per channel."
                rest="Rewritten for each feed, never pasted."
                height={420}
              >
                <ChannelsCard />
              </FeatureCard>
            </Replay>
          </div>
        </section>

        <section className="flex flex-col gap-4" aria-label="Feature grid">
          <Caption>
            Bento. Five tiles as one picture: replies lead, one window, two of
            five tiles show product UI.
          </Caption>
          <Replay label="feature grid">
            <BentoDemo />
          </Replay>
        </section>
      </main>
    </KitRoot>
  )
}
