"use client"

import * as React from "react"
import {
  Calendar03Icon,
  Delete02Icon,
  InformationCircleIcon,
  Mic01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import {
  Accordion,
  AccordionItem,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogPanel,
  AlertDialogTrigger,
  Button,
  Card,
  Dialog,
  DialogClose,
  DialogFooter,
  DialogPanel,
  DialogTrigger,
  Disclosure,
  EmptyState,
  Field,
  HoldButton,
  IconButton,
  Kbd,
  List,
  ListRow,
  Mono,
  Popover,
  PopoverDescription,
  PopoverPanel,
  PopoverTrigger,
  Progress,
  Rule,
  Select,
  Sheet,
  SheetClose,
  SheetFooter,
  SheetPanel,
  SheetTrigger,
  Tag,
  Tags,
  Text,
  Textarea,
  Tooltip,
  Well,
  useToast,
} from "@/components/kit"
import { Friend } from "@/components/mascot"

const DAYS = [
  { value: "thu", label: "Thursday 19 Nov" },
  { value: "fri", label: "Friday 20 Nov" },
  { value: "mon", label: "Monday 23 Nov" },
] as const

const TIMES = [
  { value: "0745", label: "07:45, your best hour" },
  { value: "1200", label: "12:00" },
  { value: "1730", label: "17:30" },
] as const

const DRAFT =
  "We cut seat pricing to one call this week. Three customers wrote back the same day."

/* ── Dialog ── */

/** Approve, then schedule: a short task in a Dialog, closing on a toast. */
export function ScheduleDialog() {
  const [open, setOpen] = React.useState(false)
  const toast = useToast()
  const formId = React.useId()
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-kit-related">
        <div className="flex min-w-0 flex-col gap-kit-tight">
          <Text weight="strong">Seat pricing, in one call</Text>
          <Text variant="small" tone="muted">
            Approved. Not scheduled yet.
          </Text>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button variant="action" icon={Calendar03Icon}>Schedule</Button>} />
          <DialogPanel
            title="Schedule this post"
            description="It goes out from your X account. You can move it until it does."
            footer={
              <DialogFooter>
                <DialogClose>Cancel</DialogClose>
                <Button variant="action" type="submit" form={formId}>
                  Schedule
                </Button>
              </DialogFooter>
            }
          >
            <form
              id={formId}
              className="flex flex-col gap-kit-group"
              onSubmit={(event) => {
                event.preventDefault()
                setOpen(false)
                toast.show("Scheduled for Thursday 07:45.")
              }}
            >
              <Field label="Day">
                <Select options={DAYS} defaultValue="thu" name="day" />
              </Field>
              <Field label="Time">
                <Select options={TIMES} defaultValue="0745" name="time" />
              </Field>
              <Well as="blockquote">
                <Text>{DRAFT}</Text>
              </Well>
            </form>
          </DialogPanel>
        </Dialog>
      </div>
    </Card>
  )
}

const ORIGINAL = [
  "Last week we cut our pricing page from four plans to one call. I expected confusion. What happened instead: three customers wrote back the same day, and two of them asked for a call before we had even sent the follow-up.",
  "The thing I keep coming back to is that nobody missed the plans. They missed the person. Four plans asked them to do the sorting; one call let us do it.",
  "We will see if it holds at twenty customers. At three, it is the best week of replies we have had since launch.",
  "Numbers for the curious: 3 replies on day one (median 1), 2 calls booked, 0 people asking where the plans went.",
]

/** The lg dialog with a body long enough to scroll; header and footer stay. */
export function AdaptDialog() {
  const [open, setOpen] = React.useState(false)
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-kit-related">
        <Text weight="strong">One call, not four plans</Text>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button>Adapt for LinkedIn</Button>} />
          <DialogPanel
            size="lg"
            title="Adapt for LinkedIn"
            description="Quincy keeps your words and changes the shape. The X version stays as it is."
            footer={
              <DialogFooter>
                <DialogClose>Cancel</DialogClose>
                <Button variant="action" onClick={() => setOpen(false)}>
                  Adapt it
                </Button>
              </DialogFooter>
            }
          >
            <div className="flex flex-col gap-kit-group pb-1">
              <Well as="blockquote">
                {ORIGINAL.map((p) => (
                  <Text key={p}>{p}</Text>
                ))}
              </Well>
              <Field label="Anything to change?" description="A line is enough. Quincy asks if it needs more.">
                <Textarea name="note" rows={4} placeholder="Lead with the three replies" />
              </Field>
              <Text tone="muted">
                The adaptation keeps the three beats: what you did, what happened,
                what it meant. The number goes on its own line.
              </Text>
            </div>
          </DialogPanel>
        </Dialog>
      </div>
    </Card>
  )
}

