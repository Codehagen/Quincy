import { Action, Footer, Para, PasteLink, Shell, Title } from "./shell"

interface ResetPasswordProps {
  name: string
  url: string
}

export default function ResetPassword({ name, url }: ResetPasswordProps) {
  return (
    <Shell
      title="Reset your Quincy password"
      preview="The link is single-use and expires."
    >
      <Title>Set a new password.</Title>

      <Para>
        Hi {name}. Someone asked to reset the password on this account. The
        link below is single-use and expires.
      </Para>

      <Action href={url}>Choose a new password</Action>

      <PasteLink href={url} />

      <Footer>
        If this was not you, your password is unchanged and you can ignore this.
        Replies to this message reach a real person.
      </Footer>
    </Shell>
  )
}

ResetPassword.PreviewProps = {
  name: "Christer",
  url: "https://hirequincy.com/reset-password?token=preview",
} satisfies ResetPasswordProps

export { ResetPassword }
