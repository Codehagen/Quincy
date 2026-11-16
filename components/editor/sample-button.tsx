"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Text, TextButton } from "@/components/kit"
import { createSampleProjectAction } from "@/app/(app)/cuts/actions"

/**
 * "Try it with a sample recording", under the drop zone.
 *
 * Quiet on purpose: the drop zone is the way in, and this is for someone who
 * has no recording to hand yet. A TextButton, not a second Button beside the
 * drop target, so the page still has one obvious thing to do.
 */
export function SampleButton() {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  return (
    <div className="flex flex-col items-center gap-kit-tight">
      <TextButton
        pending={pending}
        pendingLabel="Opening the sample…"
        onClick={() => {
          setError(null)
          startTransition(async () => {
            try {
              const result = await createSampleProjectAction()
              if ("projectId" in result) {
                router.push(`/cuts/${result.projectId}`)
              } else {
                setError(result.error)
              }
            } catch {
              setError("The sample could not be opened. Try again.")
            }
          })
        }}
      >
        Try it with a sample recording
      </TextButton>

      {/* A plain sentence, as the drop zone's refusals are. */}
      {error ? (
        <Text variant="small" role="alert">
          {error}
        </Text>
      ) : null}
    </div>
  )
}
