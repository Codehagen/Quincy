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
import { addDayKeys } from "@/lib/lineup-week"

import { onDay, quoted, slotLabel, whenLabel, type Item, type OpenItem, type PostItem, type UnplacedItem } from "./lineup-model"
import type { LineupStore } from "./use-lineup"

/**
 * What can be done with the open item, under its picture: one status line
 * in words, then the kit's Buttons, at most one of them ink.
 *
 * - A queued post: "Goes out Tue 08:00, in your Tue 08:00 X slot." Move (M),
 *   Post now (P, behind the confirmation), Back to Drafts (B). No ink:
 *   nothing is asked of you.
 * - Sending: the caution, and nothing to press (a retry is the double post
 *   lib/publish-run.ts exists to prevent).
 * - Sent: when, and the receipt.
 * - Didn’t go: the platform's words (not red: nothing was destroyed), Try
 *   again now (P) as the ink action, Back to Drafts.
 * - An open slot: a queued post on its channel that could move in, and
 *   Approve a draft.
 * - Approved, no time: Give it a time (G) as the ink action, Post now.
 *
 * Every press is a server action through the store (use-lineup.ts).
 */
export function ItemVerbs({ item, store }: { item: Item; store: LineupStore }) {
  const lineId = React.useId()
  if (item.kind === "post") return <PostVerbs item={item} store={store} lineId={lineId} />
  if (item.kind === "unplaced") return <UnplacedVerbs item={item} store={store} lineId={lineId} />
  return <OpenVerbs item={item} store={store} lineId={lineId} />
}

function BackToDrafts({ item, store, lineId }: { item: PostItem; store: LineupStore; lineId: string }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      shortcut="B"
      aria-describedby={lineId}
      pending={store.sendingBack === item.post.id}
      pendingLabel="Sending it back…"
      onClick={() => store.unschedule(item.post.id)}
    >
      Back to Drafts
    </Button>
  )
}

