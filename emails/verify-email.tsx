import { Action, Footer, Para, PasteLink, Shell, Title } from "./shell"

interface VerifyEmailProps {
  name: string
  url: string
}

export default function VerifyEmail({ name, url }: VerifyEmailProps) {
  return (
    <Shell
      title="Confirm your email address for Quincy"
      preview="One click and Quincy gets to work."
    >
      <Title>Confirm your email.</Title>

      <Para>
        Hi {name}. One click and Quincy can start reading your sources and
        drafting in your voice.
      </Para>

      <Action href={url}>Confirm email</Action>

      <PasteLink href={url} />

      <Footer>
        If you did not create a Quincy account, ignore this. Nothing happens
        until the link is used. Replies to this message reach a real person.
      </Footer>
    </Shell>
  )
}

VerifyEmail.PreviewProps = {
  name: "Christer",
  url: "https://hirequincy.com/api/auth/verify-email?token=preview",
} satisfies VerifyEmailProps

export { VerifyEmail }