/* ── AlertDialog and HoldButton ── */

/** Genuinely irreversible, and the consequence is off screen: an AlertDialog. */
export function DiscardLastVersion() {
  const [gone, setGone] = React.useState(false)
  if (gone) {
    return (
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-kit-related">
          <Text tone="muted">Discarded “Shipped the export”.</Text>
          <Button onClick={() => setGone(false)}>Reset the demo</Button>
        </div>
      </Card>
    )
  }
  return (
    <Card>
      <div className="flex flex-col gap-kit-related">
        <div className="flex flex-col gap-kit-tight">
          <Text weight="strong">Shipped the export</Text>
          <Text variant="small" tone="muted">
            X version · the only one left
          </Text>
        </div>
        <div>
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="danger" icon={Delete02Icon}>Discard</Button>} />
            <AlertDialogPanel
              title="Discard “Shipped the export”?"
              description="This is the only version left, so the whole piece goes with it. It cannot be brought back."
            >
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction
                pendingLabel="Discarding…"
                onConfirm={async () => {
                  await new Promise((r) => setTimeout(r, 700))
                  setGone(true)
                }}
              >
                Discard
              </AlertDialogAction>
            </AlertDialogPanel>
          </AlertDialog>
        </div>
      </div>
    </Card>
  )
}

/** Incorrect: a dialog for a step the person is already looking at. */
export function DisconnectByDialog() {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-kit-related">
        <Text weight="strong">
          X <Mono>@christer</Mono>
        </Text>
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="danger">Disconnect</Button>} />
          <AlertDialogPanel
            title="Disconnect X?"
            description="Quincy stops posting to @christer. Scheduled posts wait until you connect again."
          >
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onConfirm={() => {}}>Disconnect</AlertDialogAction>
          </AlertDialogPanel>
        </AlertDialog>
      </div>
    </Card>
  )
}

/** Correct: the hold is the confirmation, on the row it acts on. */
export function DisconnectByHold() {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-kit-related">
        <Text weight="strong">
          X <Mono>@christer</Mono>
        </Text>
        <HoldButton doneLabel="Disconnected" onConfirm={() => new Promise((r) => setTimeout(r, 400))}>
          Disconnect
        </HoldButton>
      </div>
    </Card>
  )
}

/* ── Sheet ── */

/** Something you work in, with the page behind it: a side panel, a bottom sheet on a phone. */
export function RecordSheet() {
  const [open, setOpen] = React.useState(false)
  const toast = useToast()
  const formId = React.useId()
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-kit-related">
        <Text tone="muted">Nothing recorded today.</Text>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger render={<Button variant="action" icon={Mic01Icon}>Record a thought</Button>} />
          <SheetPanel
            title="Tell me about your week"
            description="Type it or say it. I'll find the post in it."
            footer={
              <SheetFooter>
                <SheetClose>Cancel</SheetClose>
                <Button variant="action" type="submit" form={formId}>
                  Find the post
                </Button>
              </SheetFooter>
            }
          >
            <form
              id={formId}
              onSubmit={(event) => {
                event.preventDefault()
                setOpen(false)
                toast.show("Saved. Quincy is reading it now.")
              }}
            >
              <Field label="What happened" description="A sentence is enough to start.">
                <Textarea name="note" rows={6} placeholder="We shipped the export on Tuesday and…" />
              </Field>
            </form>
          </SheetPanel>
        </Sheet>
      </div>
    </Card>
  )
}

const SOURCES = [
  ["walk-tuesday.m4a", "4:12"],
  ["Customer call, Acme", "32:40"],
  ["Pricing page notes", "1 page"],
  ["Support thread #212", "14 messages"],
  ["Standup, Monday", "9:05"],
  ["Launch retro", "3 pages"],
  ["walk-thursday.m4a", "6:48"],
  ["Sales call, Northwind", "28:10"],
  ["Roadmap draft", "2 pages"],
  ["Changelog, week 46", "1 page"],
  ["Founder notes", "5 pages"],
  ["Investor update, Oct", "2 pages"],
] as const

