import { Button, Heading, Hr, Link, Text } from "@react-email/components"

import { Shell } from "./shell"

interface WelcomeProps {
  name: string
  /** Base URL of the app, so dev previews do not link at production. */
  appUrl: string
}

/**
 * Sent once, when the account becomes usable — after verification for a
 * password signup, immediately for Google, since Google has already proved the
 * address. See the hooks in lib/auth.ts.
 *
 * Structured the way Dub structures theirs: a plain welcome, one line on what
 * the product now does for you, five numbered steps that each link somewhere
 * real, one button. No unsubscribe link, which is where this departs from
 * Dub's — theirs carries marketing framing and needs one. This is the welcome
 * half only, and mixing the two is the hybrid the guidance warns against.
 *
 * Every step names a page that exists and describes what that page actually
 * says it does. An onboarding list that oversells is worse than none: the
 * first click teaches the reader whether the rest is worth reading.
 */
export default function Welcome({ name, appUrl }: WelcomeProps) {
  return (
    <Shell title="Welcome to Quincy" preview="Give it something to write about">
      <Heading
        as="h1"
        className="text-ink mt-[24px] mb-0 text-[28px] leading-[1.2]"
      >
        Welcome to Quincy.
      </Heading>

      <Text className="text-ink mt-[12px] text-[16px] leading-[1.55]">
        Hi {name} — your account is ready. Give Quincy raw material and it
        drafts in your voice. Nothing goes out until you approve it, and the
        more it knows about how you write, the less you will need to rewrite.
      </Text>

      <Heading
        as="h2"
        className="text-ink mt-[32px] mb-0 text-[18px] leading-[1.3]"
      >
        Getting started
      </Heading>

      <Text className="mt-[8px] mb-[20px] text-[14px] leading-[1.5] text-muted">
        Five things worth doing first. None takes long.
      </Text>

      <Text className="text-ink my-[12px] text-[15px] leading-[1.6]">
        1. Point it at your material:{" "}
        <Link href={`${appUrl}/sources`} className="text-brassDeep underline">
          connect your sources
        </Link>{" "}
        — repos, essays, calendars, threads. This is what it draws from.
      </Text>

      <Text className="text-ink my-[12px] text-[15px] leading-[1.6]">
        2. Tell it what you know:{" "}
        <Link href={`${appUrl}/brain`} className="text-brassDeep underline">
          fill in the Brain
        </Link>{" "}
        with your positions and platform strategy, so drafts argue your line
        rather than a general one.
      </Text>

      <Text className="text-ink my-[12px] text-[15px] leading-[1.6]">
        3. Set the cadence:{" "}
        <Link href={`${appUrl}/rhythm`} className="text-brassDeep underline">
          choose your Rhythm
        </Link>{" "}
        and it briefs you before the noise, recaps posts and performance after.
      </Text>

      <Text className="text-ink my-[12px] text-[15px] leading-[1.6]">
        4. Work a half-thought:{" "}
        <Link href={`${appUrl}/riffs`} className="text-brassDeep underline">
          open Riffs
        </Link>{" "}
        — scraps in, several directions out, before anything reaches Drafts.
      </Text>

      <Text className="text-ink my-[12px] text-[15px] leading-[1.6]">
        5. Or just talk to it:{" "}
        <Link href={`${appUrl}/studio`} className="text-brassDeep underline">
          the Studio
        </Link>{" "}
        is the main way in. Every page is a window onto the same conversation.
      </Text>

      <Button
        href={`${appUrl}/studio`}
        className="bg-brass text-ink mt-[24px] box-border rounded-[8px] px-[20px] py-[14px] text-center text-[16px] font-semibold no-underline"
      >
        Open Studio
      </Button>

      <Hr className="border-rule my-[28px] border-t border-none border-solid" />

      {/*
       * Signed, and the claim is literal: MAIL_REPLY_TO is christer@ — a Zoho
       * mailbox a person opens. "Lands in my inbox" stops being true the moment
       * that variable points at a shared queue, so the two move together.
       */}
      <Text className="text-ink m-0 text-[15px] leading-[1.6]">
        Stuck, or did it draft something that does not sound like you? Just
        reply — this lands in my inbox, and early on that is the feedback that
        tunes the voice.
      </Text>

      <Text className="mt-[16px] mb-0 text-[15px] leading-[1.6] text-muted">
        — Christer
      </Text>
    </Shell>
  )
}

Welcome.PreviewProps = {
  name: "Christer",
  appUrl: "https://hirequincy.com",
} satisfies WelcomeProps

export { Welcome }
