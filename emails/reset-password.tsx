import { Heading, Link, Text } from "@react-email/components"

import { Action, Rule, Shell } from "./shell"

interface ResetPasswordProps {
  name: string
  url: string
}

export default function ResetPassword({ name, url }: ResetPasswordProps) {
  return (
    <Shell
      title="Reset your Quincy password"
      preview="Reset your Quincy password"
    >
      <Heading
        as="h1"
        className="text-ink mt-[40px] mb-0 text-[24px] leading-[1.25] font-semibold tracking-[-0.01em]"
      >
        Set a new password.
      </Heading>

      <Text className="text-ink mt-[12px] text-[16px] leading-[1.55]">
        Hi {name} — someone asked to reset the password on this account. The
        link below is single-use and expires.
      </Text>

      <Action href={url}>
        Choose a new password
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
        If this was not you, your password is unchanged and you can ignore this.
        Replies to this message reach a real person.
      </Text>
    </Shell>
  )
}

ResetPassword.PreviewProps = {
  name: "Christer",
  url: "https://hirequincy.com/reset-password?token=preview",
} satisfies ResetPasswordProps

export { ResetPassword }
