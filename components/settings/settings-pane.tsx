"use client"

import * as React from "react"

import {
  Button,
  ButtonAnchor,
  Fact,
  Facts,
  Field,
  HoldButton,
  Input,
  MarginNote,
  MarginRoom,
  Mono,
  Perched,
  Select,
  Text,
  TextLink,
  Well,
  useAnnounce,
} from "@/components/kit"
import { BillingActions } from "@/components/billing/billing-actions"
import { CheckoutConfirmed, CheckoutPending } from "@/components/billing/checkout-done"
import { COULD_NOT_REACH } from "@/lib/action-error"
import { MCP_CLIENT_NAME_MAX } from "@/lib/mcp-shared"
import { timeIn, zoneLabel, zoneOptions } from "@/lib/zones"
import {
  changePassword,
  registerAgent,
  removeConnectedAgent,
  revokeOtherSessions,
  revokeSessions,
  saveName,
  saveTimezone,
} from "@/app/(app)/settings/actions"
import { cancelPlan, keepPlan } from "@/app/(app)/settings/billing/actions"

import type { Item, SettingsData } from "./settings-rows"

/**
 * The open setting, in Drafts' pane order (components/drafts/open-draft.tsx):
 *
 * 1. One strong sentence that states the setting, and one muted line of
 *    provenance under it, `gap-kit-related` apart.
 * 2. The working object, `gap-kit-group` below: a kit Field (its label row
 *    carries a mono fact through `meta`), or Facts in a Well.
 * 3. The verbs in one row: the ink pill, a ghost beside it, a hold pushed
 *    to the end. `gap-kit-controls`, size sm.
 *
 * Quincy's note sits in the margin beside the object, in graphite, through
 * MarginRoom and MarginNote, with Drafts' 150px margin column. Every server
 * action is awaited inside a try: a refusal comes back as a sentence, a
 * call that never answers says COULD_NOT_REACH, and both are said aloud
 * through the workspace's Announcer.
 */

/** Drafts' margin column (components/drafts/drafts-fold.ts MARK_COLUMN_PX). */
const MARGIN = { "--spacing-kit-margin": "150px" } as React.CSSProperties

/** The name field's ceiling; `saveName` refuses anything longer. */
const NAME_MAX = 80
const EMPTY_NAME = "Quincy needs something to call you."

type Props = {
  item: Item
  note?: string
  data: SettingsData
  now: Date
  /** The row is gone (a browser signed out, an agent removed): open the next one. */
  onRemoved: () => void
}

export function SettingsPane(props: Props) {
  const { item, data, now } = props
  // Back from Checkout: the plan's pane is the confirmation, with its own
  // heading and friend, and nothing that could start a second Checkout.
  if (item.kind === "plan" && data.billing.checkout) {
    return (
      <article aria-label={item.title} className="flex flex-col gap-kit-group">
        {data.billing.checkout === "confirmed" ? (
          <CheckoutConfirmed
            renews={data.plan.renews}
            soldThroughLink={data.billing.managed}
            price={data.billing.price}
            disabled={!data.billing.configured}
          />
        ) : (
          <CheckoutPending soldThroughLink={data.billing.managed} />
        )}
      </article>
    )
  }
  const [sentence, provenance] = words(item, data, now)
  return (
    <article aria-label={item.title} style={MARGIN} className="flex flex-col gap-kit-group">
      <div className="flex flex-col gap-kit-related">
        <h2 className="text-kit-body font-kit-strong text-balance break-words text-kit-ink">{sentence}</h2>
        <p className="text-kit-meta text-pretty text-kit-ink-muted">{provenance}</p>
      </div>
      <Work {...props} />
    </article>
  )
}

/** The name Quincy writes with; the address when there is none. */
function shownName(d: SettingsData) {
  return d.name.trim() || d.email
}

