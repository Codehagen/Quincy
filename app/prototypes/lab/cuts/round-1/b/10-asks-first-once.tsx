"use client"

/*
 * 10 — Asks first, once.
 *
 * Quincy drafts, you send: for a cut that means the default is ask first.
 * To keep that from being a toll, the question is the receipt written in
 * advance. It comes back before the run, every line can be unticked, Go is
 * one press (or Enter), and the switch under it turns asking off for this
 * project, so the person decides once. The accent is the kit's green on the
 * ticked lines.
 */

import { Download04Icon } from "@hugeicons/core-free-icons"

import { Button, CheckItem, Checklist, Kbd, Switch, Text } from "@/components/kit"

import { CUT_SECONDS, RECEIPT, TAKE, fmt } from "../fixture"
import { EditorBar, Frame, Picture, Quincy, Timeline, You } from "../parts"

const PLAN: Record<(typeof RECEIPT)[number]["tool"], string> = {
  remove_silences: "Remove 2 pauses, 4.1 s",
  delete_clip: "Cut the “um” after “So,”",
  punch_in: "Push in on “They were in the way”",
  add_captions: "Captions, a phrase at a time",
  reframe: "Vertical 9:16, face kept in frame",
}

export function AsksFirstOnce() {
  return (
    <Frame>
      <EditorBar
        right={
          <Button variant="quiet" icon={Download04Icon}>
            Export
          </Button>
        }
      />
      <div className="flex h-[664px]">
        <div className="flex min-w-0 flex-1 flex-col items-center gap-5 px-6 pt-6">
          <Picture shape="16:9" width={520} time={fmt(4.6)} />
          <div className="rounded-kit-object bg-kit-object px-4 pt-3 pb-4 shadow-kit-object">
            <Timeline width={560} state="marked" playhead={4.6} />
          </div>
          <Text variant="small" tone="muted">
            Nothing has changed yet. The outlined spots are what the plan would cut.
          </Text>
        </div>

        <aside className="flex w-[340px] shrink-0 flex-col gap-4 border-l border-kit-hairline px-5 pt-5">
          <You time="10:42">Make it tight, captions, vertical for X.</You>
          <Quincy mood="waiting" label="Quincy · before I cut">
            <div className="rounded-kit-object bg-kit-object p-4 shadow-kit-object">
              <Text weight="strong">Here is what I would do</Text>
              <Text variant="small" tone="muted">
                {fmt(TAKE.seconds)} to about {fmt(CUT_SECONDS)}. Untick what you want left alone.
              </Text>
              <div className="mt-3">
                <Checklist aria-label="The plan" defaultValue={RECEIPT.map((r) => r.tool)}>
                  {RECEIPT.map((r) => (
                    <CheckItem key={r.tool} value={r.tool}>
                      {PLAN[r.tool]}
                    </CheckItem>
                  ))}
                </Checklist>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Button variant="action">Go</Button>
                <span className="flex items-center gap-1 text-kit-meta text-kit-ink-muted">
                  or <Kbd keys={["enter"]} size="sm" />
                </span>
              </div>
            </div>
          </Quincy>
          <Switch label="Just go on this project" />
          <Text variant="small" tone="muted">
            Either way it is one run and one undo, and nothing leaves the editor until you export.
          </Text>
        </aside>
      </div>
    </Frame>
  )
}
