"use client"

import * as React from "react"
import { ArrowDown01Icon, SentIcon } from "@hugeicons/core-free-icons"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogPanel,
  Button,
  ButtonLink,
  Menu,
  MenuItem,
  MenuPanel,
  MenuSeparator,
  MenuTrigger,
  TextLink,
} from "@/components/kit"

import { CHANNEL_LABEL, DAYS, type LabPost } from "../data"
import { isPast, openingOf, quoted, slotLabel, whenLabel, type Item, type LineupStore } from "../use-lineup"

/**
 * What can be done with the open item, under its picture, in the kit's
 * Buttons: one status line in words, then at most one ink action.
 *
 * - A queued post: "Goes out Tue 08:00, in your X slot." Move… (M), Post
 *   now (P, behind the confirmation), Back to Drafts (B). No ink: nothing
 *   is asked of you.
 * - Sending: the caution, and nothing to press (a retry is the double post
 *   lib/publish-run.ts exists to prevent).
 * - Sent: when, and the receipt.
 * - Didn't go: the platform's words in ink (not red: nothing was
 *   destroyed), Try again now (P) as the ink action, Back to Drafts.
 * - An open slot: who could fill it (a queued post on its channel, an
 *   approved one with no time), and Approve a draft.
 * - Approved, no time: Give it a time (G) as the ink action, Post now.
 */
export function ItemVerbs({ item, store, compact = false }: { item: Item; store: LineupStore; compact?: boolean }) {
  const lineId = React.useId()
  if (item.kind === "post") return <PostVerbs post={item.post} store={store} lineId={lineId} compact={compact} />
  if (item.kind === "stranded") {
    const s = item.s
    const hasSlot = store.slots.some((x) => x.channel === s.channel)
    return (
      <div className="flex flex-col gap-kit-related">
        <p id={lineId} className="text-kit-dense text-pretty text-kit-ink">
          Approved, with no time.{" "}
          <span className="text-kit-ink-muted">
            {s.reason === "slots-full"
              ? `Every ${CHANNEL_LABEL[s.channel]} slot is taken for the next two weeks. Free one, add one, or send it now.`
              : !hasSlot
                ? `No ${CHANNEL_LABEL[s.channel]} slot yet. Add one, or send it now.`
                : s.reason === "sent-back"
                  ? "You sent it back from this week. It takes the next free slot when you give it a time."
                  : "It was approved before the slot existed. It takes the next free one."}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-kit-controls">
          {s.reason !== "slots-full" && hasSlot ? (
            <Button size="sm" variant="action" shortcut="G" aria-describedby={lineId} onClick={() => store.place(s.versionId)}>
              Give it a time
            </Button>
          ) : (
            <Button size="sm" variant="quiet" shortcut="S" onClick={() => store.setRhythmOpen(true)}>
              Add a slot
            </Button>
          )}
          <PostNow item={item} store={store} label={`Post now`} />
        </div>
      </div>
    )
  }
  return <OpenVerbs item={item} store={store} lineId={lineId} />
}

