import { Button, Heading, Hr, Link, Text } from "@react-email/components"

import { Shell } from "./shell"

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
        className="text-ink mt-[24px] mb-0 text-[28px] leading-[1.2]"
      >
        Confirm your email.
      </Heading>

      <Text className="text-ink mt-[12px] text-[16px] leading-[1.55]">
        Hi {name} — one click and Quincy can start reading your sources and
        drafting in your voice.
      </Text>

      <Button
        href={url}
        className="bg-brass text-ink mt-[24px] box-border rounded-[8px] px-[20px] py-[14px] text-center text-[16px] font-semibold no-underline"
      >
        Confirm email
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
