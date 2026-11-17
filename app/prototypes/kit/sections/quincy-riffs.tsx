import * as React from "react"

import {
  AskLineDemo,
  AskYesDemo,
  ConversationDemo,
  EmptyLinkDemo,
  EmptyStartersDemo,
  ReplyFailedDemo,
  RiffCardDemo,
  RiffStatesDemo,
  RiffTitlesDemo,
  SourceMarksDemo,
  StreamingDemo,
} from "../quincy-riffs-demos"
import { StudioThreadDemo } from "../studio-demos"
import { Code, Demo, P, type Section } from "../doc"

/**
 * The idea and conversation family of Quincy cards (plans/030 #2, #3, #8,
 * #9, #10). The code says riff and angle; the person reads "ideas".
 */
export const quincyRiffs: Section[] = [
  {
    id: "riff-card",
    title: "RiffCard and AngleTabs",
    group: "Quincy cards",
    doc: "quincy-riffs.md",
    body: (
      <>
        <P>
          One piece of raw material, open: where it came from, what the person
          said in a <Code>Well</Code> with the sentence the open idea stands on
          highlighted, the ideas as <Code>AngleTabs</Code>, and one verb, Draft
          this idea. Dismiss sits under a <Code>Rule</Code>, and an{" "}
          <Code>UndoBar</Code> stands where the card was. The word on screen is
          always &ldquo;idea&rdquo;, never the code name.
        </P>
        <Demo
          lead="Three ways in, from one walk."
          rest="Each idea stands on a sentence you said."
          caption="Switch tabs: the highlighter and the note move to that idea's sentence. Draft the Essay: Substack is not connected, so the refusal and its way out replace the button. Dismiss: the card folds away and Undo takes focus."
        >
          <RiffCardDemo />
        </Demo>
        <Demo caption="Working is the friend and words; failed says why in ink, with Try again. No skeleton, no red.">
          <RiffStatesDemo />
        </Demo>
        <Demo caption="The row title: the first idea's hook; while reading, the first sentence with the filler stripped; with no words yet, the source.">
          <RiffTitlesDemo />
        </Demo>
      </>
    ),
  },
  {
    id: "quincy-reply",
    title: "QuincyReply and YourTurn",
    group: "Quincy cards",
    doc: "quincy-chat.md",
    body: (
      <>
        <P>
          Your turn is the only bubble. Quincy&apos;s reply is a marked-up
          page: markdown in the kit preset (<Code>.typeset-kit</Code>), your
          words quoted back in a Well with the highlight and a note, and one
          action.
        </P>
        <Demo caption="Draft it sends your turn; Quincy's next reply arrives under it.">
          <ConversationDemo />
        </Demo>
        <Demo caption="Stream it: the markdown arrives in chunks. Earlier paragraphs never restyle; half a ** never shows.">
          <StreamingDemo />
        </Demo>
        <Demo caption="A reply that did not arrive: one sentence and Try again.">
          <ReplyFailedDemo />
        </Demo>
        <Demo caption="Studio, scripted (lib/chat-fixtures): thinking holds until the card lands, the draft streams into a DraftCard, Approve runs in memory.">
          <StudioThreadDemo />
        </Demo>
      </>
    ),
  },
  {
    id: "quincy-asks",
    title: "QuincyAsks",
    group: "Quincy cards",
    doc: "quincy-chat.md",
    body: (
      <>
        <P>
          One question from Quincy, answered in a line, with its evidence in
          the sentence. Not a card of its own: it sits in the object it is
          about. Answered or declined, it folds away.
        </P>
        <Demo caption="A story gap: one Input in a real form. The submit becomes the ink action only while it holds your words.">
          <AskLineDemo />
        </Demo>
        <Demo caption="A rule offer: one yes, and Not now.">
          <AskYesDemo />
        </Demo>
      </>
    ),
  },
  {
    id: "empty-state",
    title: "EmptyState",
    group: "Quincy cards",
    doc: "quincy-chat.md",
    body: (
      <>
        <P>
          Empty sounds like a person who has run out of work and wants yours: a
          Lead, the person&apos;s own baseline, and one way in.
        </P>
        <Demo caption="EmptyStarters: pick one and Quincy's next question arrives under the rows.">
          <EmptyStartersDemo />
        </Demo>
        <Demo caption="Or one ButtonLink. Never both.">
          <EmptyLinkDemo />
        </Demo>
      </>
    ),
  },
  {
    id: "source-mark",
    title: "SourceMark and ProvenanceMark",
    group: "Quincy cards",
    doc: "quincy-sources.md",
    body: (
      <>
        <P>
          Where a thing came from, on one muted line. <Code>SourceMark</Code>{" "}
          is the kit&apos;s mark beside <Code>FileChip</Code>;{" "}
          <Code>ProvenanceMark</Code> adds the post someone else wrote, when
          the idea is borrowed.
        </P>
        <Demo caption="Voice, a pull request, a channel, typed material, and a pasted post with its original.">
          <SourceMarksDemo />
        </Demo>
      </>
    ),
  },
]
