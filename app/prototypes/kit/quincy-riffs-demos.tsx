"use client"

import * as React from "react"
import { Call02Icon, ChartLineData01Icon, GitMergeIcon } from "@hugeicons/core-free-icons"

import type { DraftAngleResult } from "@/lib/angle-draft"
import type { Angle, Riff } from "@/lib/riffs"
import {
  Arrive,
  Button,
  ButtonLink,
  Card,
  List,
  ListRow,
  Mono,
  SourceMark,
  Text,
  UndoBar,
  Window,
} from "@/components/kit"
import {
  EmptyStarters,
  EmptyState,
  ProvenanceMark,
  QuincyAsks,
  QuincyReply,
  ReplyActions,
  ReplyFailed,
  ReplyQuote,
  ReplyText,
  RiffCard,
  YourTurn,
  dismissedSentence,
  riffTitle,
  type AngleReading,
  type Starter,
} from "@/components/quincy"

/*
 * Client demos for the Quincy cards: riffs and conversation
 * (docs/design/quincy-riffs.md, quincy-chat.md, quincy-sources.md).
 * Fixture copy; nothing is sent anywhere, no model is called.
 */

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const RIFF: Riff = {
  id: "rif-walk",
  sourceId: "voice",
  sourceLabel: "Voice note",
  capturedAt: "Today",
  state: "ready",
  failure: "",
  stuck: false,
  adaptedFrom: null,
  scrap:
    "So the call on Tuesday, the one with the Oslo agency. I had a whole deck ready and I just didn't open it. I asked them one question, what would make you fire us in six months, and they talked for forty minutes. We signed Thursday. I think the deck was for me, not for them.",
  angles: [
    {
      id: "ang-1",
      hook: "I had a 30-slide deck ready for the Oslo call. I never opened it.",
      kind: "Story",
      shape: "Short post",
      why: "You did one thing, something happened, and you already said what it meant. All three beats are in the take.",
    },
    {
      id: "ang-2",
      hook: "The one question I now ask every agency before I pitch them.",
      kind: "Opinion",
      shape: "Thread",
      why: "The question is reusable. People save a thread they can copy into their own next call.",
    },
    {
      id: "ang-3",
      hook: "What forty minutes of listening closed that a deck never had.",
      kind: "Behind the scenes",
      shape: "Essay",
      why: "The long version, for Substack. Use it if the short post feels too thin.",
    },
  ],
}

const READINGS: Record<string, AngleReading> = {
  "ang-1": { line: "I had a whole deck ready and I just didn't open it.", note: "the turn. start here" },
  "ang-2": { line: "what would make you fire us in six months", note: "the question is the post" },
  "ang-3": { line: "I think the deck was for me, not for them.", note: "the part you meant" },
}

/** `draftAngle`, stood in: an Essay lands on Substack, which this account has not connected. */
async function draftStub(angle: Angle): Promise<DraftAngleResult> {
  await wait(900)
  if (angle.shape === "Essay") {
    return {
      ok: false,
      reason: "no-channel",
      message: "I can't draft an essay yet. Connect Substack and I'll write this one first.",
    }
  }
  return {
    ok: true,
    draftId: `drf-${angle.id}`,
    channels: angle.shape === "Thread" ? ["x"] : ["x", "linkedin"],
    written: true,
    fellBack: [],
    overLimit: [],
    existing: false,
    versions: [],
  }
}

/** One riff open, with Draft this, Dismiss and its UndoBar on the Stage. */
export function RiffCardDemo() {
  const [riff, setRiff] = React.useState(RIFF)
  const [dismissed, setDismissed] = React.useState(false)

  const onDraft = async (angle: Angle) => {
    const result = await draftStub(angle)
    // The page's refresh, stood in: the angle comes back drafted.
    if (result.ok) {
      setRiff((r) => ({
        ...r,
        angles: r.angles.map((a) => (a.id === angle.id ? { ...a, status: "drafted" as const } : a)),
      }))
    }
    return result
  }

  return (
    <>
      <Arrive show={!dismissed}>
        <RiffCard
          key={riff.id}
          riff={riff}
          readings={READINGS}
          meta="4:12"
          isAction={!dismissed}
          onDraft={onDraft}
          onDismiss={() => setDismissed(true)}
        />
      </Arrive>
      <UndoBar show={dismissed} width="with-margin" onUndo={() => setDismissed(false)}>
        {dismissed ? dismissedSentence(riff) : null}
      </UndoBar>
    </>
  )
}

