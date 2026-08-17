"use client"

import * as React from "react"

import type { Riff } from "@/lib/riffs"
import { microphoneFailureMessage } from "@/components/riffs/record-box"
import { Button } from "@/components/ui/button"

import { DeskFrame, Queue } from "../frame"
import { useRiffBoard } from "../state"

/**
 * Faults — every way this page can fail, on one screen, without having to
 * provoke each one.
 *
 * Not a design direction. This is a test surface: the states below are
 * reachable in production only by revoking a microphone permission, running out
 * of entitlement, killing a workflow mid-run, or waiting out a timeout, which
 * is why nobody has looked at most of them since they were written.
 *
 * **Three of them had no design at all, and that was the finding.** Two now do,
 * and the sentences below are the ones that shipped — this file is where they
 * were written, so it is where they stay reviewable.
 *
 * `draftAngle` in app/(app)/riffs/actions.ts returns a receipt, and
 * `AngleActions` used **none of it**:
 *
 * ```tsx
 * await draftAngle({ angleId: angle.id })
 * router.refresh()
 * ```
 *
 * - **`ok: false` was silent** — press "Draft this" with a lapsed subscription
 *   or a spent free day and the button said "Drafting…", came back, and nothing
 *   moved. The action had already written the sentence and the UI threw it
 *   away. *Fixed:* `AngleActions` holds the refusal in state and renders it
 *   under the angle, with the one link that fixes that particular cause. The
 *   action gained a `reason` so the link is chosen by cause rather than by
 *   sniffing the copy.
 * - **`written: false` was silent** — the model failed, each body fell back to
 *   the hook, and the angle showed a tick and "In Drafts" over a draft that was
 *   its own hook repeated. *Fixed, but not from the receipt:* a successful
 *   draft unmounts this component, so a client-held message would flash for one
 *   frame. `Angle.fellBack` derives it from the bodies on read instead, which
 *   is why the line is still there tomorrow.
 * - **`overLimit` is still silent.** A generated body is over the platform
 *   ceiling and you find out at the moment you try to publish. Drawn below,
 *   undesigned, because the honest home for it is /drafts — where the post is
 *   edited and sent — rather than a triage surface you have already left.
 *
 * The proposals are one sentence each and nothing more. A failed write on a
 * triage surface does not want a dialog — it wants the row to say what happened
 * and stay where it is.
 *
 * The microphone messages are the real `microphoneFailureMessage`, imported and
 * called, not copied. It is a pure exported function with five branches and
 * unit tests, and rendering it here means the copy on screen cannot drift from
 * the copy under test.
 */

/** The broken queue. Local, so a healthy variant never has to carry them. */
const BROKEN: Riff[] = [
  {
    id: "working",
    scrap:
      "Call with Advanti — 41 min. They said the hard part is not writing the post, it is remembering what happened during the week that was worth writing about.",
    sourceId: "granola",
    sourceLabel: "Granola",
    capturedAt: "Today",
    state: "working",
    failure: "",
    stuck: false,
    adaptedFrom: null,
    angles: [],
  },
  {
    /** `working` past `RIFF_STUCK_AFTER_MS`, and with no transcript — the
     *  pocket recording. The skeleton goes entirely; nothing is coming. */
    id: "stuck",
    scrap: "",
    sourceId: "voice",
    sourceLabel: "Voice notes",
    capturedAt: "Today",
    state: "working",
    failure: "",
    stuck: true,
    adaptedFrom: null,
    angles: [],
  },
  {
    /** Angles failed, transcript survived — the common voice failure.
     *  `completeSpokenRiff` stores the scrap before it asks for angles, which is
     *  why there is no "your words are gone" apology on this card. */
    id: "failed-with-scrap",
    scrap:
      "Standup, mandag. Vi diskuterte om rhythms skulle kunne skrus av per kanal eller bare globalt, og landet på per kanal fordi",
    sourceId: "granola",
    sourceLabel: "Granola",
    capturedAt: "Yesterday",
    state: "failed",
    failure:
      "Quincy could not find anything worth writing in this one. The recording cuts off mid-sentence.",
    stuck: false,
    adaptedFrom: null,
    angles: [],
  },
  {
    /** Transcription itself failed, so there is nothing above the message. The
     *  card is the message and nothing else. */
    id: "failed-empty",
    scrap: "",
    sourceId: "voice",
    sourceLabel: "Voice notes",
    capturedAt: "Yesterday",
    state: "failed",
    failure: "Quincy could not make out any speech in that recording.",
    stuck: false,
    adaptedFrom: null,
    angles: [],
  },
  {
    /** Healthy, so the failed write can be exercised against a real angle. */
    id: "healthy",
    scrap:
      "Per-seat pricing is wrong for us. The value does not scale with headcount, it scales with how much gets published.",
    sourceId: "voice",
    sourceLabel: "Voice notes",
    capturedAt: "Yesterday",
    state: "ready",
    failure: "",
    stuck: false,
    adaptedFrom: null,
    angles: [
      {
        id: "healthy-1",
        hook: "Vi droppet per-seat prising. Her er regnestykket som avgjorde det.",
        shape: "Thread",
        kind: "Behind the scenes",
        why: "You have the actual numbers, and pricing threads from founders who show the maths get saved rather than liked.",
      },
    ],
  },
]

