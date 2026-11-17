import * as React from "react"

import {
  ButtonAsAnchor,
  DismissWithUndo,
  EveryRowBlue,
  Links,
  ListAndDetail,
  PickIsBlue,
  RealLink,
  RedBanner,
  Refusal,
  SkeletonAsLoading,
  WhichActionWins,
  Working,
} from "../patterns-demos"
import { Code, Demo, P, Pair, type Section } from "../doc"

export const patterns: Section[] = [
  {
    id: "links",
    title: "Links",
    group: "Patterns",
    doc: "buttons.md",
    body: (
      <>
        <P>
          Going somewhere is a link, never a Button. <Code>ButtonLink</Code>{" "}
          has the Button look and is a real anchor, so it is announced as a
          link and opens in a new tab on ⌘/Ctrl-click. <Code>TextLink</Code>{" "}
          sits inside a sentence and takes the sentence&apos;s colour.
        </P>
        <Demo caption="TextLink in muted copy; ButtonLink beside a Button, the same object.">
          <Links />
        </Demo>
        <Pair
          incorrect={{
            caption: (
              <>
                <Code>Button render=&#123;&lt;a/&gt;&#125;</Code> gets{" "}
                <Code>role=&quot;button&quot;</Code>: a link announced as a button.
              </>
            ),
            children: <ButtonAsAnchor />,
          }}
          correct={{
            caption: "ButtonLink: a real link, no role.",
            children: <RealLink />,
          }}
        />
      </>
    ),
  },
  {
    id: "list-detail",
    title: "List and detail",
    group: "Patterns",
    doc: "page.md",
    body: (
      <>
        <P>
          One Stage: the list, then the open item under it, at the same width.
          The rows only open; the verbs live in the detail. Inside the object
          the four gaps are <Code>kit-tight</Code> 4, <Code>kit-controls</Code>{" "}
          6, <Code>kit-related</Code> 12 and <Code>kit-group</Code> 20. The
          quoted scrap is a <Code>Well</Code>; the angle&apos;s kind and shape
          are two <Code>Tag</Code>s.
        </P>
        <Demo
          lead="This is what came back."
          rest="Open one to see the angles I found in it."
          caption="The rows sit in a List. Pick a row: on a narrow stage the detail scrolls into view (useRevealOnNarrow) and focus stays on the row. Draft the first angle: the label holds its width while pending, then the action swaps for a link to Drafts, which takes focus."
        >
          <ListAndDetail />
        </Demo>
      </>
    ),
  },
  {
    id: "one-action",
    title: "One action per view",
    group: "Patterns",
    doc: "actions.md",
    body: (
      <>
        <P>
          A view is a Stage, and a page shows one action at a time. When the
          same verb repeats per item, only Quincy&apos;s pick is{" "}
          <Code>action</Code>; the rest are quiet. In development, a second
          action on screen in one view warns once in the console.
        </P>
        <P>
          When a page has more than one candidate, one rule decides, in order:
          what the person is in the middle of, then the open item&apos;s next
          step, then the page&apos;s standing step. A form&apos;s submit
          follows the same rule.
        </P>
        <Demo
          lead="Say what happened."
          caption="An idea is open, so its Draft is the ink action and Record is quiet. Record: Stop takes the ink. Stop, then Draft: with nothing open, Record is the step again."
        >
          <WhichActionWins />
        </Demo>
        <Pair
          incorrect={{
            caption: "Draft as the ink action on every item: repetition is not hierarchy.",
            children: <EveryRowBlue />,
          }}
          correct={{
            caption: "The pick is the action; the same verb is quiet elsewhere.",
            children: <PickIsBlue />,
          }}
        />
      </>
    ),
  },
  {
    id: "removing",
    title: "Removing things",
    group: "Patterns",
    doc: "removing.md",
    body: (
      <>
        <P>
          A dismissal you can take back is a quiet Button and an{" "}
          <Code>UndoBar</Code>. The person&apos;s own work, gone for good, is a{" "}
          <Code>HoldButton</Code>: hold 1.2s, let go to cancel. Something
          with another copy (a file still on their device) is a plain ×.{" "}
          <Code>danger</Code> is for a destructive action that is neither.
        </P>
        <Demo caption="Dismiss: the riff folds away and an UndoBar stands in its place on the stage, with focus on Undo. It never times out. Undo brings the riff back and focus with it. Hold Delete; let go early and the fill drains back.">
          <DismissWithUndo />
        </Demo>
      </>
    ),
  },
  {
    id: "states",
    title: "Working and refused",
    group: "Patterns",
    doc: "states.md",
    body: (
      <>
        <P>
          While Quincy works, the object says so in words beside the friend in
          its working state, where the result will land. When it cannot do
          something, it says why in an ink sentence and offers the way out.
          Neither is red: red is for destroying things.
        </P>
        <Pair
          incorrect={{
            caption: "Skeleton bars as a loading state: they say nothing.",
            children: <SkeletonAsLoading />,
          }}
          correct={{
            caption: "The dot pulses; the words say what and how long.",
            children: <Working />,
          }}
        />
        <Pair
          incorrect={{
            caption: "A red banner: reads as something broke.",
            children: <RedBanner />,
          }}
          correct={{
            caption: "Why, in ink, and the way out.",
            children: <Refusal />,
          }}
        />
      </>
    ),
  },
]