/** The sentence and its provenance, from the account. */
function words(item: Item, d: SettingsData, now: Date): [string, React.ReactNode] {
  switch (item.kind) {
    case "name":
      return [`Quincy calls you ${shownName(d)}.`, "Every mail it sends opens with this name."]
    case "zone":
      return [
        `Your day runs on ${d.timezone.replace(/_/g, " ")}, ${timeIn(d.timezone, now)} now.`,
        "Every slot, rhythm and date in the product is this clock.",
      ]
    case "email":
      return [
        `You sign in as ${d.email}.`,
        `${d.emailVerified ? "Verified. " : ""}Moving the address is not built yet; write to us and it is moved by hand.`,
      ]
    case "password":
      return [
        d.google ? "You sign in with a password, or with Google." : "You sign in with a password.",
        "Changing it signs every other browser out.",
      ]
    case "google":
      return d.password
        ? ["Google signs you in too.", "Either one opens the account. Google holds its own password and second step."]
        : ["You sign in with Google.", "Google holds the password and the second step. Nothing here needs one."]
    case "browser": {
      const b = d.browsers.find((x) => x.id === item.ref)
      if (!b) return [item.title, ""]
      return [
        b.current ? `${b.name} is this browser.` : `${b.name} holds a key.`,
        `Signed in ${b.signedIn.sentence} · ${b.current ? "active now" : `last used ${b.lastUsed.sentence}`}.`,
      ]
    }
    case "agent": {
      const g = d.agents.find((x) => x.clientId === item.ref)
      if (!g) return [item.title, ""]
      const connected = g.connected ? `Connected ${g.connected.sentence}` : "Connected"
      const key = g.lastKey ? `last key ${g.lastKey.sentence}` : "no key taken yet"
      return [`${g.name} can reach Quincy.`, `${connected} · ${key}. It never approves, schedules or publishes.`]
    }
    case "register":
      return [
        `${d.registered} of ${d.agentLimit} agents registered by hand.`,
        "Most agents introduce themselves at /api/mcp. Register one here only if it cannot.",
      ]
    case "plan":
      return [d.plan.title, d.plan.body]
    case "usage": {
      // One sentence against the person's own last month (vision.md),
      // shown once, here; the plan's pane does not repeat it.
      const u = d.usage
      const against =
        u.lastMonthTurns == null
          ? ""
          : `, ${u.turns < u.lastMonthTurns ? "under" : u.turns > u.lastMonthTurns ? "over" : "level with"} last month’s ${u.lastMonthTurns.toLocaleString("en-GB")}`
      return [
        u.turns === 0 ? "Nothing spent this month." : `${u.turns.toLocaleString("en-GB")} turns${against}. ${u.cost} so far, an estimate.`,
        <>
          Not an invoice. Every charge is on <TextLink href="/credits">Credits</TextLink>.
        </>,
      ]
    }
    case "leave":
      return [
        "Deleting the account is done by hand, for now.",
        "The brain, every conversation, idea and draft, the channel connections and their tokens, and anything waiting in the schedule go with it, and an active plan is cancelled. Nothing is kept. Until deleting here is built, write to us and it is done the same day.",
      ]
  }
}

// ── Shared pieces ──────────────────────────────────────────────────────────

/**
 * "Saved", after the fact: announced without moving focus, a fade only,
 * none under reduced motion. Always in the DOM so nothing beside it moves.
 */
function Saved({ show, children = "Saved" }: { show: boolean; children?: string }) {
  return (
    <span
      aria-live="polite"
      className="text-kit-small text-kit-ink-muted transition-opacity duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none"
      style={{ opacity: show ? 1 : 0 }}
    >
      {show ? children : " "}
    </span>
  )
}

/** A flag that turns itself off, for "Saved". */
function useFlash(ms = 2500) {
  const [on, setOn] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )
  const flash = React.useCallback(() => {
    setOn(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setOn(false), ms)
  }, [ms])
  return [on, flash] as const
}

/**
 * A local copy of a server value: the field keeps what was typed while the
 * action is in flight, and follows the server again once the revalidated
 * page brings a new value back. Resynced during render, not in an effect,
 * so the stale value is never painted.
 */
