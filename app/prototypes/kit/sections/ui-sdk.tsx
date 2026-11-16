import * as React from "react"

import {
  CalendarDemo,
  CalendarStates,
  CommandPaletteDemo,
  CommandPaletteStates,
  DateTimeDemo,
  DateTimeStates,
  ReorderDemo,
  ReorderStates,
  TokenInputDemo,
  TokenInputStates,
  TreeDemo,
  TreeStates,
} from "../ui-sdk-demos"
import { Code, Demo, P, type Section } from "../doc"

/**
 * The components Base UI does not cover, built on ui-sdk (beta). Each file
 * in components/kit/ says so in its header. One component never mixes the
 * two layers.
 */
export const uiSdk: Section[] = [
  {
    id: "command-palette",
    title: "Command palette",
    group: "Controls",
    doc: "controls.md",
    body: (
      <>
        <P>
          <Code>CommandPalette</Code> jumps to a page, opens a recent draft, or
          hands what you typed to Quincy. ⌘K on a Mac, Ctrl+K elsewhere; both
          keys work on every platform, only the hint chooses. “Ask Quincy” is
          always the last row, so a search that finds nothing still goes
          somewhere.
        </P>
        <Demo backdrop="grid" caption="Type “line” for Lineup, “churn” for a draft, or anything for Ask Quincy. Rows highlight in the selected grey, never blue.">
          <CommandPaletteDemo />
        </Demo>
        <Demo caption="Drafts loading, or failed with a Try again row. Pages still work in both: the palette never blocks on what loads.">
          <CommandPaletteStates />
        </Demo>
      </>
    ),
  },
  {
    id: "token-input",
    title: "Token input",
    group: "Controls",
    doc: "forms.md",
    body: (
      <>
        <P>
          <Code>TokenInput</Code> holds channels, tags and sources as chips. A
          comma, Enter, leaving the field, or a paste turns text into chips;
          Backspace takes the chip before the caret. Duplicates and words that
          <Code>normalize</Code> refuses never become chips.
        </P>
        <Demo backdrop="grid" caption="Channels only accept real channel names; tags are lower-case with dashes, five at most.">
          <TokenInputDemo />
        </Demo>
        <Demo caption="Empty with a placeholder, an error beside its field, read-only, disabled.">
          <TokenInputStates />
        </Demo>
      </>
    ),
  },
  {
    id: "calendar",
    title: "Calendar",
    group: "Controls",
    doc: "controls.md",
    body: (
      <>
        <P>
          <Code>Calendar</Code> is the month for scheduling: Monday first, a
          ring on today, the ink thumb on the picked day, and a dot for each
          post already there (three at most). Arrow keys move by day, PageUp
          and PageDown by month.
        </P>
        <Demo backdrop="grid" caption="Today is Mon 16 Nov. Days before it cannot be picked; dots are scheduled posts.">
          <CalendarDemo />
        </Demo>
        <Demo caption="Schedule loading, failed (days still pick), weekends unavailable, disabled.">
          <CalendarStates />
        </Demo>
      </>
    ),
  },
  {
    id: "date-time-picker",
    title: "Date and time",
    group: "Controls",
    doc: "forms.md",
    body: (
      <>
        <P>
          <Code>DateTimePicker</Code> schedules a post into one of your
          posting times. Picking a day keeps it open; picking a time commits
          and closes. Taken times stay in the grid, struck through, so the
          shape of the week is never hidden.
        </P>
        <Demo backdrop="grid" caption="Wed 18 Nov has two posts, so two of its times are taken. Mon 23 Nov is full.">
          <DateTimeDemo />
        </Demo>
        <Demo caption="With a value, with an error beside it, with no posting times set, disabled.">
          <DateTimeStates />
        </Demo>
      </>
    ),
  },
  {
    id: "reorderable",
    title: "Reorderable list",
    group: "Controls",
    doc: "lists.md",
    body: (
      <>
        <P>
          <Code>Reorderable</Code> is the week’s lineup in order. Drag by the
          grip, or focus a row and press Space, the arrows, then Space again;
          Escape puts it back. Each step is announced (“position 2 of 5”).
          The day belongs to the position, so moving a post moves its day.
        </P>
        <Demo backdrop="grid" caption="The picked-up row lifts. Nothing changes colour.">
          <ReorderDemo />
        </Demo>
        <Demo caption="Empty, and locked while the week is publishing.">
          <ReorderStates />
        </Demo>
      </>
    ),
  },
  {
    id: "tree",
    title: "Tree",
    group: "Controls",
    doc: "lists.md",
    body: (
      <>
        <P>
          <Code>Tree</Code> is the brain’s page hierarchy. Up and Down move,
          Right opens a branch, Left closes it, typing a letter jumps to a
          page. The open page is the selected grey.
        </P>
        <Demo backdrop="grid" caption="“Pricing” is open, so Topics starts expanded.">
          <TreeDemo />
        </Demo>
        <Demo caption="Loading, failed with Try again, empty.">
          <TreeStates />
        </Demo>
      </>
    ),
  },
]