function PostVerbs({ post, store, lineId, compact }: { post: LabPost; store: LineupStore; lineId: string; compact: boolean }) {
  const item: Item = { kind: "post", key: post.id, dayId: post.dayId, time: post.time, channel: post.channel, post }
  const slot = post.slotId ? store.slots.find((s) => s.id === post.slotId) : null
  if (post.state === "sending") {
    return (
      <p role="status" className="text-kit-dense text-pretty text-kit-ink">
        Quincy is sending this one.{" "}
        <span className="text-kit-ink-muted">Nobody can say yet whether it went. Check the account before you try again.</span>
      </p>
    )
  }
  if (post.state === "published") {
    return (
      <p className="text-kit-dense text-pretty text-kit-ink">
        Posted {whenLabel(post.dayId, post.time).toLowerCase().startsWith("today") ? `today at ${post.time}` : whenLabel(post.dayId, post.time)}.{" "}
        {post.url ? <TextLink href={post.url}>View the post</TextLink> : null}
      </p>
    )
  }
  if (post.state === "failed") {
    return (
      <div className="flex flex-col gap-kit-related">
        <p id={lineId} className="text-kit-dense text-pretty text-kit-ink">
          {post.error ?? "It did not go out."}{" "}
          <span className="text-kit-ink-muted">{`${CHANNEL_LABEL[post.channel]}'s words. Nothing went out at ${post.time}. Send it again now, or back to Drafts for a new time.`}</span>
        </p>
        <div className="flex flex-wrap items-center gap-kit-controls">
          <PostNow item={item} store={store} label="Try again now" isAction />
          <Button size="sm" variant="ghost" shortcut="B" aria-describedby={lineId} onClick={() => store.unschedule(post.id)}>
            Back to Drafts
          </Button>
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-kit-related">
      <p id={lineId} className="text-kit-dense text-pretty text-kit-ink">
        Goes out {whenLabel(post.dayId, post.time)}
        {slot ? `, in your ${slotLabel(slot)} ${CHANNEL_LABEL[post.channel]} slot.` : ". A one-off: no slot behind it."}
      </p>
      <div className="flex flex-wrap items-center gap-kit-controls">
        <MoveMenu post={post} store={store} />
        <PostNow item={item} store={store} label="Post now" />
        <span className={compact ? "" : "ms-auto"}>
          <Button size="sm" variant="ghost" shortcut="B" aria-describedby={lineId} onClick={() => store.unschedule(post.id)}>
            Back to Drafts
          </Button>
        </span>
      </div>
    </div>
  )
}

/** Where a queued post can go: the open slots on its channel still ahead, the same time tomorrow, a step either way. */
export function MoveMenu({ post, store }: { post: LabPost; store: LineupStore }) {
  const open = store.openSlots.filter((o) => !o.passed && o.slot.channel === post.channel)
  const i = DAYS.findIndex((d) => d.id === post.dayId)
  const tomorrow = DAYS[i + 1]
  const yesterday = DAYS[i - 1]
  const earlierOk = yesterday && !isPast(yesterday.id, post.time)
  return (
    <Menu open={store.menu === post.id} onOpenChange={(o) => store.setMenu(o ? post.id : null)}>
      <MenuTrigger
        render={
          <Button size="sm" variant="quiet" iconEnd={ArrowDown01Icon} shortcut="M">
            Move
          </Button>
        }
      />
      <MenuPanel>
        {open.map((o) => (
          <MenuItem key={o.slot.id} onClick={() => store.move(post.id, { kind: "slot", slotId: o.slot.id })}>
            {`To the open ${whenLabel(o.day.id, o.slot.time)} slot`}
          </MenuItem>
        ))}
        {open.length > 0 ? <MenuSeparator /> : null}
        {tomorrow ? (
          <MenuItem onClick={() => store.move(post.id, { kind: "day", dayId: tomorrow.id, time: post.time })}>
            {`Same time ${tomorrow.label === "Tomorrow" ? "tomorrow" : tomorrow.short === "Mon" ? "Monday" : `on ${tomorrow.label}`}`}
          </MenuItem>
        ) : null}
        {earlierOk ? (
          <MenuItem onClick={() => store.move(post.id, { kind: "day", dayId: yesterday.id, time: post.time })}>
            {`Same time ${yesterday.label === "Today" ? "today" : `on ${yesterday.label}`}`}
          </MenuItem>
        ) : null}
        <MenuSeparator />
        <MenuItem onClick={() => store.shift(post.id, -1)}>Earlier on its channel (⇧K)</MenuItem>
        <MenuItem onClick={() => store.shift(post.id, 1)}>Later on its channel (⇧J)</MenuItem>
      </MenuPanel>
    </Menu>
  )
}

/** Post now, behind the one confirmation the product keeps: a post cannot be unsent. P opens it. */
export function PostNow({ item, store, label, isAction = false }: { item: Item; store: LineupStore; label: string; isAction?: boolean }) {
  const text = item.kind === "post" ? item.post.body : item.kind === "stranded" ? item.s.body : ""
  const channel = CHANNEL_LABEL[item.channel]
  return (
    <AlertDialog open={store.confirm === item.key} onOpenChange={(o) => store.setConfirm(o ? item.key : null)}>
      {/* The open state is the store's, so P and the press share it. */}
      <Button size="sm" variant={isAction ? "action" : "quiet"} icon={SentIcon} shortcut="P" onClick={() => store.setConfirm(item.key)}>
        {label}
      </Button>
      <AlertDialogPanel
        title={`Post this to ${channel} now?`}
        description={`${quoted(openingOf(text))} goes out at once, in your name. Quincy can't unsend it.`}
      >
        <AlertDialogCancel>Not yet</AlertDialogCancel>
        <AlertDialogAction variant="action" onConfirm={() => store.postNow(item.key)}>
          Post now
        </AlertDialogAction>
      </AlertDialogPanel>
    </AlertDialog>
  )
}

function OpenVerbs({ item, store, lineId }: { item: Extract<Item, { kind: "open" }>; store: LineupStore; lineId: string }) {
  const channel = CHANNEL_LABEL[item.channel]
  if (item.passed) {
    return (
      <div className="flex flex-col gap-kit-related">
        <p id={lineId} className="text-kit-dense text-pretty text-kit-ink">
          {`Your ${slotLabel(item.slot)} ${channel} slot passed with nothing in it.`}{" "}
          <span className="text-kit-ink-muted">Approve a draft and it takes the next open slot.</span>
        </p>
        <div>
          <ButtonLink href="/drafts" size="sm">
            Approve a draft
          </ButtonLink>
        </div>
      </div>
    )
  }
  const later = store.posts.filter((p) => p.state === "queued" && p.channel === item.channel && `${p.dayId} ${p.time}` > `${item.dayId} ${item.time}`).slice(0, 2)
  const waiting = store.stranded.filter((s) => s.channel === item.channel).slice(0, 2)
  return (
    <div className="flex flex-col gap-kit-related">
      <p id={lineId} className="text-kit-dense text-pretty text-kit-ink">
        {`${whenLabel(item.dayId, item.time)} on ${channel} is open.`}{" "}
        <span className="text-kit-ink-muted">
          {waiting.length + later.length > 0 ? "Put something here, or approve a draft and it lands here." : `Approve a ${channel} draft and it takes this slot.`}
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-kit-controls">
        {waiting.map((s, i) => (
          <Button key={s.versionId} size="sm" variant={i === 0 ? "action" : "quiet"} aria-describedby={lineId} onClick={() => store.place(s.versionId, item.slot.id)}>
            {`Put “${clip(openingOf(s.body))}” here`}
          </Button>
        ))}
        {later.map((p) => (
          <Button key={p.id} size="sm" variant="quiet" aria-describedby={lineId} onClick={() => store.move(p.id, { kind: "slot", slotId: item.slot.id })}>
            {`Move the ${whenLabel(p.dayId, p.time)} post here`}
          </Button>
        ))}
        <ButtonLink href="/drafts" size="sm" variant={waiting.length === 0 ? "action" : "quiet"}>
          Approve a draft
        </ButtonLink>
      </div>
    </div>
  )
}

function clip(t: string, n = 28) {
  return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : t.replace(/[.!?]+$/, "")
}
