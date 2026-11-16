import type * as React from "react"

import type { Controls } from "../parts"
import type { FrameId, Queue } from "../queue"
import { Beside } from "./beside"
import { FromSource } from "./from-source"
import { MarkedUp } from "./marked-up"
import { OneAtATime } from "./one-at-a-time"

export type DirectionProps = { q: Queue; frame: FrameId; c: Controls }

/** A control a direction exposes: a slider over a range, or a few choices. */
export type ControlDef =
  | { key: keyof Controls; kind: "slider"; label: string; min: number; max: number; step: number; unit: string; why: string }
  | { key: keyof Controls; kind: "choice"; label: string; options: { value: string; label: string }[]; why: string }

export type Direction = {
  id: string
  name: string
  axis: string
  bet: string
  givesUp: string
  /** What it would change in components/riffs/ideas-screen.tsx (and around it). */
  changes: [file: string, change: string][]
  controls: ControlDef[]
  View: (p: DirectionProps) => React.ReactNode
}

export const DIRECTIONS: Direction[] = [
  {
    id: "beside",
    name: "Beside",
    axis: "Layout: list beside detail, the source is the unit",
    bet: "You choose a piece of material first and its ideas second, and seeing the whole queue while you read one is worth a column. Today’s production page.",
    givesUp: "The idea is two clicks deep (row, then tab), and the split only appears on a stage of 66rem: with the 13rem sidebar that is a window of about 1330px, so a 1280 laptop gets the single column.",
    changes: [
      ["components/riffs/ideas-screen.tsx", "Nothing, if it wins. The lab’s two numbers are the open question: the list column (24rem) and the split (66rem)."],
      ["app/globals.css", "If the split should reach a 1280 window, lower --container-kit-split to about 60rem; the detail column is then about 540 at the breakpoint, under the 640 page.md promises."],
    ],
    controls: [
      { key: "listRem", kind: "slider", label: "List column", min: 18, max: 32, step: 1, unit: "rem", why: "--container-kit-list" },
      { key: "splitRem", kind: "slider", label: "Split from a stage of", min: 52, max: 76, step: 1, unit: "rem", why: "--container-kit-split" },
      { key: "rowCap", kind: "slider", label: "Rows before Show more", min: 3, max: 12, step: 1, unit: "", why: "page.md: at most 6" },
      { key: "titleLines", kind: "choice", label: "Row title", options: [{ value: "1", label: "1 line" }, { value: "2", label: "2 lines" }], why: "ListRow titleLines" },
    ],
    View: Beside,
  },
  {
    id: "one",
    name: "One at a time",
    axis: "Interaction model: a triage inbox, the idea is the unit",
    bet: "The job is deciding, not browsing. One idea, its sentence, and three keys (D, N, L) clear a queue faster than any list, and the next idea takes the place of the last.",
    givesUp: "The overview: you never see the ideas from one source side by side, so you cannot pick the best of three, only judge each alone. Working and failed sources shrink to a footnote.",
    changes: [
      ["components/riffs/ideas-screen.tsx", "Replace the list and RiffCard with a queue of angles (riff × angle, ordered by riff then position, Later at the end). KitPage goes back to width=\"page\"; the recorder moves under the queue, and leads when it is empty."],
      ["components/quincy/riff-card.tsx", "A new IdeaCard beside RiffCard: one angle, ProvenanceMark, the sentence in a Well, and the three verbs. RiffCard stays for Studio."],
      ["app/(app)/ideas/actions.ts", "A real Later needs a column (riff_angle.snoozed_at); the lab keeps it in memory."],
    ],
    controls: [
      { key: "measureRem", kind: "slider", label: "Card measure", min: 30, max: 52, step: 1, unit: "rem", why: "45rem is the page column" },
      { key: "peek", kind: "slider", label: "Next ideas shown", min: 0, max: 5, step: 1, unit: "", why: "0 is a pure inbox" },
      { key: "material", kind: "choice", label: "Your words", options: [{ value: "sentence", label: "The sentence" }, { value: "whole", label: "All of it" }, { value: "none", label: "Hidden" }], why: "needs Angle.line" },
    ],
    View: OneAtATime,
  },
  {
    id: "source",
    name: "From the source",
    axis: "Layout: one reading column, the landing picture, the idea is the row",
    bet: "The landing already sold this page: “3 ideas from #212”, the picked one on the grey with Draft beside it. Build that. Every idea is visible at once and the action stands on the idea you chose.",
    givesUp: "The material (your words) goes behind “What you said”, and a row holds a Button, which page.md forbids for list and detail. Long queues scroll: there is no cap and no sticky list.",
    changes: [
      ["components/riffs/ideas-screen.tsx", "Drop list and detail. One Card per riff, titled ideasFrom(riff), its angles as rows; the open angle (not the open riff) is the page state (?idea= holds an angle id). KitPage back to width=\"page\"."],
      ["components/quincy/riff-card.tsx", "RiffCard becomes SourceCard: AngleTabs and the Scrap well go; an IdeaRow (selected grey, Draft on the row) replaces AnglePanel."],
      ["docs/design/page.md", "An exception for a group of ideas: the row may hold the open idea’s Draft, as the landing picture does."],
    ],
    controls: [
      { key: "sourceRem", kind: "slider", label: "Column measure", min: 34, max: 56, step: 1, unit: "rem", why: "the picture is 41rem" },
      { key: "perSource", kind: "slider", label: "Ideas per source", min: 1, max: 5, step: 1, unit: "", why: "before “more ideas”" },
      { key: "why", kind: "choice", label: "Why line", options: [{ value: "picked", label: "Picked idea" }, { value: "always", label: "Every idea" }], why: "Angle.why" },
    ],
    View: FromSource,
  },
  {
    id: "marked",
    name: "Marked up",
    axis: "Material first: your words, with Quincy’s marks in the margin",
    bet: "Quincy is an editor (plans/029). Show what you said, underline what could be a post, and put the ideas in the margin. Provenance is not a line under the idea; it is the sentence the idea stands on.",
    givesUp: "It depends on data we do not have (Angle.line), it is the longest page per source, and a voice note full of filler is now the thing you read first. A queue of twenty is a lot of reading.",
    changes: [
      ["lib/adapt.ts", "Angle generation returns the verbatim line and a ≤ 6-word note (the data gap in quincy-riffs.md). Without it this direction does not exist."],
      ["components/riffs/ideas-screen.tsx", "One Card per riff with the scrap as prose and an ordered margin of angles; the open angle is the page state. KitPage stays wide: the margin is what the width is for."],
      ["components/quincy/riff-card.tsx", "Scrap grows from one Highlight to many marks (pen underline + number, one Highlight); AngleTabs is replaced by the margin list."],
    ],
    controls: [
      { key: "scrapRem", kind: "slider", label: "Prose measure", min: 26, max: 46, step: 1, unit: "rem", why: "about 70 characters at 34" },
      { key: "marginRem", kind: "slider", label: "Margin", min: 11, max: 24, step: 1, unit: "rem", why: "the idea column" },
      { key: "others", kind: "choice", label: "Other ideas", options: [{ value: "underlined", label: "Underlined" }, { value: "unmarked", label: "Unmarked" }], why: "one Highlight per object" },
    ],
    View: MarkedUp,
  },
]