function useDraft(serverValue: string) {
  const [draft, setDraft] = React.useState(serverValue)
  const [seen, setSeen] = React.useState(serverValue)
  if (seen !== serverValue) {
    setSeen(serverValue)
    setDraft(serverValue)
  }
  return [draft, setDraft] as const
}

/** A refusal that is not about one field (states.md): ink, no red. Announced by the caller. */
function Problem({ children }: { children: string | null }) {
  if (!children) return null
  return <span className="order-last basis-full text-kit-meta text-kit-ink">{children}</span>
}

/**
 * Pushes what follows to the row's end while it fits on the line; once the
 * row wraps, the spacer stays on the first line and the hold starts the
 * next one at the left, never floating right on its own.
 */
function Push() {
  return <span aria-hidden className="min-w-0 grow" />
}

/**
 * The object with the note in the margin beside it, then the verbs. A form
 * wraps both when the object is one, so Enter submits.
 */
function Room({
  note,
  object,
  verbs,
  onSubmit,
}: {
  note?: string
  object?: React.ReactNode
  verbs?: React.ReactNode
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void
}) {
  const inner = (
    <div className="flex flex-col gap-kit-related">
      {object != null ? <MarginRoom.Column>{note ? <MarginNote note={note}>{object}</MarginNote> : object}</MarginRoom.Column> : null}
      {verbs != null ? <MarginRoom.Column className="flex flex-wrap items-center gap-kit-controls">{verbs}</MarginRoom.Column> : null}
    </div>
  )
  return (
    <MarginRoom>
      {onSubmit ? (
        <form onSubmit={onSubmit} noValidate>
          {inner}
        </form>
      ) : (
        inner
      )}
    </MarginRoom>
  )
}

// ── The work, by kind ──────────────────────────────────────────────────────

function Work({ item, note, data, now, onRemoved }: Props) {
  switch (item.kind) {
    case "name":
      return <NameWork name={data.name.trim()} note={note} />
    case "zone":
      return <ZoneWork current={data.timezone} note={note} now={now} />
    case "password":
      return <PasswordWork data={data} note={note} />
    case "google":
      return (
        <Room
          note={note}
          object={
            <Well>
              <Facts>
                <Fact label="Google account">{data.email}</Fact>
              </Facts>
            </Well>
          }
        />
      )
    case "email":
      return (
        <Room
          note={note}
          object={
            <Well>
              <Facts>
                <Fact label="Address">
                  <span className="break-all">{data.email}</span>
                </Fact>
                <Fact label="Verified">{data.emailVerified ? "Yes" : "Not yet"}</Fact>
              </Facts>
            </Well>
          }
          verbs={
            <ButtonAnchor size="sm" href={`mailto:${data.supportEmail}?subject=Change%20my%20email%20address`}>
              Write to us
            </ButtonAnchor>
          }
        />
      )
    case "browser":
      return <BrowserWork data={data} id={item.ref ?? ""} note={note} onRemoved={onRemoved} />
    case "agent":
      return <AgentWork data={data} id={item.ref ?? ""} note={note} onRemoved={onRemoved} />
    case "register":
      return <RegisterWork note={note} />
    case "plan":
      return <PlanWork data={data} note={note} />
    case "usage":
      return null
    case "leave":
      return (
        <Room
          note={note}
          object={
            <Well>
              <Facts>
                <Fact label="By mail">
                  <span className="break-all">{data.supportEmail}</span>
                </Fact>
              </Facts>
            </Well>
          }
          verbs={
            <>
              <ButtonAnchor size="sm" href={`mailto:${data.supportEmail}?subject=Delete%20my%20account`}>
                Write to us
              </ButtonAnchor>
              <Push />
              {/* The shape self-serve delete takes (plans/035): a hold, at
                  the end, away from the mail. Off until it is built. */}
              <HoldButton disabled onConfirm={() => {}}>
                Delete the account
              </HoldButton>
            </>
          }
        />
      )
  }
}

