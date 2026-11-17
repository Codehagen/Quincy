import { ButtonLink, EmptyRegion, EmptyState } from "@/components/kit"
import { MarketingShell } from "@/components/marketing"
import { constructMetadata } from "@/lib/metadata"

export const metadata = constructMetadata({
  title: "Not found",
  noIndex: true,
})

/**
 * An address nothing answers, and every notFound() in the app: none of the
 * route groups has its own, so this one renders in place of whichever layout
 * was below the root. The marketing frame, because it is right for a
 * stranger and still honest for someone signed in: its header reads the
 * session and offers Studio. Two ways out, because this page cannot know
 * which of the two audiences arrived.
 */
export default function NotFound() {
  return (
    <MarketingShell>
      <EmptyRegion>
        <EmptyState
          bold="That page isn’t here."
          rest="The link may be old, or the address has a typo."
        >
          <ButtonLink href="/">Go to the home page</ButtonLink>
          <ButtonLink href="/studio">Open Studio</ButtonLink>
        </EmptyState>
      </EmptyRegion>
    </MarketingShell>
  )
}