/** Working and failed: words in the object where the angles will land. */
export function RiffStatesDemo() {
  const working: Riff = {
    ...RIFF,
    id: "rif-new",
    scrap: "",
    state: "working",
    angles: [],
    capturedAt: "Today",
  }
  const failed: Riff = {
    ...RIFF,
    id: "rif-fail",
    scrap: "…okay, so, nothing really. I'll try that again on the way back.",
    state: "failed",
    failure: "It is mostly a note to yourself. Say what happened, and I'll find the post.",
    angles: [],
    capturedAt: "Yesterday",
  }
  const noop = async (): Promise<DraftAngleResult> => ({ ok: false, reason: "gone", message: "" })
  return (
    <>
      <RiffCard riff={working} meta="0:48" onDraft={noop} onDismiss={() => {}} />
      <RiffCard riff={failed} meta="0:09" onDraft={noop} onDismiss={() => {}} onRetry={() => {}} />
    </>
  )
}

/** The row title rule, applied to three riffs. */
export function RiffTitlesDemo() {
  const rows: Riff[] = [
    RIFF,
    { ...RIFF, id: "t2", angles: [], state: "working", scrap: "…so, the deploy thing. On Tuesday I moved the build cache onto its own disk." },
    { ...RIFF, id: "t3", angles: [], state: "working", scrap: "" },
  ]
  return (
    <List width="with-margin">
      {rows.map((r, i) => (
        <ListRow
          key={r.id}
          titleLines={2}
          selected={i === 0}
          description={r.state === "working" ? "Reading it" : `${r.sourceLabel} · 3 ideas waiting`}
          meta={<Mono>{r.capturedAt}</Mono>}
        >
          {riffTitle(r)}
        </ListRow>
      ))}
    </List>
  )
}

/* ── Conversation ──────────────────────────────────────────────────────── */

const REPLY = `One thing. On **Thursday's call** you said the release notes stopped and nobody noticed.

It beats the other two ideas I found:

- the pricing page nobody reads
- the hire who asked for the worst call

Want it as a draft, in three beats?`

/** A turn, then Quincy's reply as a marked-up page with one Draft it. */
export function ConversationDemo() {
  const [sent, setSent] = React.useState(false)
  return (
    <Window address="hirequincy.com/studio" width="with-margin">
      <div className="flex flex-col gap-kit-group">
        <YourTurn>Anything from this week&apos;s calls worth posting?</YourTurn>
        <QuincyReply>
          <ReplyText part={{ text: "One thing. On Thursday's call you said:" }} />
          <ReplyQuote note="honest, and a bit funny">
            We stopped writing release notes and nobody noticed for a month.
          </ReplyQuote>
          <ReplyText part={{ text: "It beats the other two ideas I found. Want it as a draft, in **three beats**?" }} />
          <ReplyActions>
            <Button variant={sent ? "quiet" : "action"} disabled={sent} onClick={() => setSent(true)}>
              Draft it
            </Button>
            <Button disabled={sent}>Show me the other two</Button>
          </ReplyActions>
        </QuincyReply>
        <Arrive show={sent}>
          <div className="flex flex-col gap-kit-group">
            <YourTurn>Draft it.</YourTurn>
            <QuincyReply>
              <ReplyText part={{ text: "Done. It opens on the thing you did, then the month of silence." }} />
              <Text as="div">
                <Mono>release-notes · Tue 08:10</Mono>
              </Text>
            </QuincyReply>
          </div>
        </Arrive>
      </div>
    </Window>
  )
}

/** Press Stream it: the reply arrives in chunks and nothing above it moves. */
export function StreamingDemo() {
  const [text, setText] = React.useState("")
  const [running, setRunning] = React.useState(false)
  const timer = React.useRef<number | undefined>(undefined)

  React.useEffect(() => () => window.clearInterval(timer.current), [])

  const stream = () => {
    window.clearInterval(timer.current)
    setText("")
    setRunning(true)
    let at = 0
    timer.current = window.setInterval(() => {
      at = Math.min(REPLY.length, at + 6)
      setText(REPLY.slice(0, at))
      if (at >= REPLY.length) {
        window.clearInterval(timer.current)
        setRunning(false)
      }
    }, 40)
  }

  return (
    <Card width="with-margin">
      <div className="flex flex-col gap-kit-group">
        <YourTurn>What should I post this week?</YourTurn>
        {text ? (
          <QuincyReply streaming={running}>
            <ReplyText part={{ text, state: running ? "streaming" : "done" }} />
          </QuincyReply>
        ) : null}
        <div>
          <Button pending={running} pendingLabel="Streaming…" onClick={stream}>
            Stream it
          </Button>
        </div>
      </div>
    </Card>
  )
}