function NameWork({ name, note }: { name: string; note?: string }) {
  const [draft, setDraft] = useDraft(name)
  const [server, setServer] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const [saved, flash] = useFlash()
  const announce = useAnnounce()
  const trimmed = draft.trim()
  const changed = trimmed !== name
  return (
    <Room
      note={note}
      onSubmit={async (e) => {
        e.preventDefault()
        if (!trimmed) {
          setServer(EMPTY_NAME)
          return
        }
        if (!changed || pending) return
        setServer(null)
        setPending(true)
        try {
          const r = await saveName(draft)
          if (!r.ok) {
            setServer(r.message)
            return
          }
          flash()
        } catch {
          setServer(COULD_NOT_REACH)
          announce(COULD_NOT_REACH)
        } finally {
          setPending(false)
        }
      }}
      object={
        <Field
          label="Display name"
          meta={<Mono size="sm">{`${trimmed.length}/${NAME_MAX}`}</Mono>}
          error={server ?? undefined}
          validate={(v) => (String(v ?? "").trim() ? null : EMPTY_NAME)}
        >
          <Input
            name="name"
            autoComplete="name"
            maxLength={NAME_MAX}
            value={draft}
            onValueChange={(v) => {
              setServer(null)
              setDraft(v)
            }}
          />
        </Field>
      }
      verbs={
        <>
          <Button type="submit" size="sm" variant="action" pending={pending} pendingLabel="Saving…" disabled={!changed}>
            Save
          </Button>
          {changed ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(name)
                setServer(null)
              }}
            >
              Reset
            </Button>
          ) : null}
          <Saved show={saved} />
        </>
      }
    />
  )
}

function ZoneWork({ current, note, now }: { current: string; note?: string; now: Date }) {
  const [draft, setDraft] = useDraft(current)
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [saved, flash] = useFlash()
  const announce = useAnnounce()
  const choices = React.useMemo(() => zoneOptions(current).map((z) => ({ value: z, label: zoneLabel(z, now) })), [current, now])
  const offset = zoneLabel(draft, now).split(" · ")[1] ?? ""
  const changed = draft !== current
  return (
    <Room
      note={note}
      onSubmit={async (e) => {
        e.preventDefault()
        if (!changed || pending) return
        setProblem(null)
        setPending(true)
        try {
          const r = await saveTimezone(draft)
          if (!r.ok) {
            setProblem(r.message)
            announce(r.message)
            return
          }
          flash()
        } catch {
          setProblem(COULD_NOT_REACH)
          announce(COULD_NOT_REACH)
        } finally {
          setPending(false)
        }
      }}
      object={
        <Field label="Time zone" meta={<Mono size="sm">{`${offset ? `${offset} · ` : ""}${timeIn(draft, now)}`}</Mono>} error={problem ?? undefined}>
          <Select
            name="timezone"
            options={choices}
            value={draft}
            onValueChange={(v) => {
              setProblem(null)
              setDraft(v ?? draft)
            }}
          />
        </Field>
      }
      verbs={
        <>
          <Button type="submit" size="sm" variant="action" pending={pending} pendingLabel="Saving…" disabled={!changed}>
            Save
          </Button>
          {changed ? (
            <Button size="sm" variant="ghost" onClick={() => setDraft(current)}>
              Reset
            </Button>
          ) : null}
          <Saved show={saved} />
        </>
      }
    />
  )
}

/**
 * The password form: three named Fields that compare with each other, so
 * `touched` drives their errors: judged after a field is left, then on
 * every keystroke, so an error leaves the moment it is fixed. Reset after a
 * change by remounting.
 */
function PasswordWork({ data, note }: { data: SettingsData; note?: string }) {
  const [round, setRound] = React.useState(0)
  const [saved, flash] = useFlash()
  const others = data.browsers.filter((b) => !b.current).length
  return (
    <Room
      note={note}
      object={
        <div className="flex flex-col gap-kit-related">
          <PasswordForm
            key={round}
            email={data.email}
            others={others}
            onDone={() => {
              setRound((r) => r + 1)
              flash()
            }}
          />
          <Saved show={saved}>Password changed. The other browsers are signed out.</Saved>
        </div>
      }
    />
  )
}

