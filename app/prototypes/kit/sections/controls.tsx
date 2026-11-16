import * as React from "react"

import {
  BareSwitch,
  ChoiceCollage,
  DaySelect,
  DoneInInk,
  FieldLabel,
  FormDemo,
  IconAction,
  LabelledSwitch,
  PanelCollage,
  PlaceholderLabel,
  RowsAndChecks,
  SevenSegments,
  StruckThrough,
  TabsDemo,
  WordAction,
} from "../controls-demos"
import { Code, Demo, P, Pair, type Section } from "../doc"

export const controls: Section[] = [
  {
    id: "controls",
    title: "Choices",
    group: "Controls",
    doc: "controls.md",
    body: (
      <>
        <P>
          Controls are tactile white objects, after Stageshow&apos;s hero
          collage: a ring and a short soft fall, 12px radius or round, 36px
          tall. The picked segment is the ink thumb with the ground on it; a
          picked row is the selected grey. Which
          control: 2–5 short options is <Code>Segmented</Code>, 6 or more is{" "}
          <Code>Select</Code>, on/off is <Code>Switch</Code>, a counted number
          is <Code>Stepper</Code>, a rough position is <Code>Slider</Code>.
        </P>
        <Demo
          backdrop="grid"
          caption="Segmented, Switch in its row, Stepper, Slider with its number in Mono. Every one keeps a 44px hit area on touch."
        >
          <ChoiceCollage />
        </Demo>
        <Pair
          incorrect={{
            caption: "Seven segments: no label has room. Over five is a Select.",
            children: <SevenSegments />,
          }}
          correct={{
            caption: "A Select for the seven days.",
            children: <DaySelect />,
          }}
        />
        <Pair
          incorrect={{
            caption: "A bare switch: the off track is 1.31:1 and nothing says what it does.",
            children: <BareSwitch />,
          }}
          correct={{
            caption: "The label makes the whole row the switch.",
            children: <LabelledSwitch />,
          }}
        />
      </>
    ),
  },
  {
    id: "tabs",
    title: "Tabs",
    group: "Controls",
    doc: "controls.md",
    body: (
      <>
        <P>
          Tabs look exactly like Segmented and differ in what they mean. If
          picking swaps the content below, it is <Code>Tabs</Code>; if it picks
          a value that is saved or submitted, it is <Code>Segmented</Code>.
        </P>
        <Demo caption="Tabs swap the panel. Arrow keys move, Enter or Space opens.">
          <TabsDemo />
        </Demo>
      </>
    ),
  },
  {
    id: "menus",
    title: "Select, Menu, small controls",
    group: "Controls",
    doc: "menus.md",
    body: (
      <>
        <P>
          Select and Menu open the same white panel. If the row stores a value
          the trigger then shows, it is <Code>Select</Code>; if it runs a
          command, it is <Code>Menu</Code>, with destructive rows last in red.{" "}
          <Code>IconButton</Code> is round and never filled: the one action has a
          word on it.
        </P>
        <Demo
          backdrop="grid"
          caption="Select, a Menu opened from an IconButton, SearchField (Escape clears), FileChips you can remove."
        >
          <PanelCollage />
        </Demo>
        <Pair
          incorrect={{
            caption: "The main action as an unlabelled round icon.",
            children: <IconAction />,
          }}
          correct={{
            caption: "The action has a word; the icon button is secondary.",
            children: <WordAction />,
          }}
        />
      </>
    ),
  },
  {
    id: "rows",
    title: "Rows and Checklist",
    group: "Controls",
    doc: "lists.md",
    body: (
      <>
        <P>
          <Code>NavRow</Code> goes to a page; <Code>ListRow</Code> opens the
          thing it names. Both are 44px, grey on hover, tinted when current,
          and both sit in a <Code>List</Code>, with a{" "}
          <Code>ListHeading</Code> over each day when they span several.{" "}
          <Code>Checklist</Code> is done and not done: a filled green circle,
          the words stay in ink.
        </P>
        <Demo backdrop="grid" caption="Rows sit in a List: a Card with a 6px row inset, so the 12px row radius nests in the 18px object. ListHeading labels the days when the rows span more than one.">
          <RowsAndChecks />
        </Demo>
        <Pair
          incorrect={{
            caption: "Done struck through and greyed: Quincy does not grade.",
            children: <StruckThrough />,
          }}
          correct={{
            caption: "A filled circle; the words stay in ink.",
            children: <DoneInInk />,
          }}
        />
      </>
    ),
  },
  {
    id: "forms",
    title: "Forms",
    group: "Controls",
    doc: "forms.md",
    body: (
      <>
        <P>
          A real <Code>&lt;form&gt;</Code>, so Enter submits. Each control sits
          in a <Code>Field</Code> with a visible label. Errors appear under
          their own field after you leave it once, then clear as you type. One
          action, with a pending label.
        </P>
        <Demo caption="Type an address without an @ and leave the field. ⌘/Ctrl+Enter in the textarea submits.">
          <FormDemo />
        </Demo>
        <Pair
          incorrect={{
            caption: "The placeholder is the label, and it leaves on the first keystroke.",
            children: <PlaceholderLabel />,
          }}
          correct={{
            caption: "Field gives it a label that stays.",
            children: <FieldLabel />,
          }}
        />
      </>
    ),
  },
]