/** The `ok: false` messages `draftAngle` can actually return, with the `reason`
 *  each one carries — that field is what decides the link, so a variant that
 *  dropped it would be showing a different component than production. */
const DRAFT_FAILURES = [
  {
    id: "lapsed",
    reason: "entitlement",
    cause: "Subscription lapsed",
    message: "Your subscription is no longer active.",
  },
  {
    id: "trial",
    reason: "entitlement",
    cause: "Free day spent",
    message: "Your free day is over.",
  },
  {
    id: "gone",
    reason: "gone",
    cause: "Angle deleted in another tab",
    message: "No such angle.",
  },
  {
    /** The one that wrote a Substack draft for an X-and-LinkedIn account until
     *  2026-08-08. `targetsFor` returns nothing now, and nothing is an answer. */
    id: "no-channel",
    reason: "no-channel",
    cause: "Essay, no long-form channel",
    message:
      "Nothing you have connected takes an essay. Connect Substack to draft this one.",
  },
]

export function Faults() {
  const board = useRiffBoard()
  const loaded = React.useRef(false)

  // The board starts on the healthy fixtures; swap them once. An effect rather
  // than initial state because `useRiffBoard` owns its own `useState`, and the
  // alternative is a second hook that exists only for this variant.
  React.useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    board.load(BROKEN)
  }, [board])

  return (
    <DeskFrame board={board}>
      <div className="flex flex-col gap-8">
        <Queue
          board={board}
          renderExtra={(riff) =>
            riff.id === "healthy" ? <FailedWrite /> : null
          }
        />
        <Undesigned />
        <MicrophoneCopy />
      </div>
    </DeskFrame>
  )
}

/**
 * The proposal for `ok: false`.
 *
 * In the card, under the angle, holding its place. Not a toast: a toast is a
 * deadline on reading, and this one is about money — somebody whose trial just
 * ended needs to still be able to see why nothing happened after they have
 * looked away and back. `role="status"` because it appears without focus
 * moving, matching what `AdaptBox` and `RecordBox` already do for their waits.
 */
