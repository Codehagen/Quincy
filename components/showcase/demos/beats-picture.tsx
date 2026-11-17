import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown02Icon, ArrowRight02Icon, Mic01Icon } from "@hugeicons/core-free-icons"

import { BeatBracket, Beats, Card, Highlight, MarginNote, Mono, Perched, Text } from "@/components/kit"
import { measurePost } from "@/lib/post-length"

import { POST } from "./the-post"

/* POST, the LinkedIn draft about the onboarding cut, is in the-post.ts. */

const POST_TEXT = [POST.did, `${POST.happened}\n${POST.figure}`, POST.meant].join("\n\n")
const POST_LENGTH = measurePost(POST_TEXT, "linkedin")

/*
 * Side by side from a 62rem stage (@min-[62rem]/kit-stage, written out in
 * full so Tailwind sees it); stacked under it, the connector turning down.
 */

/**
 * What you said, then the post: the transcript of a voice note with its
 * number highlighted and noted on the left, the LinkedIn draft with its three beats on the right.
 * The transcript's margin column is the gap between them, so the note and the arrow
 * under it are the connector.
 */
export function BeatsPicture() {
  return (
    <div
      role="img"
      aria-label={`A voice note from Tuesday 18:12, transcribed: So we killed six onboarding screens. Sixty-eight percent finish signup now, it was forty-one. Turns out every screen was a question we never needed to ask. The second sentence is highlighted, with a note beside it: that’s the number. It becomes a LinkedIn draft in three beats. What I did: ${POST.did} What happened: ${POST.happened} ${POST.figure}. What it meant: ${POST.meant}`}
      className="@container/kit-stage relative overflow-hidden rounded-kit-stage bg-kit-stage px-4 pt-10 text-left pointer-events-none select-none sm:px-10 @min-[62rem]/kit-stage:pt-16"
    >
      <div className="flex flex-col items-center gap-6 @min-[62rem]/kit-stage:flex-row @min-[62rem]/kit-stage:items-start @min-[62rem]/kit-stage:justify-between @min-[62rem]/kit-stage:gap-0">
        {/* What you said. */}
        <div className="w-full max-w-[calc(22rem+var(--spacing-kit-margin)+var(--spacing-kit-margin-gap))] relative @min-[62rem]/kit-stage:mt-12 @min-[62rem]/kit-stage:w-[calc(17rem+var(--spacing-kit-margin)+var(--spacing-kit-margin-gap))] @min-[62rem]/kit-stage:flex-none">
          <Card width="with-margin">
            <MarginNote note="that’s the number" timing="after-highlight">
              <div className="flex flex-col gap-kit-tight">
                <span className="flex items-center gap-1.5 text-kit-ink-muted">
                  <HugeiconsIcon icon={Mic01Icon} size={14} strokeWidth={1.8} aria-hidden />
                  <Mono>Voice note · Tue 18:12</Mono>
                </span>
                <span className="mt-1 text-kit-ink-muted">
                  So we killed six onboarding screens.{" "}
                  <span className="text-kit-ink">
                    <Highlight>Sixty-eight percent finish signup now, it was forty-one.</Highlight>
                  </span>{" "}
                  Turns out every screen was a question we never needed to ask.
                </span>
              </div>
            </MarginNote>
          </Card>
          {/* The connector: right, at the foot of the transcript's margin, under the note. */}
          <span
            aria-hidden
            className="absolute bottom-1 left-[calc(100%-var(--spacing-kit-margin)+1.5rem)] hidden text-kit-ink-muted @min-[62rem]/kit-stage:block"
          >
            <HugeiconsIcon icon={ArrowRight02Icon} size={22} strokeWidth={1.6} />
          </span>
        </div>

        {/* The connector, stacked: down. */}
        <span aria-hidden className="text-kit-ink-muted @min-[62rem]/kit-stage:hidden">
          <HugeiconsIcon icon={ArrowDown02Icon} size={22} strokeWidth={1.6} />
        </span>

        {/* The post. */}
        <div className="mt-8 w-full max-w-[calc(26rem+var(--spacing-kit-margin)+var(--spacing-kit-margin-gap))] @min-[62rem]/kit-stage:mt-0 @min-[62rem]/kit-stage:max-w-none @min-[62rem]/kit-stage:w-[calc(21rem+var(--spacing-kit-margin)+var(--spacing-kit-margin-gap))] @min-[62rem]/kit-stage:flex-none">
          <Perched state="writing" at="34%">
            <div className="-mb-kit-bleed">
              <Card width="with-margin">
                <div className="flex flex-col gap-kit-related">
                  <div className="flex flex-col">
                    <Text weight="strong">Draft for LinkedIn</Text>
                    <Mono>
                      from your voice note · {POST_LENGTH.used} / {POST_LENGTH.limit}
                    </Mono>
                  </div>
                  <Beats>
                    <div className="flex flex-col gap-kit-related">
                      <BeatBracket beat="did">
                        <Text>{POST.did}</Text>
                      </BeatBracket>
                      <BeatBracket beat="happened">
                        <Text>{POST.happened}</Text>
                        <Text variant="figure">{POST.figure}</Text>
                      </BeatBracket>
                      <BeatBracket beat="meant">
                        <Text>{POST.meant}</Text>
                      </BeatBracket>
                    </div>
                  </Beats>
                  {/* Room for the stage edge to crop. */}
                  <div className="h-14" />
                </div>
              </Card>
            </div>
          </Perched>
        </div>
      </div>
    </div>
  )
}