function PasswordForm({ email, others, onDone }: { email: string; others: number; onDone: () => void }) {
  const [current, setCurrent] = React.useState("")
  const [next, setNext] = React.useState("")
  const [confirm, setConfirm] = React.useState("")
  const [touched, setTouched] = React.useState<Record<string, boolean>>({})
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [currentProblem, setCurrentProblem] = React.useState<string | null>(null)
  const announce = useAnnounce()

  const missingCurrent = touched.current && current.length === 0
  const tooShort = touched.next && next.length < 8
  const sameAsOld = touched.next && next.length > 0 && next === current
  const mismatch = touched.confirm && confirm !== next
  const ready = current.length > 0 && next.length >= 8 && next !== current && confirm === next

  return (
    <form
      className="flex flex-col gap-kit-group"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault()
        setTouched({ current: true, next: true, confirm: true })
        if (!ready || pending) return
        setProblem(null)
        setCurrentProblem(null)
        setPending(true)
        try {
          const r = await changePassword(current, next)
          if (!r.ok) {
            if (r.field === "currentPassword") setCurrentProblem(r.message)
            else {
              setProblem(r.message)
              announce(r.message)
            }
            return
          }
          onDone()
        } catch {
          setProblem(COULD_NOT_REACH)
          announce(COULD_NOT_REACH)
        } finally {
          setPending(false)
        }
      }}
    >
      {/* For password managers: they file the new password under this account. */}
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <Field label="Current password" error={missingCurrent ? "Type the password you sign in with now." : (currentProblem ?? undefined)}>
        <Input
          type="password"
          autoComplete="current-password"
          value={current}
          onBlur={() => setTouched((t) => ({ ...t, current: true }))}
          onValueChange={(v) => {
            setCurrent(v)
            setCurrentProblem(null)
          }}
        />
      </Field>
      <Field
        label="New password"
        description={tooShort || sameAsOld ? undefined : "At least 8 characters."}
        error={tooShort ? "Use at least 8 characters." : sameAsOld ? "That is the password you already have." : undefined}
      >
        <Input type="password" autoComplete="new-password" value={next} onBlur={() => setTouched((t) => ({ ...t, next: true }))} onValueChange={setNext} />
      </Field>
      <Field label="Type it again" error={mismatch ? "The two do not match yet." : undefined}>
        <Input type="password" autoComplete="new-password" value={confirm} onBlur={() => setTouched((t) => ({ ...t, confirm: true }))} onValueChange={setConfirm} />
      </Field>
      {problem ? <Text>{problem}</Text> : null}
      {others > 0 ? (
        <Text variant="small" tone="muted">
          {others === 1 ? "The other browser is signed out when it changes." : `The other ${others} browsers are signed out when it changes.`}
        </Text>
      ) : null}
      <div>
        <Button type="submit" size="sm" variant="action" pending={pending} pendingLabel="Changing…">
          Change password
        </Button>
      </div>
    </form>
  )
}

