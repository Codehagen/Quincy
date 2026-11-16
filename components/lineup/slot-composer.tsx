"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { PlusSignIcon } from "@hugeicons/core-free-icons"

import { createSlot, deleteSlot } from "@/app/(app)/lineup/actions"
import { CONNECTABLE_CHANNELS } from "@/lib/schema-app"
import {
  formatSlotTime,
  nextOccurrenceAfter,
  WEEKDAYS,
  weekdayLabel,
} from "@/lib/slots"
import {
  Button,
  Dialog,
  DialogFooter,
  DialogPanel,
  DialogTrigger,
  Field,
  Mono,
  Select,
  Text,
  TimeInput,
  Well,
} from "@/components/kit"

/**
 * Where a standing rhythm comes from.
 *
 * Until this existed, `insert(slot)` appeared once in the codebase, in
 * scripts/seed-drafts.ts — so the Lineup had content in development and was
 * permanently empty on a real account, and approving a draft had nowhere to put
 * it. See plans/010.
 *
 * **A slot, not a date.** The dialog asks for a weekday and a time and never
 * for a calendar day, which is the distinction the whole surface rests on: a
 * commitment that recurs is the only thing that lets an empty Wednesday read as
 * a slot going to waste rather than as a blank square.
 *
 * **The preview is the feature.** The sentence under the fields answers the
 * only question the form raises — when is this, and when does it first
 * happen — and it is computed with `nextOccurrenceAfter`, the same function
 * lib/scheduling.ts uses to place an approval. A preview that reasoned
 * separately would drift, and the symptom would be a dialog promising Monday
 * and a post going out Tuesday.
 *
 * **On the kit since 2026-11-16** (plans/029). The time is the browser's own
 * time control (`TimeInput`, Input's `time` type): the native picker on a
 * phone, typed digits on a desktop, and always "HH:MM" or empty. The field
 * still validates through `normaliseTime`, so an empty or half-typed time
 * says "Pick a time." on blur, and the server parses it again either way.
 */

/**
 * Exported so `NoLineup` names the same channels the same way. One map rather
 * than two: a first-run panel offering a rhythm for "Linkedin" and a dialog
 * listing it under "LinkedIn" is the same product disagreeing with itself.
 */
export const CHANNEL_LABELS: Record<string, string> = {
  x: "X",
  linkedin: "LinkedIn",
}

/** What the parent already has, so the dialog can show it and refuse a repeat. */
export type ExistingSlot = {
  id: string
  channel: string
  weekday: number
  time: string
}