function PostVerbs({ item, store, lineId }: { item: PostItem; store: LineupStore; lineId: string }) {
  const post = item.post
  const today = store.clock.day
  const slot = post.slotId ? store.week.slots.find((s) => s.id === post.slotId) : null
  if (post.state === "sending") {
    return (
      <p className="text-kit-dense text-pretty text-kit-ink">
        Quincy is sending this one.{" "}
        <span className="text-kit-ink-muted">{post.error ?? "Nobody can say yet whether it went. Check the account before you try again."}</span>
      </p>
    )
  }
  if (post.state === "published") {
    return (
      <p className="text-kit-dense text-pretty text-kit-ink">
        Posted {post.dayId === today ? `today at ${post.time}` : whenLabel(post.dayId, post.time, today)}.{" "}
        {post.url ? <TextLink href={post.url}>View the post</TextLink> : null}
      </p>
    )
  }
  if (post.state === "failed") {
    return (
      <div className="flex flex-col gap-kit-related">
        <p id={lineId} className="text-kit-dense text-pretty text-kit-ink">
          {post.error ?? "It did not go out."}{" "}
          <span className="text-kit-ink-muted">{`Nothing went out at ${post.time}. Send it again now, or back to Drafts for a new time.`}</span>
        </p>
        <div className="flex flex-wrap items-center gap-kit-controls">
          <PostNow item={item} store={store} label="Try again now" isAction />
          <BackToDrafts item={item} store={store} lineId={lineId} />
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-kit-related">
      <p id={lineId} className="text-kit-dense text-pretty text-kit-ink">
        Goes out {whenLabel(post.dayId, post.time, today)}
        {slot ? `, in your ${slotLabel(slot)} ${slot.channelLabel} slot.` : ". A one-off: no slot behind it."}
      </p>
      <div className="flex flex-wrap items-center gap-kit-controls">
        <MoveMenu item={item} store={store} />
        <PostNow item={item} store={store} label="Post now" />
        <BackToDrafts item={item} store={store} lineId={lineId} />
      </div>
    </div>
  )
}

/** Where a queued post can go: the open slots on its channel still ahead this week, the same time a day later or earlier, a step on its channel. */
export function MoveMenu({ item, store }: { item: PostItem; store: LineupStore }) {
  const post = item.post
  const open = store.allItems.filter((i): i is OpenItem => i.kind === "open" && !i.passed && i.channel === post.channel)
  const tomorrow = addDayKeys(post.dayId, 1)
  const yesterday = addDayKeys(post.dayId, -1)
  const earlierOk = !store.isPast(yesterday, post.time)
  const today = store.clock.day
  return (
    <Menu open={store.menu === post.id} onOpenChange={(o) => store.setMenu(o ? post.id : null)}>
      <MenuTrigger
        render={
          <Button size="sm" variant="quiet" iconEnd={ArrowDown01Icon} shortcut="M" disabled={store.inFlight}>
            Move
          </Button>
        }
      />
      <MenuPanel>
        {open.map((o) => (
          <MenuItem key={o.key} onClick={() => store.moveToTarget(post.id, o.dayId, o.time)}>
            {`To the open ${whenLabel(o.dayId, o.time, today)} slot`}
          </MenuItem>
        ))}
        {open.length > 0 ? <MenuSeparator /> : null}
        <MenuItem onClick={() => store.moveToTarget(post.id, tomorrow, post.time)}>{`Same time, a day later (${onDay(tomorrow, today)})`}</MenuItem>
        {earlierOk ? <MenuItem onClick={() => store.moveToTarget(post.id, yesterday, post.time)}>{`Same time, a day earlier (${onDay(yesterday, today)})`}</MenuItem> : null}
        <MenuSeparator />
        <MenuItem onClick={() => store.shift(post.id, -1)}>Earlier on its channel (⇧K)</MenuItem>
        <MenuItem onClick={() => store.shift(post.id, 1)}>Later on its channel (⇧J)</MenuItem>
      </MenuPanel>
    </Menu>
  )
}

/** Post now, behind the one confirmation the product keeps: a post cannot be unsent. P opens it. */
export function PostNow({ item, store, label, isAction = false }: { item: PostItem | UnplacedItem; store: LineupStore; label: string; isAction?: boolean }) {
  const text = item.kind === "post" ? item.post.opening : item.unplaced.opening
  return (
    <AlertDialog open={store.confirm === item.key} onOpenChange={(o) => store.setConfirm(o ? item.key : null)}>
      {/* The open state is the store's, so P and the press share it. */}
      <Button
        size="sm"
        variant={isAction ? "action" : "quiet"}
        icon={SentIcon}
        shortcut="P"
        pending={store.posting === item.key}
        pendingLabel="Posting…"
        disabled={store.posting != null && store.posting !== item.key}
        onClick={() => store.setConfirm(item.key)}
      >
        {label}
      </Button>
      <AlertDialogPanel title={`Post this to ${item.channelLabel} now?`} description={`${quoted(text)} goes out at once, in your name. Quincy can’t unsend it.`}>
        <AlertDialogCancel>Not yet</AlertDialogCancel>
        <AlertDialogAction variant="action" onConfirm={() => store.postNow(item.key)}>
          Post now
        </AlertDialogAction>
      </AlertDialogPanel>
    </AlertDialog>
  )
}

function UnplacedVerbs({ item, store, lineId }: { item: UnplacedItem; store: LineupStore; lineId: string }) {
  const u = item.unplaced
  const hasSlot = store.week.slots.some((s) => s.channel === u.channel)
  return (
    <div className="flex flex-col gap-kit-related">
      <p id={lineId} className="text-kit-dense text-pretty text-kit-ink">
        Approved, with no time.{" "}
        <span className="text-kit-ink-muted">
          {item.reason === "slots-full"
            ? `Every ${u.channelLabel} slot is taken for the next two weeks. Free one, add one, or send it now.`
            : !hasSlot
              ? `No ${u.channelLabel} slot yet. Add one, or send it now.`
              : "It was approved before the slot existed. It takes the next free one."}
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-kit-controls">
        {item.reason !== "slots-full" && hasSlot ? (
          <Button size="sm" variant="action" shortcut="G" aria-describedby={lineId} pending={store.placing === u.versionId} pendingLabel="Finding a slot…" onClick={() => store.place(u.versionId)}>
            Give it a time
          </Button>
        ) : (
          <Button size="sm" variant="quiet" shortcut="S" onClick={() => store.setSlotsOpen(true)}>
            Add a slot
          </Button>
        )}
        <PostNow item={item} store={store} label="Post now" />
      </div>
    </div>
  )
}

function OpenVerbs({ item, store, lineId }: { item: OpenItem; store: LineupStore; lineId: string }) {
  const today = store.clock.day
  if (item.passed) {
    return (
      <div className="flex flex-col gap-kit-related">
        <p id={lineId} className="text-kit-dense text-pretty text-kit-ink">
          {`Your ${slotLabel(item.slot)} ${item.channelLabel} slot passed with nothing in it.`}{" "}
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
  const later = store.week.posts
    .filter((p) => p.state === "queued" && p.channel === item.channel && `${p.dayId} ${p.time}` > `${item.dayId} ${item.time}`)
    .slice(0, 2)
  return (
    <div className="flex flex-col gap-kit-related">
      <p id={lineId} className="text-kit-dense text-pretty text-kit-ink">
        {`${whenLabel(item.dayId, item.time, today)} on ${item.channelLabel} is open.`}{" "}
        <span className="text-kit-ink-muted">{later.length > 0 ? "Move a later post here, or approve a draft and it lands here." : `Approve a ${item.channelLabel} draft and it takes this slot.`}</span>
      </p>
      <div className="flex flex-wrap items-center gap-kit-controls">
        {later.map((p) => (
          // The visible words are the name (WCAG 2.5.3, label in name); which post it is rides along as the description.
          <React.Fragment key={p.id}>
            <span id={`${lineId}-${p.id}`} hidden>
              {`${quoted(p.opening)}, ${p.channelLabel}`}
            </span>
            <Button size="sm" variant="quiet" aria-describedby={`${lineId}-${p.id}`} disabled={store.inFlight} onClick={() => store.moveToTarget(p.id, item.dayId, item.time)}>
              {`Move the ${whenLabel(p.dayId, p.time, today)} post here`}
            </Button>
          </React.Fragment>
        ))}
        <ButtonLink href="/drafts" size="sm" variant={later.length === 0 ? "action" : "quiet"}>
          Approve a draft
        </ButtonLink>
      </div>
    </div>
  )
}