function BrowserWork({ data, id, note, onRemoved }: { data: SettingsData; id: string; note?: string; onRemoved: () => void }) {
  const b = data.browsers.find((x) => x.id === id)
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const announce = useAnnounce()
  if (!b) return null
  const others = data.browsers.filter((x) => !x.current).length

  const refuse = (message: string) => {
    setProblem(message)
    announce(message)
  }

  return (
    <Room
      note={note}
      object={
        <Well>
          <Facts>
            <Fact label="Sessions">
              <Mono size="sm" tone="ink">
                {String(b.count)}
              </Mono>
            </Fact>
            <Fact label="Signed in">
              <span title={b.signedIn.full}>
                <Mono size="sm" tone="ink">
                  {b.signedIn.short}
                </Mono>
              </span>
            </Fact>
            <Fact label="Last used">
              <span title={b.current ? "Active now" : b.lastUsed.full}>
                <Mono size="sm" tone="ink">
                  {b.current ? "Now" : b.lastUsed.short}
                </Mono>
              </span>
            </Fact>
          </Facts>
        </Well>
      }
      verbs={
        b.current ? (
          others > 0 ? (
            <>
              {/* Every other browser at once: a hold (AGENTS.md, Destructive
                  actions). Never "everywhere": this one stays signed in. */}
              <HoldButton
                pendingLabel="Signing out…"
                doneLabel="Signed out"
                onConfirm={async () => {
                  setProblem(null)
                  let r: Awaited<ReturnType<typeof revokeOtherSessions>>
                  try {
                    r = await revokeOtherSessions()
                  } catch {
                    refuse(COULD_NOT_REACH)
                    throw new Error(COULD_NOT_REACH)
                  }
                  if (!r.ok) {
                    refuse(r.message)
                    throw new Error(r.message)
                  }
                  announce(others === 1 ? "The other browser is signed out." : "The other browsers are signed out.")
                }}
              >
                {others === 1 ? "Sign out the other browser" : `Sign out the other ${others}`}
              </HoldButton>
              <Problem>{problem}</Problem>
            </>
          ) : (
            <span className="text-kit-meta text-kit-ink-muted">The only browser signed in.</span>
          )
        ) : (
          <>
            {/* A plain button, not a hold: signing in again undoes it. */}
            <Button
              size="sm"
              pending={pending}
              pendingLabel="Signing out…"
              onClick={async () => {
                if (pending) return
                setProblem(null)
                setPending(true)
                try {
                  const r = await revokeSessions(b.ids)
                  if (!r.ok) {
                    refuse(r.message)
                    return
                  }
                  announce(`${b.name} is signed out.`)
                  onRemoved()
                } catch {
                  refuse(COULD_NOT_REACH)
                } finally {
                  setPending(false)
                }
              }}
            >
              Sign out
            </Button>
            <Problem>{problem}</Problem>
          </>
        )
      }
    />
  )
}

function AgentWork({ data, id, note, onRemoved }: { data: SettingsData; id: string; note?: string; onRemoved: () => void }) {
  const g = data.agents.find((x) => x.clientId === id)
  const [problem, setProblem] = React.useState<string | null>(null)
  const announce = useAnnounce()
  const describedBy = React.useId()
  if (!g) return null
  const refuse = (message: string) => {
    setProblem(message)
    announce(message)
  }
  return (
    <Room
      note={note}
      object={
        <Well>
          <Facts>
            <Fact label="Since">
              {g.connected ? (
                <span title={g.connected.full}>
                  <Mono size="sm" tone="ink">
                    {g.connected.short}
                  </Mono>
                </span>
              ) : (
                "Not known"
              )}
            </Fact>
            <Fact label="Last key">
              {g.lastKey ? (
                <span title={g.lastKey.full}>
                  <Mono size="sm" tone="ink">
                    {g.lastKey.short}
                  </Mono>
                </span>
              ) : (
                "Never"
              )}
            </Fact>
            <Fact label="Client">
              <span className="break-all select-all">
                <Mono size="sm" tone="ink">
                  {g.clientId}
                </Mono>
              </span>
            </Fact>
            <Fact label="Came">{g.owned ? "Registered here" : "Introduced itself"}</Fact>
          </Facts>
        </Well>
      }
      verbs={
        <>
          <Push />
          {/* A hold: this ends a connection, and the agent has to ask and be
              consented to again. */}
          <HoldButton
            pendingLabel="Removing…"
            doneLabel="Removed"
            aria-describedby={describedBy}
            onConfirm={async () => {
              setProblem(null)
              let r: Awaited<ReturnType<typeof removeConnectedAgent>>
              try {
                r = await removeConnectedAgent(g.clientId)
              } catch {
                refuse(COULD_NOT_REACH)
                throw new Error(COULD_NOT_REACH)
              }
              if (!r.ok) {
                refuse(r.message)
                throw new Error(r.message)
              }
              announce(`${g.name} is removed.`)
              onRemoved()
            }}
          >
            Remove
          </HoldButton>
          <Problem>{problem}</Problem>
          <span id={describedBy} className="order-last basis-full text-kit-meta text-pretty text-kit-ink-muted">
            Removing takes back your consent and the refresh key. A key it already holds works for up to an hour: it is signed,
            not stored, so there is nothing to withdraw.
          </span>
        </>
      }
    />
  )
}

