"use client"

import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/page-header"

import { ENTRIES, SLOTS } from "../data"
import { SlotRow } from "../parts"

/**
 * Slots — axis: the recurring week, not the dates.
 *
 * This is the model lib/rhythms.ts already wrote down. Week Plan promises to
 * "fill next week's slots from the drafts you have, so Monday is not a blank
 * calendar" — that sentence only means anything if a slot exists before
 * anything is scheduled into it. Here it does: six rows that are yours whether
 * or not there is a post in them.
 *
 * What that buys is a sentence neither of the other two layouts can say. Agenda
 * and Week can tell you nothing goes out on Wednesday. Only this can tell you
 * that you *have* a Wednesday slot and it is going to waste — an absence
 * against a commitment rather than an empty date, and the difference is whether
 * there is anything to do about it.
 *
 * It is also the variant that most changes the schema. If a slot is real, it is
 * a row with a channel and a recurrence, and a scheduled post is a slot plus a
 * draft version. If it is not, a slot is a saved view over posts that happen to
 * repeat, and `scheduledAt` on a version is the whole model. Picking this
 * decides that, which is why it is worth building even if it loses.
 *
 * What it gives up: one-off posts have nowhere obvious to live, and "what is
 * going out today" — the question Morning Brief asks this surface — is not what
 * the page is arranged to answer.
 */
export function Slots() {
  const filled = SLOTS.filter((s) => s.filledBy).length

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-8 py-10">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Lineup</PageHeaderTitle>
          <PageHeaderDescription>
            Your publishing week as a set of standing slots. Quincy fills them
            from what you have approved.
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <p className="px-3 text-caption text-muted-foreground">
        <span className="font-mono tabular-nums">{filled}</span> of{" "}
        <span className="font-mono tabular-nums">{SLOTS.length}</span> slots
        filled this week
      </p>

      <ul className="flex flex-col gap-2">
        {SLOTS.map((slot) => (
          <SlotRow
            key={slot.id}
            slot={slot}
            entry={ENTRIES.find((e) => e.id === slot.filledBy)}
          />
        ))}
      </ul>

      {/* The slots themselves are the thing you edit here, and editing them is
          a different act from filling them — so it sits at the end, quiet,
          rather than competing with the week above it. */}
      <p className="px-3 text-caption text-pretty text-muted-foreground">
        These repeat every week. Changing a slot changes the rhythm, not this
        week&rsquo;s posts.
      </p>
    </div>
  )
}
