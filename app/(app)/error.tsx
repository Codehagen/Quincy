"use client"

import { useEffect } from "react"

import { Button, EmptyRegion, EmptyState, TextLink } from "@/components/kit"
import { Friend } from "@/components/mascot"

/**
 * A page in the app that threw while rendering. Inside the shell, so the
 * sidebar stays and the person can go anywhere else. `retry` re-fetches and
 * re-renders the segment (Next 16's error.js); `reset` would only re-render,
 * which does not help a read that failed on the server.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <EmptyRegion>
      <EmptyState
        media={<Friend size={40} state="stuck" className="text-kit-ink" />}
        bold="This page didn’t load."
        rest="Nothing you saved is lost. Try again, or go back to Studio."
      >
        <Button onClick={() => retry()}>Try again</Button>
        {/* A link beside the one action, not a second button. */}
        <span className="flex items-center px-kit-tight">
          <TextLink href="/studio">Go to Studio</TextLink>
        </span>
      </EmptyState>
    </EmptyRegion>
  )
}
