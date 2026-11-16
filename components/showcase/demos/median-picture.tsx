import { MarginNote, Mono } from "@/components/kit"

import { Perched } from "./perched"

/* Against your own median: never a follower count. */

/** Replies per post for the last ten, as a multiple of the median. The last is the onboarding post. */
const POSTS = [0.7, 1.1, 0.9, 1.0, 0.6, 1.3, 0.8, 1.0, 1.2, 1.6]
const MAX = 1.8

export function MedianPicture() {
  return (
    <div
      role="img"
      aria-label="The last ten posts against your own median replies. The newest, the onboarding post, is 1.6 times your median."
      className="@container/kit-stage relative overflow-hidden rounded-kit-stage bg-kit-stage px-4 pt-[4.5rem] pb-8 pointer-events-none select-none sm:px-10 sm:pb-10"
    >
      <Perched state="idle" at="calc(100% - 5.5rem)">
        <div className="rounded-kit-object bg-kit-object p-kit-pad shadow-kit-object sm:px-7 sm:py-6">
          <div className="w-fit">
            <MarginNote note="against you, not the crowd">
              <p className="flex items-baseline gap-kit-related">
                <span className="text-kit-display-md text-kit-ink tabular-nums">1.6×</span>
                <span className="text-kit-ink-muted">your median replies</span>
              </p>
            </MarginNote>
          </div>
          <div className="relative mt-6 h-[7.5rem]" aria-hidden>
            <div
              className="absolute inset-x-0 border-t border-dashed border-kit-mark"
              style={{ bottom: `${(1 / MAX) * 100}%` }}
            />
            <div className="absolute inset-0 flex items-end gap-1.5 pr-12 sm:gap-2">
              {POSTS.map((v, i) => (
                <span
                  key={i}
                  className={`flex-1 rounded-t-[3px] ${i === POSTS.length - 1 ? "bg-kit-ink" : "bg-kit-skeleton"}`}
                  style={{ height: `${(v / MAX) * 100}%` }}
                />
              ))}
            </div>
            <span
              className="absolute right-0 translate-y-1/2"
              style={{ bottom: `${(1 / MAX) * 100}%` }}
            >
              <Mono>1× you</Mono>
            </span>
          </div>
          <div className="mt-2 flex justify-between pr-12">
            <Mono>10 posts ago</Mono>
            <Mono>the onboarding post</Mono>
          </div>
        </div>
      </Perched>
    </div>
  )
}
