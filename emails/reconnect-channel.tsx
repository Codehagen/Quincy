import { Button, Heading, Hr, Link, Text } from "@react-email/components"

import { Shell } from "./shell"

interface ReconnectChannelProps {
  name: string
  /** "LinkedIn" or "X" — the label the person recognises, not the slug. */
  channel: string
  /** Already formatted for a human. Null when the token is out of time now. */
  expiresOn: string | null
  url: string
}

/**
 * The 60-day nudge.
 *
 * The tone is the whole design brief. LinkedIn's self-serve tier issues no
 * refresh token, so this message is not an incident report — it is what
 * *always* happens, on schedule, to every working connection. Copy that reads
 * like a failure ("Connection error", "Action required") would teach people
 * that Quincy breaks every two months.
 *
 * It is also never sent for a revoked connection. Someone who removed Quincy
 * in LinkedIn's Permitted Services said no on purpose, and mailing them a
 * Reconnect button is arguing with the answer. That case surfaces in the UI
 * and nowhere else.
 */
export default function ReconnectChannel({
  name,
  channel,
  expiresOn,
  url,
}: ReconnectChannelProps) {
  return (
    <Shell
      title={`Reconnect ${channel} to keep Quincy publishing`}
      preview={
        expiresOn
          ? `${channel} access ends ${expiresOn}. One click renews it.`
          : `${channel} access has ended. One click renews it.`
      }
    >
      <Heading
        as="h1"
        className="text-ink mt-[24px] mb-0 text-[28px] leading-[1.2]"
      >
        {expiresOn
          ? `Renew ${channel} access.`
          : `${channel} needs a reconnect.`}
      </Heading>

      <Text className="text-ink mt-[12px] text-[16px] leading-[1.55]">
        Hi {name} — {channel} grants access for 60 days at a time, then asks
        again. {expiresOn ? `Yours ends ${expiresOn}.` : "Yours has run out."}{" "}
        Nothing is wrong and nothing was lost; your drafts, strategy and
        schedule are exactly where you left them.
      </Text>

      <Button
        href={url}
        className="bg-brass text-ink mt-[24px] box-border rounded-[8px] px-[20px] py-[14px] text-center text-[16px] font-semibold no-underline"
      >
        Reconnect {channel}
      </Button>

      <Text className="mt-[24px] text-[14px] leading-[1.5] text-muted">
        Or paste this into your browser:
        <br />
        <Link href={url} className="text-brassDeep break-all underline">
          {url}
        </Link>
      </Text>

      <Hr className="border-rule my-[28px] border-t border-none border-solid" />

      <Text className="m-0 text-[14px] leading-[1.5] text-muted">
        Until you reconnect, Quincy keeps drafting — it just cannot post. It has
        never posted anything you did not approve, and that does not change.
        Replies to this message reach a real person.
      </Text>
    </Shell>
  )
}

ReconnectChannel.PreviewProps = {
  name: "Christer",
  channel: "LinkedIn",
  expiresOn: "12 October",
  url: "https://hirequincy.com/channels",
} satisfies ReconnectChannelProps

export { ReconnectChannel }
