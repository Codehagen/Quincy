"use client"

import { Composer, SkeletonLines } from "@/components/kit"

/**
 * /studio while its reads are on the way (the page's Suspense fallback):
 * StudioScreen's own column, so nothing moves when it lands. The words sit
 * where the greeting will, and the real Composer waits at the foot, inert, at
 * the size it will be. Static bars, so no reduced-motion path is needed.
 *
 * /c/[id] has no boundary of its own on purpose: Studio moves to it with
 * router.replace after the first reply, and a fresh boundary there would
 * flash this skeleton over a transcript that is already on screen. History
 * clicks get their pending cue from the sidebar row instead.
 */
export function StudioLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <span role="status" className="sr-only">
        Loading Studio
      </span>
      <div
        aria-hidden
        className="mx-auto flex w-full max-w-kit-page flex-1 flex-col justify-end gap-kit-lead-gap px-kit-page-gutter pt-kit-page-top pb-kit-group"
      >
        <SkeletonLines widths={["86%", "72%", "40%"]} />
      </div>
      <div
        inert
        className="mx-auto w-full max-w-kit-page shrink-0 pr-[max(var(--spacing-kit-page-gutter),env(safe-area-inset-right))] pb-[max(env(safe-area-inset-bottom),var(--spacing-kit-group))] pl-[max(var(--spacing-kit-page-gutter),env(safe-area-inset-left))]"
      >
        <Composer
          label="Message Quincy"
          placeholder="Hand me something to write about"
          onSubmit={() => {}}
          attachments
          isAction={false}
        />
      </div>
    </div>
  )
}
