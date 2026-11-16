import { Mono, Text } from "@/components/kit"

import { DraftActions } from "./desk-and-pocket"
import { Perched } from "./perched"
import { POST } from "./the-post"

/* Held for your read: the friend looks at the button. */

/** The whole held draft: the post as it will read, when it goes, and the decision. */
export function HeldPicture() {
  return (
    <div
      role="img"
      aria-label={`The held draft for LinkedIn, 41% to 68% in a week. ${POST.did} ${POST.happened} ${POST.figure}. ${POST.meant} Wednesday 08:30 if you approve, with Approve and Edit.`}
      className="mx-auto w-full max-w-[37.5rem] pt-[3.25rem] text-left pointer-events-none select-none"
    >
      <Perched state="waiting" size={64} at="58%">
        <div className="flex flex-col gap-kit-group rounded-kit-object bg-kit-object p-kit-pad shadow-kit-object sm:px-7 sm:pt-6 sm:pb-5">
          <div className="flex flex-col">
            <span className="font-kit-strong">41% → 68% in a week</span>
            <Mono>LinkedIn · held for your read</Mono>
          </div>
          <div className="flex flex-col gap-kit-related">
            <Text>{POST.did}</Text>
            <div>
              <Text>{POST.happened}</Text>
              <Text variant="figure">{POST.figure}</Text>
            </div>
            <Text>{POST.meant}</Text>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-kit-related border-t border-kit-hairline pt-kit-related">
            <span className="text-kit-ink-muted">
              <Mono tone="ink">Wed 08:30</Mono> if you approve
            </span>
            <DraftActions />
          </div>
        </div>
      </Perched>
    </div>
  )
}
