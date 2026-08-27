"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { PlayIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { runRhythmNow, setRhythmTime } from "@/app/(app)/rhythm/actions"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { WEEKDAYS, weekdayLabel } from "@/lib/slots"
import { cn } from "@/lib/utils"

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field className="w-40">
          <FieldLabel htmlFor="rhythm-day">Day</FieldLabel>
          <Select
            value={day}
            onValueChange={(value) => setDay(value ?? day)}
            disabled={!enabled}
          >
            <SelectTrigger id="rhythm-day">
              <SelectValue>
                {(value: string) =>
                  value === "any" ? "Every day" : weekdayLabel(Number(value))
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Every day</SelectItem>
              {WEEKDAYS.map((d) => (
                <SelectItem key={d.value} value={String(d.value)}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field className="w-32">
          <FieldLabel htmlFor="rhythm-time">Time</FieldLabel>
          <Input
            id="rhythm-time"
            type="time"
            required
            value={time}
            disabled={!enabled}
            onChange={(event) => setTime(event.target.value)}
          />
        </Field>

        {/* Only when there is something to save. A permanently visible Save
            beside two controls that already look editable invites a press that
            does nothing. */}
        {dirty && enabled ? (
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        ) : null}

        <div className="ml-auto">
          <Button
            variant="outline"
            disabled={!canRun || running}
            onClick={async () => {
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
            }}
          >
            <HugeiconsIcon
              aria-hidden="true"
              data-icon="inline-start"
              icon={PlayIcon}
            />
            {running ? "Running…" : "Run now"}
          </Button>
        </div>
      </div>

      {/* The answer to the question the two fields ask. `aria-live` because it
          changes without the focus moving — a screen-reader user editing the
          time would otherwise never learn the next run moved a week. */}
      {/* `rounded-xs`, derived rather than chosen: the panel around this sits
          in a `rounded-2xl` (24px) block with 20px of padding, so a child
          takes 4px. `rounded-lg` was 16px inside 24px and read as a card
          floating in a card. */}
      <div aria-live="polite" className="rounded-xs bg-muted/50 px-3 py-2.5">
        {message ? (
          <p
            className={cn(
              "text-caption text-pretty",
              message.ok ? "text-foreground" : "text-destructive"
            )}
          >
            {message.text}
          </p>
        ) : !enabled ? (
          <p className="text-caption text-pretty text-muted-foreground">
            Switched off. Turn it on to choose when it runs.
          </p>
        ) : dirty ? (
          <p className="text-caption text-pretty text-muted-foreground">
            Not saved yet — it still runs at the old time.
          </p>
        ) : (
          <p className="text-caption text-pretty">
            {nextRun ? `Next run ${nextRun}.` : "No next run scheduled."}
          </p>
        )}
      </div>
    </div>
  )
}