/** Register an agent that cannot introduce itself. The client id is shown once. */
function RegisterWork({ note }: { note?: string }) {
  const [name, setName] = React.useState("")
  const [redirect, setRedirect] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [issued, setIssued] = React.useState<string | null>(null)
  const announce = useAnnounce()
  const ready = name.trim().length > 0 && redirect.trim().length > 0
  return (
    <Room
      note={note}
      onSubmit={async (e) => {
        e.preventDefault()
        if (pending) return
        setProblem(null)
        setIssued(null)
        setPending(true)
        try {
          const r = await registerAgent({ name, redirectUri: redirect })
          if (!r.ok) {
            setProblem(r.message)
            announce(r.message)
            return
          }
          setIssued(r.clientId)
          setName("")
          setRedirect("")
        } catch {
          setProblem(COULD_NOT_REACH)
          announce(COULD_NOT_REACH)
        } finally {
          setPending(false)
        }
      }}
      object={
        <div className="flex flex-col gap-kit-group">
          <Field label="Name" description="What you will see on this list, and on the screen that asks you to allow it.">
            <Input
              name="agent-name"
              autoComplete="off"
              spellCheck={false}
              maxLength={MCP_CLIENT_NAME_MAX}
              placeholder="My terminal agent"
              value={name}
              onValueChange={setName}
              data-1p-ignore
            />
          </Field>
          <Field label="Redirect URI" description="Whatever the agent printed. https://, or http:// on localhost, any 127.x.x.x address or [::1].">
            <Input
              type="url"
              mono
              name="agent-redirect"
              autoComplete="off"
              spellCheck={false}
              placeholder="http://127.0.0.1:33418/callback"
              value={redirect}
              onValueChange={setRedirect}
              data-1p-ignore
            />
          </Field>
          {problem ? <Text>{problem}</Text> : null}
          {issued ? (
            <div className="flex flex-col gap-kit-tight" role="status">
              <Text variant="small" tone="muted">
                Client id. Paste it into the agent; it is shown once.
              </Text>
              <span className="break-all select-all">
                <Mono tone="ink">{issued}</Mono>
              </span>
            </div>
          ) : null}
        </div>
      }
      verbs={
        <Button type="submit" size="sm" variant="action" pending={pending} pendingLabel="Registering…" disabled={!ready}>
          Register
        </Button>
      }
    />
  )
}

/**
 * The plan: the price as a figure in a Well, its dates as Facts, and the
 * friend perched on the Well only where the state means something (stuck
 * on a failed charge, resting once Quincy has stopped writing). Then the
 * verbs: Checkout or the portal (quiet on a healthy plan, so the page's one
 * ink stays an edit; ink when it asks), and Cancel as a hold pushed to the
 * end, or "Keep my plan" in its place once ending.
 */