/** "8:00", "0800", "08:00" → "08:00". Null when it is not a time of day. */
export function normaliseTime(raw: string): string | null {
  const match = /^\s*(\d{1,2})[:.]?(\d{2})\s*$/.exec(raw)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

const WEEKDAY_OPTIONS = WEEKDAYS.map((d) => ({
  value: String(d.value),
  label: d.label,
}))

export function SlotComposer({
  existing = [],
  connected = [],
  timezone,
  label = "Slots",
  primary = false,
}: {
  existing?: ExistingSlot[]
  /**
   * Channels with a live connection, from `listConnections`.
   *
   * The dialog used to default to `CONNECTABLE_CHANNELS[0]`, which is X — so an
   * account whose only connection was LinkedIn opened this form pointed at a
   * channel it could not publish to. A form that knows which channels can
   * receive a post has no business defaulting to one that cannot.
   */
  connected?: string[]
  /** The account's zone. Named out loud rather than called "local". */
  timezone: string
  /** The trigger's words. */
  label?: string
  /**
   * The ink trigger, for the first-run screen with nothing connected, where
   * making a slot is the only thing to do. Quiet everywhere else: in the page
   * header the action belongs to the object it acts on (actions.md).
   */
  primary?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [removing, setRemoving] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  // First connected channel, falling back to the first connectable one so the
  // form still opens on an account with nothing connected yet.
  const [channel, setChannel] = React.useState<string>(
    CONNECTABLE_CHANNELS.find((c) => connected.includes(c)) ??
      CONNECTABLE_CHANNELS[0]
  )
  const [weekday, setWeekday] = React.useState("1")
  const [timeText, setTimeText] = React.useState("08:00")
  const time = normaliseTime(timeText)

  const channelOptions = CONNECTABLE_CHANNELS.map((c) => ({
    value: c as string,
    label: `${CHANNEL_LABELS[c] ?? c}${connected.includes(c) ? "" : " · not connected"}`,
  }))
  const channelName = CHANNEL_LABELS[channel] ?? channel

  /**
   * Recomputed on every render rather than memoised against a clock: the
   * preview is only true relative to now, and a dialog can sit open across
   * midnight.
   */
  const nextAt = time
    ? nextOccurrenceAfter(Number(weekday), time, timezone, new Date())
    : null

  const forThisChannel = existing
    .filter((s) => s.channel === channel)
    .sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time))

  /**
   * Caught here rather than at the server, because the server cannot say no:
   * `createSlot` ends in `onConflictDoNothing`, so a genuine duplicate would
   * close the dialog with nothing new on screen and no explanation.
   */
  const duplicate =
    time != null &&
    forThisChannel.some((s) => s.weekday === Number(weekday) && s.time === time)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (duplicate || !time) return

    setSaving(true)
    setError(null)

    try {
      await createSlot({ channel, weekday: Number(weekday), time })
      setOpen(false)
      // Not optimistic: a new slot changes which days have rows at all, and a
      // slot that appears and then vanishes on a failed write is a worse first
      // impression than one that takes a moment to arrive.
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add it")
    } finally {
      setSaving(false)
    }
  }

  /**
   * A plain control, not a hold. Removing a slot loses nothing of yours —
   * anything scheduled in it keeps its time (`slot_id` is ON DELETE SET NULL)
   * and the slot is one press to make again — so docs/design/removing.md
   * gives it the plain control.
   */
  async function remove(id: string) {
    setRemoving(id)
    setError(null)

    try {
      await deleteSlot(id)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove it")
    } finally {
      setRemoving(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button icon={PlusSignIcon} variant={primary ? "action" : "quiet"}>
            {label}
          </Button>
        }
      />

      <DialogPanel
        title="Publishing slots"
        description="A slot is a time you publish every week. Approve a draft and it takes the next free slot for its channel, then goes out on its own."
        footer={
          <DialogFooter>
            {/* Outside the form so it stays put while the body scrolls;
                `form` ties it back, so Enter in a field still submits. */}
            <Button
              type="submit"
              form="slot-composer"
              variant="action"
              disabled={duplicate || !time}
              pending={saving}
              pendingLabel="Adding…"
            >
              Add slot
            </Button>
          </DialogFooter>
        }
      >
        <form
          id="slot-composer"
          onSubmit={submit}
          className="flex flex-col gap-kit-group"
        >
          <Field
            label="Channel"
            description={
              connected.includes(channel)
                ? `Connected. Posts go out on ${channelName}.`
                : `Not connected yet. You can make the slot, but nothing goes out until you connect ${channelName} on Channels.`
            }
          >
            <Select
              options={channelOptions}
              value={channel}
              // Every option has a value and there is no clear control, so a
              // null would mean the component changed underneath us; keep the
              // last choice.
              onValueChange={(value) => setChannel(value ?? channel)}
            />
          </Field>

          <div className="flex gap-kit-related">
            <div className="min-w-0 flex-1">
              <Field label="Day">
                <Select
                  options={WEEKDAY_OPTIONS}
                  value={weekday}
                  onValueChange={(value) => setWeekday(value ?? weekday)}
                />
              </Field>
            </div>
            <div className="w-32 shrink-0">
              <Field
                label="Time"
                validate={(value) =>
                  normaliseTime(String(value ?? "")) ? null : "Pick a time."
                }
              >
                <TimeInput
                  required
                  value={timeText}
                  onValueChange={(value: string) => setTimeText(value)}
                />
              </Field>
            </div>
          </div>

          {/* The answer to the question the three fields ask. `aria-live`
              because it changes without the focus moving. */}
          <Well>
            <div aria-live="polite" className="flex flex-col gap-kit-tight">
              {duplicate ? (
                <Text variant="small">
                  You already publish to {channelName} on{" "}
                  {weekdayLabel(Number(weekday))} at {time}. Pick another day or
                  time.
                </Text>
              ) : nextAt && time ? (
                <Text variant="small">
                  <span className="font-kit-strong">
                    Every {weekdayLabel(Number(weekday))} at {time}
                  </span>
                  <span className="text-kit-ink-muted">
                    {" · "}first one{" "}
                    {formatSlotTime(nextAt, timezone, new Date())}
                  </span>
                </Text>
              ) : (
                <Text variant="small" tone="muted">
                  Pick a time to see when this first happens.
                </Text>
              )}
              {/* Named, not "your local time": the zone is on the account. */}
              <Text variant="small" tone="muted">
                Times are {timezone.replace(/_/g, " ")}. Change it in Settings.
              </Text>
            </div>
          </Well>

          {forThisChannel.length > 0 ? (
            <div className="flex flex-col gap-kit-tight">
              <Text variant="small" tone="muted">
                Your {channelName} rhythm. Removing a slot keeps anything already
                scheduled in it.
              </Text>
              <ul className="flex flex-col">
                {forThisChannel.map((s) => (
                  <li
                    key={s.id}
                    className="flex min-h-11 items-center gap-kit-related"
                  >
                    <Text as="span">{weekdayLabel(s.weekday)}</Text>
                    <Mono>{s.time}</Mono>
                    <span className="ml-auto">
                      <Button
                        pending={removing === s.id}
                        pendingLabel="Removing…"
                        aria-label={`Remove the ${weekdayLabel(s.weekday)} ${s.time} ${
                          CHANNEL_LABELS[s.channel] ?? s.channel
                        } slot`}
                        onClick={() => remove(s.id)}
                      >
                        Remove
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {error ? (
            <Text variant="small" role="alert">
              {error}
            </Text>
          ) : null}

        </form>
      </DialogPanel>
    </Dialog>
  )
}