function FailedWrite() {
  const [shown, setShown] = React.useState<string | null>(null)
  const failure = DRAFT_FAILURES.find((f) => f.id === shown)

  return (
    <div className="flex flex-col gap-2">
      <div aria-live="polite">
        {failure ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2">
            {/* The action's own sentence, unedited. It already names the cause
                and it is the only thing that knows which one happened. */}
            <p className="max-w-[60ch] text-caption text-pretty text-destructive">
              {failure.message}
            </p>
            {/* One link, chosen by cause — the same branch that shipped in
                `AngleActions`. "No such angle" gets none, because there is
                nothing to buy and nowhere to go. */}
            {failure.reason === "entitlement" ? (
              <Button variant="ghost" size="xs" className="text-destructive">
                See plans
              </Button>
            ) : failure.reason === "no-channel" ? (
              <Button variant="ghost" size="xs" className="text-destructive">
                Connect a channel
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-caption text-muted-foreground">Force a failure:</p>
        {DRAFT_FAILURES.map((f) => (
          <Button
            key={f.id}
            variant="outline"
            size="xs"
            onClick={() => setShown(shown === f.id ? null : f.id)}
          >
            {f.cause}
          </Button>
        ))}
      </div>
    </div>
  )
}

/** The one receipt field still rendered nowhere, drawn as it would look. */
function Undesigned() {
  return (
    <section aria-labelledby="undesigned" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 px-3">
        <h2 id="undesigned" className="text-card-title">
          Returned by the action, rendered nowhere
        </h2>
        <p className="max-w-[60ch] text-caption text-pretty text-muted-foreground">
          It comes back from <code>draftAngle</code> on an <code>ok: true</code>{" "}
          path, so the angle correctly shows “In Drafts” and the problem is only
          visible later, at publish time.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-xs">
        <Receipt
          field="overLimit: ['x']"
          when="A generated body is over the platform ceiling."
        >
          <p className="text-caption text-muted-foreground">
            In Drafts · the X version runs long and needs a trim.
          </p>
        </Receipt>
      </div>
    </section>
  )
}

function Receipt({
  field,
  when,
  children,
}: {
  field: string
  when: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-caption text-muted-foreground">
        <code className="rounded-xs bg-muted px-1 py-0.5 font-mono">
          {field}
        </code>{" "}
        — {when}
      </p>
      <div className="rounded-lg bg-muted/40 p-3">{children}</div>
    </div>
  )
}

/**
 * Every branch of `microphoneFailureMessage`, called rather than copied.
 *
 * These are the first-run failures — the ones a new user hits before they have
 * ever seen the product work — and they are the hardest to provoke deliberately
 * because two of them need a revoked permission and one needs a non-https
 * origin on a phone.
 */
function MicrophoneCopy() {
  const cases: { label: string; message: string }[] = [
    {
      label: "Insecure origin (http://192.168.x.x — the phone case)",
      message: microphoneFailureMessage(null, false),
    },
    {
      label: "No media stack",
      message: microphoneFailureMessage(null, true),
    },
    {
      label: "Permission refused, or remembered as refused",
      message: microphoneFailureMessage({ name: "NotAllowedError" }, true),
    },
    {
      label: "No microphone",
      message: microphoneFailureMessage({ name: "NotFoundError" }, true),
    },
    {
      label: "Browser cannot record",
      message: microphoneFailureMessage({ name: "NotSupportedError" }, true),
    },
    {
      label: "Device busy",
      message: microphoneFailureMessage({ name: "NotReadableError" }, true),
    },
    {
      label: "Anything else",
      message: microphoneFailureMessage({ name: "WeirdError" }, true),
    },
  ]

  return (
    <section aria-labelledby="mic" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 px-3">
        <h2 id="mic" className="text-card-title">
          Recorder failures
        </h2>
        <p className="max-w-[60ch] text-caption text-pretty text-muted-foreground">
          Rendered by calling the real <code>microphoneFailureMessage</code>, so
          this copy cannot drift from the copy under test in{" "}
          <code>record-box.test.ts</code>.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-xs">
        {cases.map((c) => (
          <div key={c.label} className="flex flex-col gap-1">
            <p className="font-mono text-caption text-muted-foreground">
              {c.label}
            </p>
            {/* The real status treatment from the recorder: destructive text,
                centred, two lines reserved. */}
            <div className="rounded-lg bg-muted/40 px-3 py-2">
              <p className="max-w-[60ch] text-caption text-pretty text-destructive">
                {c.message}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