function PlanWork({ data, note }: { data: SettingsData; note?: string }) {
  const p = data.plan
  const { billing } = data
  const [keeping, setKeeping] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const announce = useAnnounce()
  const describedBy = React.useId()
  const swapRef = React.useRef<HTMLSpanElement>(null)
  // After a change the server renders the other control; focus goes to it.
  // Set before the call: the revalidated render can commit before the
  // awaited result comes back, and the effect has to see it.
  const swapped = React.useRef(false)
  React.useEffect(() => {
    if (!swapped.current) return
    swapped.current = false
    swapRef.current?.querySelector("button")?.focus()
  }, [p.ending])

  const refuse = (message: string) => {
    swapped.current = false
    setProblem(message)
    announce(message)
  }

  const friend = p.state === "lapsed" ? "stuck" : p.state === "expired" ? "resting" : null
  const ink = p.mode === "subscribe" || p.state === "lapsed"
  const dates: [string, string][] =
    p.state === "trialing"
      ? [["Free until", p.trialEnds ?? "the end of the trial"]]
      : p.state === "active"
        ? [[p.ending ? "Ends" : "Renews", p.renews ?? "at the end of the period"]]
        : p.state === "lapsed"
          ? [["Last charge", p.recoverable ? "Failed" : "Cancelled"]]
          : [["Writing", "Stopped"]]
  const cancellable = p.state === "active" && billing.configured

  const well = (
    <Well>
      <div className="flex flex-col gap-kit-related">
        <div className="flex min-w-0 flex-col gap-kit-tight">
          <span className="text-kit-meta text-kit-ink-muted">Quincy, one plan</span>
          <span className="flex flex-wrap items-baseline gap-x-2">
            <Text as="span" variant="figure">{`$${billing.price}`}</Text>
            <span className="text-kit-meta text-kit-ink-muted">{billing.managed ? "a month, plus VAT where it applies" : "a month"}</span>
          </span>
        </div>
        <Facts>
          {dates.map(([label, value]) => (
            <Fact key={label} label={label}>
              {value}
            </Fact>
          ))}
          <Fact label="Receipts">{billing.managed ? "From Link, by email" : "From Stripe, by email"}</Fact>
        </Facts>
      </div>
    </Well>
  )

  return (
    <Room
      note={note}
      object={
        friend ? (
          // Room above the Well for the friend's head, so it never sits on
          // the provenance line.
          <div className="pt-kit-related">
            <Perched state={friend} size={32} at="calc(100% - 56px)">
              {well}
            </Perched>
          </div>
        ) : (
          well
        )
      }
      verbs={
        <>
          <BillingActions
            mode={p.mode}
            size="sm"
            variant={ink ? "action" : "quiet"}
            price={billing.price}
            label={p.state === "lapsed" && p.recoverable ? "Update your card" : undefined}
            disabled={!billing.configured}
            disabledReason={
              billing.configured ? undefined : "Billing is not set up here: STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are missing."
            }
          />
          {cancellable ? (
            <>
              <Push />
              <span ref={swapRef}>
                {p.ending ? (
                  <Button
                    size="sm"
                    pending={keeping}
                    pendingLabel="Keeping the plan…"
                    aria-describedby={describedBy}
                    onClick={async () => {
                      if (keeping) return
                      setProblem(null)
                      setKeeping(true)
                      swapped.current = true
                      try {
                        const r = await keepPlan()
                        if (!r.ok) refuse(r.message)
                        else announce(`The plan renews${p.renews ? ` on ${p.renews}` : ""} as before.`)
                      } catch {
                        refuse(COULD_NOT_REACH)
                      } finally {
                        // Released either way: on success the button is about
                        // to go, and it must not come back pending later.
                        setKeeping(false)
                      }
                    }}
                  >
                    Keep my plan
                  </Button>
                ) : (
                  <HoldButton
                    pendingLabel="Cancelling…"
                    doneLabel="Cancelled"
                    aria-describedby={describedBy}
                    onConfirm={async () => {
                      setProblem(null)
                      swapped.current = true
                      let r: Awaited<ReturnType<typeof cancelPlan>>
                      try {
                        r = await cancelPlan()
                      } catch {
                        refuse(COULD_NOT_REACH)
                        throw new Error(COULD_NOT_REACH)
                      }
                      if (!r.ok) {
                        refuse(r.message)
                        // A throw returns the hold to idle, so it can be held again.
                        throw new Error(r.message)
                      }
                      announce(`Cancelled. The plan stays on until ${p.renews ?? "the end of the period"}.`)
                    }}
                  >
                    Cancel subscription
                  </HoldButton>
                )}
              </span>
              <Problem>{problem}</Problem>
              <span id={describedBy} className="order-last basis-full text-kit-meta text-pretty text-kit-ink-muted">
                {p.ending
                  ? `Keep the plan and it renews ${p.renews ? `on ${p.renews}` : "at the end of the period"} as before.`
                  : `Cancel and the plan stays on until ${p.renews ?? "the end of the period"}, then stops. Nothing is refunded for the period already paid, and your brain, drafts and conversations stay.`}
              </span>
            </>
          ) : null}
        </>
      }
    />
  )
}
