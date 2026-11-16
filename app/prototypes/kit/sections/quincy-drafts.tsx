import * as React from "react"

import {
  DraftLoop,
  DraftState,
  Result,
  ResultBelow,
  SlotWithMedian,
  TheWeek,
} from "../quincy-drafts-demos"
import { Code, Demo, P, type Section } from "../doc"

/** The draft family of plans/030 (docs/design/quincy-drafts.md). */
export const quincyDrafts: Section[] = [
  {
    id: "quincy-drafts",
    title: "Quincy cards — drafts",
    group: "Quincy cards",
    doc: "quincy-drafts.md",
    body: (
      <>
        <P>
          One channel version of a draft, through Approve. The card reads the
          server&apos;s <Code>Version</Code>; when it goes out is said once, by{" "}
          <Code>lib/going-out.ts</Code>. The beats are bracketed only when the
          text clearly has them: three paragraphs, a number on its own line in
          the middle one.
        </P>
        <Demo
          lead="Every draft reads in three beats."
          rest="Nothing goes out in your name until you approve it."
          caption="Approve: the actions fold, the time arrives, focus moves to Undo. Edit: the length counts against X's 280. Hold Discard for 1.2s; let go to cancel."
        >
          <DraftLoop />
        </Demo>
        <Demo caption="No clear happened, so no brackets: this opinion post renders plain. A snapshot has no actions.">
          <DraftState shown="snapshot" />
        </Demo>
        <Demo caption="Approved with no LinkedIn slot: the reason in grey, and Undo.">
          <DraftState shown="no-slot" />
        </Demo>
        <Demo caption="Sending: the one running state, a pulsing dot and no button.">
          <DraftState shown="sending" />
        </Demo>
        <Demo caption="Failed: the platform's words in ink, never red, and Reopen.">
          <DraftState shown="failed" />
        </Demo>
        <Demo caption="Published: the time, and the receipt link. Nothing to undo.">
          <DraftState shown="published" />
        </Demo>

        <P>
          The week: <Code>ScheduledPost</Code> rows under each day, then the
          open <Code>SlotCell</Code>s. While a post is queued its time opens a
          Menu (move to an open slot, back to Drafts). Sent, sending and failed
          times are records, so they are plain Mono.
        </P>
        <Demo
          lead="This is what goes out this week."
          rest="Press a time to move it."
          caption="Move Thursday 07:45 into Fri 09:00: the slot fills and focus follows the row. Back to Drafts: the UndoBar stands in its place."
        >
          <TheWeek />
        </Demo>
        <Demo caption="Data gap: no by-hour median exists yet. With the typed median prop filled, the cell says it against your own median.">
          <SlotWithMedian />
        </Demo>

        <P>
          A published post against your own median. The views are the figure;{" "}
          <Code>AgainstMedian</Code> is the grey line under it. Never a follower
          count.
        </P>
        <Demo caption="Under the median, read at import: it says both, plainly.">
          <ResultBelow />
        </Demo>
        <Demo caption="3.3× your median, from a live reading.">
          <Result />
        </Demo>
      </>
    ),
  },
]
