import { Button, Heading, Hr, Link, Text } from "@react-email/components"

import { Shell } from "./shell"

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
        className="text-ink mt-[24px] mb-0 text-[28px] leading-[1.2]"
      >
        Set a new password.
      </Heading>

      <Text className="text-ink mt-[12px] text-[16px] leading-[1.55]">
        Hi {name} — someone asked to reset the password on this account. The
        link below is single-use and expires.
      </Text>

      <Button
        href={url}
        className="bg-brass text-ink mt-[24px] box-border rounded-[8px] px-[20px] py-[14px] text-center text-[16px] font-semibold no-underline"
      >
        Choose a new password
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