/** A long sheet: the header stays, the list scrolls under it. */
export function SourcesSheet() {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-kit-related">
        <Text weight="strong">
          Read this week <Mono>12 sources</Mono>
        </Text>
        <Sheet>
          <SheetTrigger render={<Button>Show sources</Button>} />
          <SheetPanel title="What Quincy read" description="This week, newest first. Open one to see what came from it.">
            <div className="-mx-4 flex flex-col pb-1">
              {SOURCES.map(([name, meta]) => (
                <ListRow key={name} meta={<Mono>{meta}</Mono>}>
                  {name}
                </ListRow>
              ))}
            </div>
          </SheetPanel>
        </Sheet>
      </div>
    </Card>
  )
}

/* ── Popover ── */

/** Why a slot is this time: small, beside the thing, the page still live. */
export function WhyThisTime() {
  return (
    <Card>
      <div className="flex items-center justify-between gap-kit-related">
        <div className="flex min-w-0 flex-col gap-kit-tight">
          <Text weight="strong">Seat pricing, in one call</Text>
          <Text variant="small" tone="muted">
            Goes out <Mono tone="ink">Thu 07:45</Mono>
          </Text>
        </div>
        <Popover>
          <PopoverTrigger render={<IconButton icon={InformationCircleIcon} aria-label="Why 07:45" />} />
          <PopoverPanel title="Why 07:45" align="end">
            <PopoverDescription>
              Your last 12 posts that went out between 07:00 and 08:00 got 1.8× your
              median replies.
            </PopoverDescription>
            <div>
              <Button>Pick another time</Button>
            </div>
          </PopoverPanel>
        </Popover>
      </div>
    </Card>
  )
}

/* ── Tooltip and Kbd ── */

function TooltipRow({ pinned }: { pinned: boolean }) {
  const edited = (
    <span tabIndex={0} className="rounded-kit-chip outline-hidden focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-focus">
      <Mono>2h ago</Mono>
    </span>
  )
  const approve = (
    <Button variant="action" icon={Tick02Icon}>
      Approve
    </Button>
  )
  return (
    <div className="flex flex-wrap items-center justify-between gap-kit-related">
      <Text>
        Seat pricing, in one call{" "}
        {pinned ? (
          <Tooltip open side="bottom" content="Edited Mon 16 Nov, 09:12">
            {edited}
          </Tooltip>
        ) : (
          <Tooltip content="Edited Mon 16 Nov, 09:12">{edited}</Tooltip>
        )}
      </Text>
      {pinned ? (
        <Tooltip open content="Schedules it for Thu 07:45" shortcut={["mod", "enter"]}>
          {approve}
        </Tooltip>
      ) : (
        <Tooltip content="Schedules it for Thu 07:45" shortcut={["mod", "enter"]}>
          {approve}
        </Tooltip>
      )}
    </div>
  )
}

/** Point at the time or the button; "Pin open" holds both so they can be read. */
export function TooltipDemo() {
  const [pinned, setPinned] = React.useState(false)
  return (
    <div className="flex w-full flex-col gap-kit-related">
      <Card>
        <TooltipRow key={String(pinned)} pinned={pinned} />
      </Card>
      <div>
        <Button onClick={() => setPinned((p) => !p)} aria-pressed={pinned}>
          {pinned ? "Let go" : "Pin open"}
        </Button>
      </div>
    </div>
  )
}

export function KbdDemo() {
  return (
    <Card>
      <div className="flex flex-col gap-kit-related">
        <Text>
          Press <Kbd keys={["mod", "B"]} /> to show or hide the sidebar.
        </Text>
        <Text tone="muted">
          <Kbd keys={["mod", "enter"]} /> sends, <Kbd keys={["esc"]} /> closes.
        </Text>
      </div>
    </Card>
  )
}

/* ── Toast ── */

