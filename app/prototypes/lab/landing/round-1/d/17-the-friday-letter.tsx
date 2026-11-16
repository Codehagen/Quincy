"use client"

import { ButtonLink, Highlight, Mono, Text } from "@/components/kit"

import { letterSerif } from "./fonts"
import { Frame, TopLine } from "./frame"

/**
 * The week as a letter. Quincy writes to you on Friday the way a Head of
 * Content would: what you gave it, what it made, what is waiting for you, and
 * how last week's post did against your own median. The letter is the
 * picture, so it is set in a reading serif (Newsreader) while the chrome
 * stays Inter; it runs off the bottom of the frame because a letter is
 * longer than a screen.
 *
 * One accent: the highlighter, on the one sentence in the letter that
 * matters. The invite is a quiet control so nothing competes with it.
 */
export default function TheFridayLetter() {
  return (
    <Frame>
      <div className={`${letterSerif.variable} contents`}>
        <div className="px-14 pt-10">
          <TopLine />
        </div>

        {/* The hero. Centred, because a letter is addressed to one person. */}
        <div className="mx-auto flex max-w-[760px] flex-col items-center pt-12 text-center">
          <Mono>Every Friday</Mono>
          <h1 className="mt-4 font-(family-name:--lab-a-newsreader) text-7xl leading-none font-normal tracking-tight text-balance text-kit-ink">
            A letter about your week, from your Head of Content.
          </h1>
          <p className="mt-6 max-w-[52ch] text-base leading-6 text-kit-ink-muted">
            Quincy listens to your voice notes and reads the PRs you merge. It
            drafts in your voice, then writes to you, and you decide what goes
            out.
          </p>
          <div className="mt-7 flex items-center gap-4">
            <ButtonLink href="/" size="lg">
              Ask for an invite
            </ButtonLink>
            <Text tone="muted" as="span">
              $49 a month. Invites go out in small groups.
            </Text>
          </div>
        </div>

        {/* The section: the letter itself, rising out of the stage and cut
            by the bottom of the frame. */}
        <div className="absolute inset-x-0 top-[470px] bottom-0 bg-kit-stage">
          <article className="absolute top-8 left-1/2 w-[720px] -translate-x-1/2 rounded-t-kit-object bg-kit-object px-14 pt-10 pb-24 shadow-kit-object">
            <div className="flex items-baseline justify-between">
              <Text weight="strong" as="span">
                Your week
              </Text>
              <Mono>Fri 6 Nov · 16:00</Mono>
            </div>

            <div className="mt-6 flex flex-col gap-4 font-(family-name:--lab-a-newsreader) text-[1.1875rem] leading-[1.55] text-kit-ink">
              <p>
                This week you gave me two things: a voice note from your walk on
                Monday, and the PR you merged on Tuesday.
              </p>
              <p>
                They were the same idea.{" "}
                <Highlight>
                  You cut the onboarding email to one question, and you said why
                  out loud before you shipped it.
                </Highlight>
              </p>
              <p>
                I drafted one post from it, for X and LinkedIn. It is waiting
                for you. It goes out when you approve it, and not before.
              </p>
              <p>Last week&rsquo;s post, replies in the first week:</p>
            </div>
            <div className="mt-2">
              <Text variant="figure">31</Text>
              <Text tone="muted">Your median is 6.</Text>
            </div>
          </article>
        </div>
      </div>
    </Frame>
  )
}
