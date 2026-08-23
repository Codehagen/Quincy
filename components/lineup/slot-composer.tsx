"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Delete02Icon, PlusSignIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { createSlot, deleteSlot } from "@/app/(app)/lineup/actions"
import { CONNECTABLE_CHANNELS } from "@/lib/schema-app"
import {
  formatSlotTime,
  nextOccurrenceAfter,
  WEEKDAYS,
  weekdayLabel,
} from "@/lib/slots"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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
 * **The preview is the feature.** The first version of this asked for three
 * values and said nothing about what they produced, so you pressed Add and
 * found out later, on another page. Three abstract inputs are not a decision
 * anyone can make confidently. The sentence under the fields answers the only
 * question the form actually raises — when is this, and when does it first
 * happen — and it is computed with `nextOccurrenceAfter`, the same function
 * lib/scheduling.ts uses to place an approval. A preview that reasoned
 * separately would drift, and the symptom would be a dialog promising Monday
 * and a post going out Tuesday.
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

export function SlotComposer({
  existing = [],
  connected = [],
  timezone,
  variant = "quiet",
}: {
  existing?: ExistingSlot[]
  /**
   * Channels with a live connection, from `listConnections`.
   *
   * The dialog used to default to `CONNECTABLE_CHANNELS[0]`, which is X — so an
   * account whose only connection was LinkedIn opened this form pointed at a
   * channel it could not publish to, made a slot there, approved a LinkedIn
   * draft, and got nothing. That happened on a real account. A form that knows
   * which channels can receive a post has no business defaulting to one that
   * cannot.
   */
  connected?: string[]
  /** The account's zone. Named out loud rather than called "local". */
  timezone: string
  /** `primary` is the first-run screen, where this is the only thing to do. */
  variant?: "quiet" | "primary"
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
  const [time, setTime] = React.useState("08:00")

  /**
   * Recomputed on every render rather than memoised against a clock.
   *
   * The preview says "next one is Monday 10 August", which is only true
   * relative to now — and a dialog can sit open across midnight. `new Date()`
   * here costs nothing and cannot go stale between renders.
   */
  const nextAt = nextOccurrenceAfter(
    Number(weekday),
    time,
    timezone,
    new Date()
  )

  const forThisChannel = existing
    .filter((s) => s.channel === channel)
    .sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time))

  /**
   * Caught here rather than at the server, because the server cannot say no.
   *
   * `createSlot` ends in `onConflictDoNothing` — pressing Add twice on the same
   * slot means you want that slot and it exists, so erroring would be the
   * product arguing with someone who got what they asked for. The cost is that
   * a genuine duplicate closes the dialog with nothing new on screen and no
   * explanation. Saying so before the press is the half that was missing.
   */
  const duplicate = forThisChannel.some(
    (s) => s.weekday === Number(weekday) && s.time === time
  )

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (duplicate) return

    setSaving(true)
    setError(null)

    try {
      await createSlot({ channel, weekday: Number(weekday), time })
      setOpen(false)
      // Not optimistic, unlike moving a post in components/lineup/lineup-list.tsx.
      // A new slot changes which days have rows at all, and a slot that appears
      // and then vanishes on a failed write is a worse first impression than
      // one that takes a moment to arrive.
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add it")
    } finally {
      setSaving(false)
    }
  }

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
      {/* `render` rather than a nested button, matching the AlertDialog on
          Drafts: Base UI merges its trigger props into the element instead of
          wrapping it, which is what keeps this the same 32px control as every
          other action in a page header. */}
      <DialogTrigger
        render={
          <Button
            type="button"
            variant={variant === "primary" ? "default" : "ghost"}
            size="sm"
            className={
              variant === "primary" ? undefined : "text-muted-foreground"
            }
          />
        }
      >
        <HugeiconsIcon aria-hidden="true" icon={PlusSignIcon} />
        {variant === "primary" ? "Add your first slot" : "Slots"}
      </DialogTrigger>

      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Publishing slots</DialogTitle>
            {/* Says what a slot does, in the order it happens. The previous
                version opened by defining what a slot is *not* ("a standing
                commitment, not a date"), which is the internal distinction and
                answers a question nobody asked yet. */}
            <DialogDescription>
              A slot is a time you publish every week. Approve a draft and it
              takes the next free slot for its channel, then goes out on its
              own.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <Field>
              <FieldLabel htmlFor="slot-channel">Channel</FieldLabel>
              {/* Base UI hands back `string | null` because a Select can be
                  cleared. None of these can — every one has a value on first
                  render and no clear control — so a null would mean the
                  component changed underneath us, and keeping the last choice
                  is better than putting the form in a state the submit path
                  does not handle. */}
              <Select
                value={channel}
                onValueChange={(value) => setChannel(value ?? channel)}
              >
                <SelectTrigger id="slot-channel">
                  {/* Base UI's Value renders the raw stored value unless it is
                      given a function, so this showed "x" rather than "X" and
                      the Day field showed "1" rather than "Monday". Read on the
                      page it was a form asking you to pick between "x" and "1",
                      which is the opposite of self-explanatory. */}
                  <SelectValue>
                    {(value: string) => CHANNEL_LABELS[value] ?? value}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CONNECTABLE_CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CHANNEL_LABELS[c] ?? c}
                      {connected.includes(c) ? "" : " · not connected"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* The list is short because it is the list of channels Quincy
                  can publish to at all. Whether *your* account has connected
                  one is a different question, and the answer belongs next to
                  the choice rather than two pages away on /channels. */}
              <FieldDescription>
                {connected.includes(channel)
                  ? `Connected. Posts will go out on ${CHANNEL_LABELS[channel] ?? channel}.`
                  : `Not connected yet. You can make the slot, but nothing will publish until you connect ${CHANNEL_LABELS[channel] ?? channel} on Channels.`}
              </FieldDescription>
            </Field>

            <div className="flex gap-3">
              <Field className="flex-1">
                <FieldLabel htmlFor="slot-weekday">Day</FieldLabel>
                <Select
                  value={weekday}
                  onValueChange={(value) => setWeekday(value ?? weekday)}
                >
                  <SelectTrigger id="slot-weekday">
                    <SelectValue>
                      {(value: string) => weekdayLabel(Number(value))}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((d) => (
                      <SelectItem key={d.value} value={String(d.value)}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field className="w-32">
                <FieldLabel htmlFor="slot-time">Time</FieldLabel>
                <Input
                  id="slot-time"
                  type="time"
                  required
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </Field>
            </div>

            {/* The answer to the question the three fields above ask.
                `aria-live` because it changes without the focus moving — a
                screen reader user editing the time would otherwise never learn
                that the first occurrence moved a week. */}
            <div
              aria-live="polite"
              className="rounded-lg bg-muted/50 px-3 py-2.5"
            >
              {duplicate ? (
                <p className="text-caption text-pretty">
                  You already publish to {CHANNEL_LABELS[channel] ?? channel} on{" "}
                  {weekdayLabel(Number(weekday))} at {time}. Pick another day or
                  time.
                </p>
              ) : nextAt ? (
                <p className="text-caption text-pretty">
                  <span className="font-medium text-foreground">
                    Every {weekdayLabel(Number(weekday))} at {time}
                  </span>
                  <span className="text-muted-foreground">
                    {" · "}first one {formatSlotTime(nextAt, timezone, new Date())}
                  </span>
                </p>
              ) : (
                <p className="text-caption text-muted-foreground">
                  Pick a time to see when this first happens.
                </p>
              )}
              {/* Named, not "your local time". This is the one product where
                  which clock is meant decides whether a post goes out at the
                  right hour, and the zone is on the account — so say it. */}
              <p className="text-caption text-muted-foreground">
                Times are {timezone.replace(/_/g, " ")}. Change it in Settings.
              </p>
            </div>

            {forThisChannel.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-caption text-muted-foreground">
                  Your {CHANNEL_LABELS[channel] ?? channel} rhythm
                </p>
                <ul className="flex flex-col gap-1">
                  {forThisChannel.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center gap-2 rounded-lg bg-muted/40 py-1 pr-1 pl-3"
                    >
                      <span className="text-caption">
                        {weekdayLabel(s.weekday)}
                      </span>
                      <span className="font-mono text-caption tabular-nums text-muted-foreground">
                        {s.time}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ml-auto text-muted-foreground"
                        disabled={removing === s.id}
                        // Sized for "Removing…" so the row does not reflow the
                        // moment you press it. ui-polish: no layout shift from
                        // dynamic content.
                        style={{ minWidth: "6.5rem" }}
                        // Names what it removes. A column of these would
                        // otherwise announce "Remove, button" four times over.
                        aria-label={`Remove the ${weekdayLabel(s.weekday)} ${s.time} ${
                          CHANNEL_LABELS[s.channel] ?? s.channel
                        } slot`}
                        onClick={() => remove(s.id)}
                      >
                        <HugeiconsIcon aria-hidden="true" icon={Delete02Icon} />
                        {removing === s.id ? "Removing…" : "Remove"}
                      </Button>
                    </li>
                  ))}
                </ul>
                {/* Said here because it is the thing people assume happens and
                    it does not. `slot_id` is ON DELETE SET NULL — the post
                    keeps its time and becomes a one-off. */}
                <FieldDescription>
                  Removing a slot keeps anything already scheduled in it.
                </FieldDescription>
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="text-caption text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={saving || duplicate}>
              {saving ? "Adding…" : "Add slot"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
