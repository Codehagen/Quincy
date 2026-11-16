"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { PlayIcon } from "@hugeicons/core-free-icons"

import { runRhythmNow, setRhythmTime } from "@/app/(app)/rhythm/actions"
import { Button, Field, Select, Text, TimeInput, Well } from "@/components/kit"
import { WEEKDAYS } from "@/lib/slots"

/** "any" is Every day; a weekday is its number as a string. */
const DAY_OPTIONS = [
  { value: "any", label: "Every day" },
  ...WEEKDAYS.map((d) => ({ value: String(d.value), label: d.label })),
]

/**
 * When this rhythm fires, and a way to fire it now.
 *
 * The control is `components/lineup/slot-composer.tsx`'s, deliberately: a
 * weekday `Select` beside an `<Input type="time">`, with an `aria-live` block
 * underneath answering the question the two fields ask. A slot and a rhythm are
 * the same shape of decision — "this weekday, this time, every week" — and
 * inventing a second control for it would mean two answers to one question and
 * two places to get the timezone wrong.
 *
 * The one addition is **Every day**, which a slot has no use for. It is modelled
 * as `weekday: null` all the way down to the column, rather than as seven rows.
 *
 * `nextRun` is the **stored cursor** — `rhythm_subscription.next_run_at`,
 * formatted on the server — not a recomputation. It is the exact instant the
 * dispatcher will fire on, so the panel cannot promise Monday and run Tuesday.
 * An unsaved edit deliberately shows "not saved yet" rather than a predicted
 * time: a preview of a time that is not yet stored is the one number here that
 * could be confidently wrong.
 *
 * On the kit since 2026-11-16: a kit Select and TimeInput in kit Fields, Save
 * as the ink action while there is something to save (docs/design/actions.md,
 * "a form with changes not saved"), Run now quiet, and the answer in a Well.
 */
export function RhythmSettings({
  rhythmId,
  enabled,
  hour,
  minute,
  weekday,
  nextRun,
  canRun,
}: {
  rhythmId: string
  enabled: boolean
  hour: number
  minute: number
  weekday: number | null
  /** Pre-rendered on the server, in the reader's zone. Null when it is off. */
  nextRun: string | null
  /** False when there is no subscription row yet — nothing to run. */
  canRun: boolean
}) {
  const router = useRouter()

  const [time, setTime] = React.useState(
    `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
  )
  // "any" rather than "" for the daily case: an empty string is what a Select
  // reports when nothing is chosen, and the two would be indistinguishable.
  const [day, setDay] = React.useState(
    weekday === null ? "any" : String(weekday)
  )
  const [saving, setSaving] = React.useState(false)
  const [running, setRunning] = React.useState(false)
  const [message, setMessage] = React.useState<{
    text: string
    ok: boolean
  } | null>(null)

  const dirty =
    time !==
      `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` ||
    day !== (weekday === null ? "any" : String(weekday))

  async function save() {
    const [h, m] = time.split(":").map(Number)
    if (!Number.isInteger(h) || !Number.isInteger(m)) {
      setMessage({ text: "That is not a time.", ok: false })
      return
    }

    setSaving(true)
    setMessage(null)

    try {
      const result = await setRhythmTime({
        rhythmId,
        hour: h,
        minute: m,
        weekday: day === "any" ? null : Number(day),
      })

      if (!result.ok) {
        setMessage({ text: result.message, ok: false })
        return
      }
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function runNow() {
    setRunning(true)
    setMessage(null)
    try {
      const result = await runRhythmNow(rhythmId)
      setMessage({
        text: result.message ?? "Done.",
        ok: result.ok,
      })
      router.refresh()
    } catch {
      setMessage({ text: "Something went wrong.", ok: false })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex flex-col gap-kit-related">
      <form
        className="flex flex-wrap items-end gap-kit-related"
        onSubmit={(event) => {
          event.preventDefault()
          if (dirty && enabled && !saving) void save()
        }}
      >
        <div className="w-44">
          <Field label="Day" disabled={!enabled}>
            <Select
              options={DAY_OPTIONS}
              value={day}
              onValueChange={(value) => {
                setDay(value ?? day)
                // The last answer was about the old values; "Not saved yet"
                // is the true sentence now.
                setMessage(null)
              }}
              disabled={!enabled}
            />
          </Field>
        </div>

        <div className="w-32">
          <Field label="Time" disabled={!enabled}>
            <TimeInput
              required
              value={time}
              disabled={!enabled}
              onValueChange={(value) => {
                setTime(value)
                setMessage(null)
              }}
            />
          </Field>
        </div>

        {/* Only when there is something to save. A permanently visible Save
            beside two controls that already look editable invites a press that
            does nothing. */}
        {dirty && enabled ? (
          <Button
            type="submit"
            variant="action"
            pending={saving}
            pendingLabel="Saving…"
          >
            Save
          </Button>
        ) : null}

        <div className="ml-auto">
          <Button
            icon={PlayIcon}
            disabled={!canRun}
            pending={running}
            pendingLabel="Running…"
            onClick={() => void runNow()}
          >
            Run now
          </Button>
        </div>
      </form>

      {/* The answer to the question the two fields ask. `aria-live` because it
          changes without the focus moving — a screen-reader user editing the
          time would otherwise never learn the next run moved a week. A
          refusal is in ink, not red (docs/design/states.md). */}
      <div aria-live="polite">
        <Well>
          {message ? (
            <Text>{message.text}</Text>
          ) : !enabled ? (
            <Text tone="muted">
              Switched off. Turn it on to choose when it runs.
            </Text>
          ) : dirty ? (
            <Text tone="muted">
              Not saved yet. It still runs at the old time.
            </Text>
          ) : (
            <Text>
              {nextRun ? `Next run ${nextRun}.` : "No next run scheduled."}
            </Text>
          )}
        </Well>
      </div>
    </div>
  )
}