export function ToastDemo() {
  const toast = useToast()
  return (
    <Card>
      <div className="flex flex-col gap-kit-related">
        <Text tone="muted">Each one replaces the last. They never stack.</Text>
        <div className="flex flex-wrap gap-kit-controls">
          <Button onClick={() => toast.show("Scheduled for Thursday 07:45.")}>After a dialog</Button>
          <Button
            onClick={() =>
              toast.show("Quincy drafted “Why seats confuse buyers”.", {
                action: { label: "Open", onClick: () => {} },
              })
            }
          >
            Quincy finished
          </Button>
          <Button
            onClick={() =>
              toast.show("Removed walk-tuesday.m4a from your sources.", {
                action: {
                  label: "Undo",
                  onClick: () => toast.show("Put walk-tuesday.m4a back."),
                },
              })
            }
          >
            Removed off screen
          </Button>
        </div>
      </div>
    </Card>
  )
}

/* ── Disclosure and Accordion ── */

export function DisclosureDemo() {
  return (
    <Card>
      <div className="flex flex-col gap-kit-related">
        <Text>{DRAFT}</Text>
        <Rule />
        <Disclosure summary="Why Quincy picked this angle" meta="3 sources">
          <div className="flex flex-col gap-kit-related">
            <Text tone="muted">
              Two of your last three posts about pricing got more replies than your
              median. This one has a number in it, and the reply came the same day.
            </Text>
            <Tags>
              <Tag>Customer call</Tag>
              <Tag>Support thread</Tag>
              <Tag>Voice note</Tag>
            </Tags>
          </div>
        </Disclosure>
      </div>
    </Card>
  )
}

export function AccordionDemo() {
  return (
    <Card>
      <Accordion defaultValue={["voice"]}>
        <AccordionItem value="voice" summary="Voice" meta="12 rules">
          <Text tone="muted">
            First person, short sentences, the number on its own line. No “excited
            to announce”.
          </Text>
        </AccordionItem>
        <AccordionItem value="audience" summary="Who reads you" meta="3 groups">
          <Text tone="muted">Founders selling to finance teams, ops leads, a few investors.</Text>
        </AccordionItem>
        <AccordionItem value="never" summary="Never say" meta="4 phrases">
          <Text tone="muted">“Game-changer”, “thrilled”, “we’re humbled”, “in today’s landscape”.</Text>
        </AccordionItem>
      </Accordion>
    </Card>
  )
}

/* ── Empty ── */

export function EmptyLineup() {
  return (
    <EmptyState
      media={<Friend size={40} state="idle" />}
      bold="Nothing planned for this week."
      rest="Tell me what you shipped and I'll find the post in it."
      baseline="Your usual week has three posts."
    >
      <Button variant="action" icon={Mic01Icon}>
        Record a thought
      </Button>
    </EmptyState>
  )
}

/** Incorrect: an icon in a tinted circle, and a sentence from a database. */
export function EmptyAsPoster() {
  return (
    <Card>
      <div className="flex flex-col items-center gap-kit-related py-6 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-kit-well text-kit-ink-muted">
          <HugeiconsIcon icon={Calendar03Icon} size={20} strokeWidth={2} aria-hidden />
        </span>
        <Text weight="strong">No items found</Text>
        <Text tone="muted">There are no scheduled posts.</Text>
      </div>
    </Card>
  )
}

/** Correct: the friend, a person's sentence, centred, with the one way in. */
export function EmptyAsSentence() {
  return (
    <EmptyState bold="Nothing planned yet." rest="Tell me what you shipped.">
      <Button icon={Mic01Icon}>Record a thought</Button>
    </EmptyState>
  )
}

/** Inside an object that is already there: no second card. */
export function EmptyInList() {
  return (
    <List>
      <div className="px-4 py-3">
        <EmptyState frame="none" bold="No ideas waiting." rest="The next ones come from what you record." />
      </div>
    </List>
  )
}

/* ── Progress ── */

export function ReadingProgress() {
  const [read, setRead] = React.useState(1)
  return (
    <Card>
      <div className="flex flex-col gap-kit-group">
        <div className="flex items-center gap-kit-related">
          <Friend size={24} state={read < 3 ? "reading" : "idle"} />
          <Text weight="strong">
            {read < 3 ? "Quincy is reading 3 sources" : "Quincy read 3 sources"}
          </Text>
        </div>
        <Progress label="Reading your sources" value={read} max={3} count />
        <Progress label="Importing your posts" value={null} />
        <div className="flex flex-wrap gap-kit-controls">
          <Button disabled={read >= 3} onClick={() => setRead((n) => Math.min(3, n + 1))}>
            Next source
          </Button>
          <Button onClick={() => setRead(0)}>Start over</Button>
        </div>
      </div>
    </Card>
  )
}
