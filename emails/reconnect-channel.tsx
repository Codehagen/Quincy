import { Action, Footer, Num, Para, PasteLink, Shell, Title } from "./shell"

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
      <Title>
        {expiresOn
          ? `Renew ${channel} access.`
          : `${channel} needs a reconnect.`}
      </Title>

      <Para>
        Hi {name}. {channel} grants access for <Num>60</Num> days at a time,
        then asks again.{" "}
        {expiresOn ? (
          <>
            Yours ends <Num>{expiresOn}</Num>.
          </>
        ) : (
          "Yours has run out."
        )}{" "}
        Nothing is wrong and nothing was lost; your drafts, strategy and
        schedule are exactly where you left them.
      </Para>

      <Action href={url}>Reconnect {channel}</Action>

      <PasteLink href={url} />

      <Footer>
        Until you reconnect, Quincy keeps drafting. It just cannot post. It has
        never posted anything you did not approve, and that does not change.
        Replies to this message reach a real person.
      </Footer>
    </Shell>
  )
}

ReconnectChannel.PreviewProps = {
  name: "Christer",
  channel: "LinkedIn",
  expiresOn: "12 October",
  url: "https://hirequincy.com/connectors?show=channels",
} satisfies ReconnectChannelProps

export { ReconnectChannel }
