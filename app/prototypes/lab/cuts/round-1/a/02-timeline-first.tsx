"use client"

/*
 * 02 — Timeline first, chat in the margin.
 *
 * The editor a person who cuts by hand expects: a large preview, the full
 * lanes under it. Quincy is a narrow margin on the right, where each run is
 * a few lines of prose and the composer sits at the foot. The chat comments
 * on the timeline instead of owning the page. No accent.
 */

import { HugeiconsIcon } from "@hugeicons/react"
import { Download04Icon, PlayIcon } from "@hugeicons/core-free-icons"

import { Button, Segmented } from "@/components/kit"

import { CUT_SECONDS, fmt } from "../fixture"
import { ComposerStill, EditorBar, Frame, Picture, Quincy, Timeline } from "../parts"

export function TimelineFirst() {
  return (
    <Frame>
      <EditorBar
        seconds={CUT_SECONDS}
        right={
          <>
            <Segmented
              aria-label="Frame shape"
              size="md"
              defaultValue="16:9"
              options={[
                { value: "16:9", label: "16:9" },
                { value: "9:16", label: "9:16" },
                { value: "1:1", label: "1:1" },
              ]}
            />
            <Button variant="action" icon={Download04Icon}>
              Export
            </Button>
          </>
        }
      />

      <div className="flex h-[664px]">
        <div className="flex min-w-0 flex-1 flex-col items-center gap-4 px-6 pt-6">
          <Picture shape="16:9" width={560} caption="Same questions, asked when they matter." time={fmt(8.1)} />
          <div className="flex w-full items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-full bg-kit-control shadow-kit-control">
                <HugeiconsIcon icon={PlayIcon} size={14} aria-hidden />
              </span>
              <span className="font-kit-mono text-kit-mono tabular-nums">
                {fmt(8.1)} <span className="text-kit-ink-muted">/ {fmt(CUT_SECONDS)}</span>
              </span>
            </span>
            <span className="text-kit-meta text-kit-ink-muted">S split · Delete ripple · drag an edge to trim</span>
          </div>
          <div className="rounded-kit-object bg-kit-object px-4 pt-3 pb-4 shadow-kit-object">
            <Timeline width={624} state="cut" captions zoom playhead={8.1} />
          </div>
        </div>

        {/* The margin: Quincy's runs as prose. */}
        <aside className="flex w-[248px] shrink-0 flex-col border-l border-kit-hairline px-4 pt-5 pb-4">
          <span className="text-kit-small font-kit-strong">Cut with Quincy</span>
          <div className="mt-4 flex flex-1 flex-col gap-5 text-kit-small">
            <div className="flex flex-col gap-1 text-kit-ink-muted">
              <span className="text-kit-meta">You</span>
              <span className="text-kit-ink">Tighten it and add captions.</span>
            </div>
            <Quincy mood="idle">
              <ul className="flex flex-col gap-1.5">
                <li>Removed 2 pauses, 4.1 s.</li>
                <li>Cut the “um” at 0:01.</li>
                <li>Captions from the transcript, a phrase at a time.</li>
              </ul>
            </Quincy>
            <div className="flex flex-col gap-1 text-kit-ink-muted">
              <span className="text-kit-meta">You</span>
              <span className="text-kit-ink">Push in where I say the screens line.</span>
            </div>
            <Quincy mood="found">
              <p>Zoom 1.3× on “They were in the way”, 0:16 to 0:21. Nothing changed length.</p>
            </Quincy>
          </div>
          <ComposerStill placeholder="Say a change" />
        </aside>
      </div>
    </Frame>
  )
}
