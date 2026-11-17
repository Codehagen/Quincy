import { Link } from "@react-email/components"

import { Action, Note, Num, Para, Rule, Shell, Subtitle, Title } from "./shell"

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
 * The shape: a plain welcome, one line on what the product now does for you,
 * five numbered steps that each link somewhere real, one button. No
 * unsubscribe link: a welcome that carries marketing framing needs one, and
 * this is the welcome half only. Mixing the two is the hybrid the guidance
 * warns against.
 *
 * Every step names a page that exists and describes what that page actually
 * says it does. An onboarding list that oversells is worse than none: the
 * first click teaches the reader whether the rest is worth reading.
 */
export default function Welcome({ name, appUrl }: WelcomeProps) {
  return (
    <Shell title="Welcome to Quincy" preview="Give it something to write about">
      <Title>Welcome to Quincy.</Title>

      <Para>
        Hi {name}. Your account is ready. Give Quincy raw material and it
        drafts in your voice. Nothing goes out until you approve it, and the
        more it knows about how you write, the less you will need to rewrite.
      </Para>

      <Subtitle>Getting started</Subtitle>

      <Note>Five things worth doing first. None takes long.</Note>

      <Para>
        <Num>1.</Num> Point it at your material:{" "}
        <Link href={`${appUrl}/connectors`} className="text-ink underline">
          connect your sources
        </Link>{" "}
        (repos, essays, calendars, threads). This is what it draws from.
      </Para>

      <Para>
        <Num>2.</Num> Tell it what you know:{" "}
        <Link href={`${appUrl}/brain`} className="text-ink underline">
          fill in the Brain
        </Link>{" "}
        with your positions and platform strategy, so drafts argue your line
        rather than a general one.
      </Para>

      <Para>
        <Num>3.</Num> Set the cadence:{" "}
        <Link href={`${appUrl}/rhythm`} className="text-ink underline">
          choose your Rhythm
        </Link>{" "}
        and it briefs you before the noise, recaps posts and performance after.
      </Para>

      <Para>
        <Num>4.</Num> Work a half-thought:{" "}
        <Link href={`${appUrl}/ideas`} className="text-ink underline">
          open Ideas
        </Link>
        . Scraps in, several directions out, before anything reaches Drafts.
      </Para>

      <Para>
        <Num>5.</Num> Or just talk to it:{" "}
        <Link href={`${appUrl}/studio`} className="text-ink underline">
          the Studio
        </Link>{" "}
        is the main way in. Every page is a window onto the same conversation.
      </Para>

      <Action href={`${appUrl}/studio`}>Open Studio</Action>

      <Rule />

      {/*
       * Signed, and the claim is literal: MAIL_REPLY_TO is christer@, a Zoho
       * mailbox a person opens. "Lands in my inbox" stops being true the moment
       * that variable points at a shared queue, so the two move together.
       */}
      <Para first>
        Stuck, or did it draft something that does not sound like you? Just
        reply. This lands in my inbox, and early on that is the feedback that
        tunes the voice.
      </Para>

      <Para>Christer</Para>
    </Shell>
  )
}

Welcome.PreviewProps = {
  name: "Christer",
  appUrl: "https://hirequincy.com",
} satisfies WelcomeProps

export { Welcome }