export function ReplyFailedDemo() {
  return (
    <Card>
      <QuincyReply>
        <ReplyFailed rest="Your words are still above. Send them again." onRetry={() => {}}>
          I lost the thread there.
        </ReplyFailed>
      </QuincyReply>
    </Card>
  )
}

/* ── QuincyAsks ────────────────────────────────────────────────────────── */

/** A story gap, answered in a line (StoryGap, lib/story-gaps.ts). */
export function AskLineDemo() {
  return (
    <Card>
      <QuincyAsks
        question="You mention pricing in 4 posts and have no story about it."
        rest="When did a price you set turn out wrong, and what did you do?"
        answer={{
          kind: "line",
          label: "Your answer",
          placeholder: "One line is enough",
          submitLabel: "Send it",
          pendingLabel: "Sending…",
          maxLength: 280,
          onAnswer: async () => {
            await wait(700)
            return { ok: true }
          },
        }}
        onDecline={() => {}}
        answered="Thanks. I'll keep that on your story page."
      />
    </Card>
  )
}

/** A rule offer under an approved version (RuleOffer, lib/edit-classes.ts). */
export function AskYesDemo() {
  return (
    <Card>
      <QuincyAsks
        question="You have taken the emoji out three times."
        rest="Should “No emoji.” be a rule for LinkedIn?"
        answer={{
          kind: "yes",
          label: "Add the rule",
          pendingLabel: "Adding…",
          onAnswer: async () => {
            await wait(700)
            return { ok: true }
          },
        }}
        isAction
        onDecline={() => {}}
        answered="Added. It is on your LinkedIn voice page now."
      />
    </Card>
  )
}

/* ── EmptyState ────────────────────────────────────────────────────────── */

const STARTERS: Starter[] = [
  {
    id: "shipped",
    label: "I shipped something",
    icon: GitMergeIcon,
    ask: "What was it, and who noticed first?",
    then: "Paste the PR if you have it. I read the diff so you don't have to explain it.",
  },
  {
    id: "call",
    label: "I had a call worth keeping",
    icon: Call02Icon,
    ask: "Drop the recording in.",
    then: "I'll read it before you do and mark the one thing worth a post.",
  },
  {
    id: "number",
    label: "A number moved",
    icon: ChartLineData01Icon,
    ask: "Which one, and from what?",
    then: "Give me the before and the after. The number gets its own line.",
  },
]

export function EmptyStartersDemo() {
  return (
    <EmptyState
      bold="Nothing to send today."
      rest="Tell me about your week. I'll find the post in it."
      baseline="Your last post went out Thursday, at 1.8× your median."
    >
      <EmptyStarters starters={STARTERS} note="pick one. you don't have to write it up" />
    </EmptyState>
  )
}

export function EmptyLinkDemo() {
  return (
    <EmptyState bold="Nothing is waiting on you." rest="Say a half-thought on the walk and I'll find the ideas in it.">
      <ButtonLink href="/ideas">Record a thought</ButtonLink>
    </EmptyState>
  )
}

/* ── Provenance ────────────────────────────────────────────────────────── */

export function SourceMarksDemo() {
  return (
    <Card>
      <div className="flex flex-col gap-kit-related">
        <SourceMark id="voice" label="Voice note" when="Today" meta="4:12" />
        <SourceMark id="github" label="Pull request" when="Wed" meta="PR #418" />
        <SourceMark id="x" label="X" when="Thu 07:45" />
        <SourceMark id="" label="" when="Yesterday" />
        <ProvenanceMark
          riff={{
            sourceId: "",
            sourceLabel: "Pasted",
            capturedAt: "Yesterday",
            adaptedFrom: { url: "https://x.com/maren_builds/status/1", handle: "maren_builds" },
          }}
        />
      </div>
    </Card>
  )
}
