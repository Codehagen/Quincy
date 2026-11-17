import { Heading, Link, Text } from "@react-email/components"

import { Action, Rule, Shell } from "./shell"

interface VerifyEmailProps {
  name: string
  url: string
}

export default function VerifyEmail({ name, url }: VerifyEmailProps) {
  return (
    <Shell
      title="Confirm your email address for Quincy"
      preview="Confirm your email and Quincy gets to work"
    >
      <Heading
        as="h1"
        className="text-ink mt-[40px] mb-0 text-[24px] leading-[1.25] font-semibold tracking-[-0.01em]"
      >
        Confirm your email.
      </Heading>

      <Text className="text-ink mt-[12px] text-[16px] leading-[1.55]">
        Hi {name} — one click and Quincy can start reading your sources and
        drafting in your voice.
      </Text>

      <Action href={url}>
        Confirm email
      </Action>

      <Text className="mt-[24px] text-[14px] leading-[1.5] text-inkMuted">
        Or paste this into your browser:
        <br />
        <Link href={url} className="text-ink break-all underline">
          {url}
        </Link>
      </Text>

      <Rule />

      <Text className="m-0 text-[14px] leading-[1.5] text-inkMuted">
        If you did not create a Quincy account, ignore this — nothing happens
        until the link is used. Replies to this message reach a real person.
      </Text>
    </Shell>
  )
}

VerifyEmail.PreviewProps = {
  name: "Christer",
  url: "https://hirequincy.com/api/auth/verify-email?token=preview",
} satisfies VerifyEmailProps

export { VerifyEmail }
