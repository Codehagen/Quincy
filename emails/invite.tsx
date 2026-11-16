import { Button, Heading, Hr, Text } from "@react-email/components"

import { Shell } from "./shell"

interface InviteProps {
  /** The signup link, invite code already on it. */
  url: string
  /** How long the link is good for, in words. "14 days". */
  expiresIn: string
}

/**
 * The one mail the waitlist ever sends, and it is sent by a person running
 * `scripts/invite.ts` — never by the join endpoint. See plans/023.
 *
 * That is the whole reason `/api/waitlist` does not confirm by mail: a public
 * endpoint that emails whatever address is posted to it is a mail-bomb
 * primitive aimed at whoever owns that address, the same reason `sendOnSignIn`
 * stays unset in lib/auth.ts. So the first thing anyone on the list hears from
 * us is this, and it is expected.
 *
 * No name. The waitlist form asks for an address and nothing else, so we do not
 * have one — and "Hi there" is worse than opening with the sentence that
 * matters.
 *
 * No unsubscribe link, matching `welcome.tsx`: this is transactional, sent once
 * to somebody who asked to be told, and mixing marketing framing into it is the
 * hybrid the guidance warns against.
 */
export default function Invite({ url, expiresIn }: InviteProps) {
  return (
    <Shell title="Your Quincy invite" preview="Your invite is ready">
      <Heading
        as="h1"
        className="text-ink mt-[24px] mb-0 text-[28px] leading-[1.2]"
      >
        You are in.
      </Heading>

      <Text className="text-ink mt-[12px] text-[16px] leading-[1.55]">
        You asked to be told when Quincy opened. It is your turn. Quincy takes
        your raw material — something you shipped, a half-thought, a call you
        recorded — and drafts it in your voice. It writes, then it stops.
        Nothing goes out in your name until you approve it.
      </Text>

      <Button
        href={url}
        className="text-paper bg-ink mt-[24px] rounded-[10px] px-[20px] py-[12px] text-[15px] font-semibold no-underline"
      >
        Create your account
      </Button>

      <Text className="mt-[16px] text-[14px] leading-[1.5] text-muted">
        The link works once and runs out in {expiresIn}. It is tied to this
        address, so create the account with the one this mail arrived at.
      </Text>

      <Hr className="border-rule my-[24px]" />

      <Text className="text-[14px] leading-[1.5] text-muted">
        If you would rather not, do nothing and the invite lapses. Replies to
        this message reach a real person.
      </Text>
    </Shell>
  )
}

/**
 * What the preview server renders. Without these the invite showed "runs out
 * in ." — an empty prop reading as a typo in the one template nobody had ever
 * looked at, because it is the only one that had never been sent.
 *
 * The code is obviously fake on purpose. A realistic-looking one invites
 * somebody to click it out of the preview and wonder why it 404s.
 */
Invite.PreviewProps = {
  url: "https://hirequincy.com/signup?invite=preview-code-not-real",
  expiresIn: "14 days",
} satisfies InviteProps

export { Invite }
