import * as React from "react"

import { Mono, ToastProvider } from "@/components/kit"

import { Code, Demo, P, Pair, type Section } from "../doc"
import {
  AccordionDemo,
  AdaptDialog,
  DisclosureDemo,
  DiscardLastVersion,
  DisconnectByDialog,
  DisconnectByHold,
  EmptyAsPoster,
  EmptyAsSentence,
  EmptyInList,
  EmptyLineup,
  KbdDemo,
  ReadingProgress,
  RecordSheet,
  ScheduleDialog,
  SourcesSheet,
  ToastDemo,
  TooltipDemo,
  WhyThisTime,
} from "../overlays-demos"

/**
 * Overlays and feedback (round 2): Dialog, AlertDialog, Sheet, Popover,
 * Tooltip, Toast, Disclosure, Accordion, EmptyState, Progress, Kbd. All on
 * Base UI, all portalled ones carrying the kit's type (overlay-styles.ts).
 * Each body that raises a toast has its own ToastProvider, so the lab page
 * itself stays untouched.
 */
export const overlays: Section[] = [
  {
    id: "dialog",
    title: "Dialog",
    group: "Overlays",
    doc: "surfaces.md",
    body: (
      <ToastProvider>
        <P>
          A short task that has to be finished or dropped before the page goes
          on. The biggest white object in the kit: 24 radius, the lifted
          elevation, over the scrim. Title 14/560, one muted sentence, the body,
          then the buttons: quiet first, the one action last. Escape, the scrim
          and the round close button all close it, and focus goes back to the
          button that opened it.
        </P>
        <P>
          On a phone it stays centred with a 16px gutter and its buttons stack
          full width, the action on top. It does not turn into a bottom sheet:
          a panel rising from the bottom edge promises a swipe, and a dialog
          has none. That is what <Code>Sheet</Code> is for. Under reduced
          motion it fades without the rise.
        </P>
        <Demo caption="Schedule: a form in the body, submitted from the footer. Closing on Schedule leaves a toast, because the dialog that would have said it is gone.">
          <ScheduleDialog />
        </Demo>
        <Demo caption="size=&quot;lg&quot; (560) with a body taller than the screen: the header and the footer stay, the body scrolls between them.">
          <AdaptDialog />
        </Demo>
      </ToastProvider>
    ),
  },
  {
    id: "alert-dialog",
    title: "AlertDialog or HoldButton",
    group: "Overlays",
    doc: "removing.md",
    body: (
      <>
        <P>
          Three ways to take something away, by what can be brought back. If
          an Undo can, do it at once and show an <Code>UndoBar</Code>. If it
          cannot, but the person is looking at the thing it acts on, it is a{" "}
          <Code>HoldButton</Code>: the hold is the confirmation. Only when it
          cannot be undone and the consequence is off screen is it an{" "}
          <Code>AlertDialog</Code>, whose sentence says what the person cannot
          see. It has no close button and the scrim does not close it; focus
          starts on Keep it, so a reflexive Enter keeps the thing.
        </P>
        <Demo caption="The last version of a piece: discarding it takes the whole piece, which is not on screen. The action may be async; the dialog stays open while it runs.">
          <DiscardLastVersion />
        </Demo>
        <Pair
          incorrect={{
            caption: "A dialog for a step the person is already looking at: the second click becomes a reflex.",
            children: <DisconnectByDialog />,
          }}
          correct={{
            caption: "Hold for 1.2s on the row itself; letting go cancels.",
            children: <DisconnectByHold />,
          }}
        />
      </>
    ),
  },
  {
    id: "sheet",
    title: "Sheet",
    group: "Overlays",
    doc: "surfaces.md",
    body: (
      <ToastProvider>
        <P>
          Something you work in, with the page still behind it: record a
          thought, read the sources, edit a rhythm. From 40rem a white panel 400
          wide floats 8px off the right edge; under it, a bottom sheet with a
          grab mark and the top corners round. Both swipe away (right, or down)
          on Base UI&apos;s Drawer, and the scrim thins as you swipe. It is the
          app shell&apos;s phone sidebar, generalised: scrim, focus trapped,
          focus back to the trigger. Reduced motion: it fades in place.
        </P>
        <Demo caption="A form in the body, submitted from the footer.">
          <RecordSheet />
        </Demo>
        <Demo caption="Twelve rows: the header stays, the list scrolls.">
          <SourcesSheet />
        </Demo>
      </ToastProvider>
    ),
  },
  {
    id: "popover",
    title: "Popover and Tooltip",
    group: "Overlays",
    doc: "surfaces.md",
    body: (
      <>
        <P>
          A <Code>Popover</Code> holds something to read or press beside the
          thing it is about, with no scrim: the white object, lifted, 18 radius,
          scaling from its trigger. No arrow: the kit&apos;s objects have none,
          and a ring-and-shadow edge cannot draw one that matches it.
        </P>
        <Demo caption="Why this slot: the IconButton's only job is to open it, so it is a Popover, not a Tooltip. Press outside or Escape to close.">
          <WhyThisTime />
        </Demo>
        <P>
          A <Code>Tooltip</Code> is a small ink chip, the ground reversed, so it
          reads as a note from the product and never as an object to press. It
          says what is not on screen (an exact time, what Approve will do),
          never the control&apos;s own name. Its timing is the one provider in{" "}
          <Code>app-providers.tsx</Code> (200ms, then neighbours open at once).
          It never opens on touch, so nothing may live only in it.
        </P>
        <Demo caption="Point at the time or at Approve. Pin open holds both, for reading.">
          <TooltipDemo />
        </Demo>
        <Demo caption="Kbd: ⌘ on Apple, Ctrl elsewhere, read after mount. Screen readers hear “Command+B”.">
          <KbdDemo />
        </Demo>
      </>
    ),
  },
  {
    id: "toast",
    title: "Toast",
    group: "Overlays",
    doc: "removing.md",
    body: (
      <ToastProvider>
        <P>
          One quiet line at the bottom centre, white and lifted, at most one
          action. One at a time: a new one replaces the last. It is for a result
          that lands where the person is not looking (a dialog closed, Quincy
          finished in the background). A removal from the list in front of them
          is an <Code>UndoBar</Code>, which stands in the removed item&apos;s
          place, takes focus and never times out; the two stay separate. A plain
          toast leaves after <Mono>5s</Mono>, one with an action after{" "}
          <Mono>10s</Mono>, both paused while pointed at or focused (F6 reaches
          it). Swipe it away down or sideways.
        </P>
        <Demo caption="Three reasons for a toast. Each replaces the one before.">
          <ToastDemo />
        </Demo>
      </ToastProvider>
    ),
  },
  {
    id: "disclosure",
    title: "Disclosure and Accordion",
    group: "Overlays",
    doc: "lists.md",
    body: (
      <>
        <P>
          A <Code>Disclosure</Code> shows or hides one thing in place: Quincy&apos;s
          reasoning, the numbers behind an angle. The row is 44px, grey on hover
          like a ListRow, the chevron turns, the panel grows its height. The
          summary should say enough that most people never open it. Several
          that belong together are an <Code>Accordion</Code>, divided by
          hairlines, one open at a time unless <Code>multiple</Code>.
        </P>
        <Demo caption="Closed by default. Only the vertical axis clips while it moves, so focus rings inside are never cut.">
          <DisclosureDemo />
        </Demo>
        <Demo caption="Arrow keys move between the rows, Home and End jump.">
          <AccordionDemo />
        </Demo>
      </>
    ),
  },
  {
    id: "empty",
    title: "EmptyState (kit)",
    group: "Overlays",
    doc: "states.md",
    body: (
      <>
        <P>
          Nothing here yet, said by a person who has run out of work, with the
          person&apos;s own baseline under it and the one way in. Centred in
          the region it replaces, the friend above the words.{" "}
          <Code>frame=&quot;none&quot;</Code> drops the card for inside an object
          that is already there.
        </P>
        <Demo caption="The empty Lineup: the friend, the lead, the baseline, one action.">
          <EmptyLineup />
        </Demo>
        <Pair
          incorrect={{
            caption: "An icon in a tinted circle and a sentence from a database.",
            children: <EmptyAsPoster />,
          }}
          correct={{
            caption: "A person's sentence and the one way in.",
            children: <EmptyAsSentence />,
          }}
        />
        <Demo caption="Inside a List: frame=&quot;none&quot;, so there is no card in a card.">
          <EmptyInList />
        </Demo>
      </>
    ),
  },
  {
    id: "progress",
    title: "Progress",
    group: "Overlays",
    doc: "states.md",
    body: (
      <>
        <P>
          How far a job has got, when it lasts long enough to watch. The label
          in ink, the count in Mono at its end (“1 of 3”, which is also what a
          screen reader hears), a 6px bar: the track grey, the fill ink. With
          no count yet a third of the bar slides; under reduced motion it stands
          still in the middle and the fill jumps instead of easing.
        </P>
        <Demo caption="Quincy reading three sources, and an import with no count yet.">
          <ReadingProgress />
        </Demo>
        <P>
          Not new this round: a divider inside an object is <Code>Rule</Code>{" "}
          (there is no Separator), and a label is <Code>Tag</Code> (there is no
          Badge; a status is a sentence, with a LiveDot when it is running).
        </P>
      </>
    ),
  },
]
