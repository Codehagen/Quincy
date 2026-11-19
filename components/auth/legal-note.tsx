import { TextLink } from "@/components/kit"

import { AuthNote } from "./parts"

/**
 * Terms, privacy, and data deletion, under an auth card.
 *
 * The footer carries the same three for a stranger on the marketing pages.
 * Login and signup are the other place someone decides to hand over an
 * email, and Meta's review looks for the policy from the sign-up path as
 * well as from the site footer. `agree` is the sentence on the form that
 * actually creates the account.
 */
export function LegalNote({ agree = false }: { agree?: boolean }) {
  if (agree) {
    return (
      <AuthNote>
        Creating an account means you agree to the{" "}
        <TextLink href="/terms">Terms</TextLink> and the{" "}
        <TextLink href="/privacy">Privacy Policy</TextLink>.{" "}
        <TextLink href="/data-deletion">Data deletion</TextLink>
      </AuthNote>
    )
  }

  return (
    <AuthNote>
      <TextLink href="/terms">Terms</TextLink>
      {" · "}
      <TextLink href="/privacy">Privacy</TextLink>
      {" · "}
      <TextLink href="/data-deletion">Data deletion</TextLink>
    </AuthNote>
  )
}
