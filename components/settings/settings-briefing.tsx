"use client"

import * as React from "react"

import {
  Arrive,
  Button,
  Card,
  Field,
  HoldButton,
  Input,
  Mono,
  Muted,
  Select,
  Stage,
  Text,
  TextLink,
} from "@/components/kit"
import { timeIn, zoneLabel, zoneOptions } from "@/lib/zones"
import { MCP_CLIENT_NAME_MAX } from "@/lib/mcp-shared"
import { COULD_NOT_REACH } from "@/lib/action-error"
import {
  changePassword,
  registerAgent,
  removeConnectedAgent,
  revokeOtherSessions,
  revokeSessions,
  saveName,
  saveTimezone,
} from "@/app/(app)/settings/actions"

/**
 * Settings, as what Quincy knows. See plans/024.
 *
 * The page's job is not "change your settings", it is correct what Quincy
 * believes about you — the name it writes with and the clock it schedules
 * against are inputs to the drafting, not profile decoration. So each fact is
 * a sentence, and the value in it is the control.
 *
 * **Third person, never "I".** The app speaks as "I" only inside a transcript
 * (lib/onboarding.ts); every page says "Quincy". This is a page. The prototype
 * this came from used first person and it was the one thing changed on the way
 * in — that decision, and what it would take to reverse it, is in plans/024.
 *
 * The bound that keeps it readable: this page holds only facts that change what
 * Quincy does. Billing, credits and channel strategy have their own pages.
 *
 * **On the kit since 2026-11-16** (plans/029: a page moves whole). The facts
 * are grouped into three Stages (what Quincy knows, how you sign in, who else
 * can reach it) plus the way out, each one Card. A sentence's editor opens
 * under it with `Arrive`; only one is open at a time, so the page never shows
 * two ink submits (docs/design/actions.md).
 */

/**
 * One browser, and the sessions behind it. `ids` is a list because a browser
 * that has signed in repeatedly is still one row and one press — see the
 * grouping in the page component for why.
 */
type SessionGroup = {
  ids: string[]
  browser: string
  count: number
  lastSeen: string
  current: boolean
}

/**
 * One MCP client, already worded by the server.
 *
 * The two dates arrive as finished sentence fragments rather than as `Date`s,
 * for the reason the session list gives: "Yesterday" depends on the account's
 * zone, the server knows the zone, and formatting on the client would make the
 * first paint disagree with the second.
 */
type ConnectedAgent = {
  clientId: string
  name: string
  connected: string
  lastToken: string
}

type Drawer = "name" | "zone" | "password" | "sessions" | "register-agent" | "agents"

/**
 * The value, inside the sentence, as the thing you press.
 *
 * A real `<button>` rather than a span with a handler, so it is tabbable and
 * announced. The dotted underline is the affordance — a solid one would read as
 * a link to somewhere else (TextLink), which is exactly what this is not. Kit
 * tokens only: the link line's colour, the focus outline the kit's controls use.
 */
function Inline({
  label,
  open,
  onToggle,
  children,
  ref,
}: {
  label: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
  ref?: React.Ref<HTMLButtonElement>
}) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-expanded={open}
      onClick={onToggle}
      className={
        "rounded-kit-chip font-kit-strong text-kit-ink underline decoration-kit-link-line decoration-dotted decoration-from-font underline-offset-(--kit-link-offset) " +
        "transition-[text-decoration-color] duration-(--kit-duration-state) ease-kit-out hover:decoration-current motion-reduce:transition-none " +
        "outline-hidden focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-focus"
      }
    >
      {children}
    </button>
  )
}

/**
 * The editor a sentence opens, under the line it belongs to. `Arrive`, so it
 * folds open and shut (and is inert while shut); a hairline on its left ties
 * it to the sentence above.
 */
function Editor({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <Arrive show={show}>
      <div className="mt-kit-related max-w-sm border-l border-kit-hairline pl-kit-group">
        {children}
      </div>
    </Arrive>
  )
}

/**
 * "Saved", after the fact.
 *
 * `aria-live="polite"` because it appears without the focus moving — somebody
 * who pressed Save and tabbed on would otherwise never learn it landed. Fade
 * only; `motion-reduce` drops even that.
 */
function Saved({ show }: { show: boolean }) {
  return (
    <span
      aria-live="polite"
      className="text-kit-small text-kit-ink-muted transition-opacity duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none"
      style={{ opacity: show ? 1 : 0 }}
    >
      {show ? "Saved" : " "}
    </span>
  )
}

/**
 * The server said no to something that is not one field (states.md, "Refused
 * or failed"): one sentence in ink, announced without taking focus. Not red —
 * a refusal is not destruction.
 */
function Problem({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <Text role="status">
      {message}
    </Text>
  )
}

/**
 * A local copy of a server value, so a field keeps what was typed while the
 * action is in flight and follows the server again once the revalidated page
 * brings a new value back.
 *
 * The resync happens during render rather than in an effect. An effect would
 * paint the stale value first and correct it on the next frame; this way React
 * re-runs the component before touching the DOM, and the rule against
 * `setState` in an effect bodies is not something to suppress — it is pointing
 * at the better version of this.
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

/** A row in a drawer's list: what it is, a muted line under it, and its one control. */
function Row({
  title,
  detail,
  children,
}: {
  title: React.ReactNode
  detail: string
  children?: React.ReactNode
}) {
  return (
    <li className="flex min-h-11 items-center gap-kit-related py-kit-tight">
      <div className="flex min-w-0 flex-1 flex-col">
        <Text as="span" weight="strong">
          <span className="block truncate">{title}</span>
        </Text>
        <Text as="span" variant="small" tone="muted">
          <span className="block truncate">{detail}</span>
        </Text>
      </div>
      {children != null ? <div className="shrink-0">{children}</div> : null}
    </li>
  )
}

export function SettingsBriefing({
  name,
  email,
  timezone,
  sessionGroups,
  connectedAgents,
  supportEmail,
  nowIso,
}: {
  name: string
  email: string
  timezone: string
  sessionGroups: SessionGroup[]
  connectedAgents: ConnectedAgent[]
  /**
   * Passed in rather than imported. `MAIL_REPLY_TO` lives in lib/mail.ts beside
   * the Resend client, and importing it here would pull the mail SDK into the
   * browser bundle to render one `mailto:`.
   */
  supportEmail: string
  /**
   * The server's clock as an ISO string, so "it is 09:15 there now" renders the
   * same on both sides of hydration — and still recomputes when the zone in the
   * select changes, because it is derived from this fixed instant rather than
   * from `new Date()`.
   */
  nowIso: string
}) {
  const now = React.useMemo(() => new Date(nowIso), [nowIso])

  // One editor at a time. Two open drawers in a column of prose read as one
  // form with stray sentences in the middle of it — and two ink submits.
  const [open, setOpen] = React.useState<Drawer | null>(null)
  // Bumped on every opening of the password editor, so its three fields start
  // empty each time instead of keeping a typed password in a closed (inert)
  // editor.
  const [passwordKey, setPasswordKey] = React.useState(0)
  const toggle = (id: Drawer) => {
    setProblem(null)
    setCurrentPasswordProblem(null)
    if (id === "password" && open !== "password") setPasswordKey((k) => k + 1)
    setOpen((current) => (current === id ? null : id))
  }

  const [pending, startTransition] = React.useTransition()
  const [saved, setSaved] = React.useState<string | null>(null)
  const [problem, setProblem] = React.useState<string | null>(null)
  const savedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // Signing a browser out removes the button that was pressed, and focus
  // would fall to <body> — a keyboard user starts again from the top of the
  // page. So after a successful sign-out, once the refreshed list has landed,
  // focus goes to the sessions sentence: its Inline button while other
  // browsers remain, or the sentence itself once this is the only one.
  const sessionsInline = React.useRef<HTMLButtonElement | null>(null)
  const sessionsBlock = React.useRef<HTMLDivElement | null>(null)
  // A flag, not state: setting it must not re-render, and the effect below
  // reads it once the transition has settled.
  const refocusSessions = React.useRef(false)
  const setRefocusSessions = (next: boolean) => {
    refocusSessions.current = next
  }
  // A wrong current password, from the server, shown on that field.
  const [currentPasswordProblem, setCurrentPasswordProblem] = React.useState<
    string | null
  >(null)

  React.useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current)
    }
  }, [])

  function markSaved(key: string) {
    setSaved(key)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSaved(null), 2500)
  }

  const [nameDraft, setNameDraft] = useDraft(name)
  const [zoneDraft, setZoneDraft] = useDraft(timezone)

  // The registration form, and the one client id it produces. Held here rather
  // than re-read from the server because the id is shown once: the row keeps it,
  // but nothing on this page ever prints it again, so losing it to a re-render
  // would mean going to the database to recover a value the person was looking
  // at a second ago.
  const [agentName, setAgentName] = React.useState("")
  const [agentRedirect, setAgentRedirect] = React.useState("")
  const [issuedClientId, setIssuedClientId] = React.useState<string | null>(
    null
  )

  const others = sessionGroups.filter((group) => !group.current)

  // Runs once the transition has settled, so the refreshed list (and the
  // sentence it changes) is what is on screen when focus moves.
  React.useEffect(() => {
    if (!refocusSessions.current || pending) return
    refocusSessions.current = false
    ;(sessionsInline.current ?? sessionsBlock.current)?.focus()
  }, [pending, others.length])
  const zoneChoices = React.useMemo(
    () =>
      zoneOptions(timezone).map((zone) => ({
        value: zone,
        label: zoneLabel(zone, now),
      })),
    [timezone, now]
  )

  return (
    <>
      {/* What Quincy knows ------------------------------------------------ */}
      <Stage lead="What Quincy knows about you." rest="It writes with the name and schedules against the clock.">
        <Card>
          <div className="flex flex-col gap-kit-group">
            <div>
              <Text>
                Quincy opens with{" "}
                <Inline
                  label="Change your name"
                  open={open === "name"}
                  onToggle={() => toggle("name")}
                >
                  {name}
                </Inline>
                , here and in every mail it sends.{" "}
                <Saved show={saved === "name"} />
              </Text>

              <Editor show={open === "name"}>
                <form
                  className="flex flex-col gap-kit-group"
                  onSubmit={(event) => {
                    event.preventDefault()
                    setProblem(null)
                    // Nothing changed: closing is the whole save.
                    if (nameDraft.trim() === name) {
                      setOpen(null)
                      return
                    }
                    startTransition(async () => {
                      // A throw (network, 5xx) would reach the error boundary
                      // and take the form with it; say so beside the field.
                      const result = await saveName(nameDraft).catch(() => null)
                      if (!result) {
                        setProblem(COULD_NOT_REACH)
                        return
                      }
                      if (!result.ok) {
                        setProblem(result.message)
                        return
                      }
                      markSaved("name")
                      setOpen(null)
                    })
                  }}
                >
                  <Field
                    label="Name"
                    error={open === "name" ? (problem ?? undefined) : undefined}
                    validate={(value) =>
                      String(value ?? "").trim() ? null : "Quincy needs something to call you."
                    }
                  >
                    <Input
                      name="name"
                      autoComplete="name"
                      maxLength={80}
                      value={nameDraft}
                      onValueChange={(value) => {
                        setProblem(null)
                        setNameDraft(value)
                      }}
                    />
                  </Field>
                  <div>
                    <Button
                      type="submit"
                      variant="action"
                      pending={pending}
                      pendingLabel="Saving…"
                    >
                      Save
                    </Button>
                  </div>
                </form>
              </Editor>
            </div>

            <div>
              <Text>
                Your day is drawn in{" "}
                <Inline
                  label="Change your time zone"
                  open={open === "zone"}
                  onToggle={() => toggle("zone")}
                >
                  {timezone.replace(/_/g, " ")}
                </Inline>
                , where it is <Mono tone="ink">{timeIn(timezone, now)}</Mono> now.
                Every slot, every rhythm and every date in the product is that
                clock. <Saved show={saved === "zone"} />
              </Text>

              <Editor show={open === "zone"}>
                <form
                  className="flex flex-col gap-kit-group"
                  onSubmit={(event) => {
                    event.preventDefault()
                    setProblem(null)
                    if (zoneDraft === timezone) {
                      setOpen(null)
                      return
                    }
                    startTransition(async () => {
                      const result = await saveTimezone(zoneDraft).catch(() => null)
                      if (!result) {
                        setProblem(COULD_NOT_REACH)
                        return
                      }
                      if (!result.ok) {
                        setProblem(result.message)
                        return
                      }
                      markSaved("zone")
                      setOpen(null)
                    })
                  }}
                >
                  <Field
                    label="Time zone"
                    description={`It is ${timeIn(zoneDraft, now)} there.`}
                    error={open === "zone" ? (problem ?? undefined) : undefined}
                  >
                    <Select
                      name="timezone"
                      options={zoneChoices}
                      value={zoneDraft}
                      onValueChange={(value) => {
                        setProblem(null)
                        setZoneDraft(value ?? zoneDraft)
                      }}
                    />
                  </Field>
                  <div>
                    <Button
                      type="submit"
                      variant="action"
                      pending={pending}
                      pendingLabel="Saving…"
                    >
                      Save
                    </Button>
                  </div>
                </form>
              </Editor>
            </div>
          </div>
        </Card>
      </Stage>

      {/* Signing in ------------------------------------------------------- */}
      <Stage lead="How you sign in." rest="One address, one password, and the browsers that hold a key.">
        <Card>
          <div className="flex flex-col gap-kit-group">
            <div>
              <Text>
                You sign in at <span className="break-all">{email}</span>, which
                is verified, with{" "}
                <Inline
                  label="Change your password"
                  open={open === "password"}
                  onToggle={() => toggle("password")}
                >
                  a password
                </Inline>
                . <Muted>Moving the address is not built yet.{" "}
                <TextLink
                  href={`mailto:${supportEmail}?subject=Change%20my%20email%20address`}
                >
                  Write to us
                </TextLink>{" "}
                and we will move it.</Muted>{" "}
                <Saved show={saved === "password"} />
              </Text>

              <Editor show={open === "password"}>
                <PasswordForm
                  key={passwordKey}
                  email={email}
                  pending={pending}
                  problem={open === "password" ? problem : null}
                  currentProblem={
                    open === "password" ? currentPasswordProblem : null
                  }
                  onCurrentEdited={() => setCurrentPasswordProblem(null)}
                  onSubmit={(current, next) =>
                    startTransition(async () => {
                      setProblem(null)
                      setCurrentPasswordProblem(null)
                      const result = await changePassword(current, next).catch(() => null)
                      if (!result) {
                        setProblem(COULD_NOT_REACH)
                        return
                      }
                      if (!result.ok) {
                        if (result.field === "currentPassword") {
                          setCurrentPasswordProblem(result.message)
                        } else {
                          setProblem(result.message)
                        }
                        return
                      }
                      markSaved("password")
                      setOpen(null)
                    })
                  }
                />
              </Editor>
            </div>

            <div
              ref={sessionsBlock}
              tabIndex={-1}
              className="outline-hidden"
            >
              <Text>
                {others.length === 0 ? (
                  <>This browser is the only one signed in.</>
                ) : (
                  <>
                    You are signed in on{" "}
                    <Inline
                      ref={sessionsInline}
                      label="Show where you are signed in"
                      open={open === "sessions"}
                      onToggle={() => toggle("sessions")}
                    >
                      {sessionGroups.length} browsers
                    </Inline>
                    , including this one.{" "}
                    <Muted>Changing the password signs the others out.</Muted>
                  </>
                )}
              </Text>

              <Editor show={open === "sessions" && others.length > 0}>
                <div className="flex flex-col gap-kit-related">
                  <ul className="flex flex-col">
                    {sessionGroups.map((group) => (
                      <Row
                        key={group.ids[0]}
                        title={
                          <>
                            {group.browser}
                            {group.current ? <Muted> · this one</Muted> : null}
                          </>
                        }
                        // The count only earns its place when it is more than
                        // one. "1 session" beside a browser name is noise the
                        // reader has to read past to reach the date.
                        detail={
                          group.count > 1
                            ? `${group.count} sessions · ${group.lastSeen.toLowerCase()}`
                            : group.lastSeen
                        }
                      >
                        {group.current ? null : (
                          <Button
                           
                            disabled={pending}
                            aria-label={`Sign out ${group.browser}`}
                            onClick={() =>
                              startTransition(async () => {
                                setProblem(null)
                                const result = await revokeSessions(group.ids).catch(() => null)
                                if (!result) setProblem(COULD_NOT_REACH)
                                else if (!result.ok) setProblem(result.message)
                                else setRefocusSessions(true)
                              })
                            }
                          >
                            Sign out
                          </Button>
                        )}
                      </Row>
                    ))}
                  </ul>
                  <Problem message={open === "sessions" ? problem : null} />
                  <div>
                    <Button
                     
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          setProblem(null)
                          const result = await revokeOtherSessions().catch(() => null)
                          if (!result) setProblem(COULD_NOT_REACH)
                          else if (!result.ok) setProblem(result.message)
                          else setRefocusSessions(true)
                        })
                      }
                    >
                      Sign out everywhere else
                    </Button>
                  </div>
                </div>
              </Editor>
            </div>
          </div>
        </Card>
      </Stage>

      {/* Connected agents ------------------------------------------------- */}
      <Stage lead="Agents that can reach Quincy." rest="They read what you have and draft. None of them can approve, schedule or publish.">
        <Card>
          <Text>
            {connectedAgents.length === 0 ? (
              <>
                No agents connected.{" "}
                <Inline
                  label="Register an agent"
                  open={open === "register-agent"}
                  onToggle={() => toggle("register-agent")}
                >
                  Register one
                </Inline>{" "}
                if it cannot introduce itself, then point it at{" "}
                <Mono tone="ink">/api/mcp</Mono>.
              </>
            ) : (
              <>
                <Inline
                  label="Show the agents that can reach Quincy"
                  open={open === "agents"}
                  onToggle={() => toggle("agents")}
                >
                  {connectedAgents.length === 1
                    ? "One agent"
                    : `${connectedAgents.length} agents`}
                </Inline>{" "}
                can reach Quincy over MCP.{" "}
                <Inline
                  label="Register an agent"
                  open={open === "register-agent"}
                  onToggle={() => toggle("register-agent")}
                >
                  Register another
                </Inline>
                .
              </>
            )}
          </Text>

          <Editor show={open === "register-agent"}>
            <form
              className="flex flex-col gap-kit-group"
              onSubmit={(event) => {
                event.preventDefault()
                setProblem(null)
                setIssuedClientId(null)
                startTransition(async () => {
                  const result = await registerAgent({
                    name: agentName,
                    redirectUri: agentRedirect,
                  }).catch(() => null)
                  if (!result) {
                    setProblem(COULD_NOT_REACH)
                    return
                  }
                  if (!result.ok) {
                    setProblem(result.message)
                    return
                  }
                  setIssuedClientId(result.clientId)
                  setAgentName("")
                  setAgentRedirect("")
                })
              }}
            >
              <Field
                label="Name"
                description="What you will see on this list, and on the screen that asks you to allow it."
              >
                <Input
                  name="agent-name"
                  autoComplete="off"
                  maxLength={MCP_CLIENT_NAME_MAX}
                  placeholder="My terminal agent"
                  value={agentName}
                  onValueChange={setAgentName}
                />
              </Field>
              <Field
                label="Redirect URI"
                description="Whatever the agent printed. https://, or http:// on localhost, any 127.x.x.x address or [::1]."
              >
                <Input
                  type="url"
                  name="agent-redirect"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="http://127.0.0.1:33418/callback"
                  value={agentRedirect}
                  onValueChange={setAgentRedirect}
                />
              </Field>
              <Problem message={open === "register-agent" ? problem : null} />
              {issuedClientId ? (
                <div className="flex flex-col gap-kit-tight" role="status">
                  <Text variant="small" tone="muted">
                    Client id. Paste it into the agent; it is shown once.
                  </Text>
                  <span className="break-all select-all">
                    <Mono tone="ink">{issuedClientId}</Mono>
                  </span>
                </div>
              ) : null}
              <div>
                <Button
                  type="submit"
                  variant="action"
                  pending={pending}
                  pendingLabel="Registering…"
                >
                  Register
                </Button>
              </div>
            </form>
          </Editor>

          <Editor show={open === "agents" && connectedAgents.length > 0}>
            <div className="flex flex-col gap-kit-related">
              <ul className="flex flex-col">
                {connectedAgents.map((agent) => (
                  <Row
                    key={agent.clientId}
                    title={agent.name}
                    detail={`${agent.connected} · ${agent.lastToken}`}
                  >
                    {/* A hold rather than a dialog, per AGENTS.md: this ends a
                        connection and cannot be undone from here — the agent
                        has to ask again and be consented to again. */}
                    <HoldButton
                      onConfirm={async () => {
                        setProblem(null)
                        const result = await removeConnectedAgent(agent.clientId)
                        if (!result.ok) {
                          setProblem(result.message)
                          throw new Error(result.message)
                        }
                      }}
                      pendingLabel="Removing…"
                      doneLabel="Removed"
                    >
                      Remove
                    </HoldButton>
                  </Row>
                ))}
              </ul>
              <Problem message={open === "agents" ? problem : null} />
              <Text variant="small" tone="muted">
                Removing one takes back your consent and revokes the refresh key
                that would otherwise mint a new one for a month. A key it already
                holds keeps working for up to an hour: it is signed rather than
                stored, so there is nothing to withdraw.
              </Text>
            </div>
          </Editor>
        </Card>
      </Stage>

      {/* Leaving ---------------------------------------------------------- */}
      <Stage lead="If you want out.">
        {/* No button here, and that is deliberate. Deleting an account has to
            cascade the app tables and cancel the subscription in the same
            breath, and none of that is built — a control that looked like it
            worked would be worse than this sentence. plans/024, follow-up 1. */}
        <Card>
          <Text>
            Quincy cannot delete an account on its own yet.{" "}
            <TextLink href={`mailto:${supportEmail}?subject=Delete%20my%20account`}>
              Write to us
            </TextLink>{" "}
            and it is done by hand, usually the same day.{" "}
            <Muted>
              The brain, every conversation, idea and draft, the channel
              connections and their tokens, and anything waiting in the
              schedule. An active subscription is cancelled at the same time.
              Nothing is kept afterwards.
            </Muted>
          </Text>
        </Card>
      </Stage>
    </>
  )
}

/**
 * The password form, kept separate so its three fields own their own state.
 *
 * Validate on blur, then on change once an error has shown — reward early,
 * punish late. The kit Field does that timing for one field on its own; these
 * checks compare fields with each other (new against current, confirm against
 * new) and must also show on submit, so `touched` drives the Field's `error`
 * instead: a field is judged only after it has been left, and from then on
 * every keystroke re-judges it, so the error clears the moment it is fixed.
 */
function PasswordForm({
  email,
  pending,
  problem,
  currentProblem,
  onCurrentEdited,
  onSubmit,
}: {
  /** For password managers: they file the new password under this account. */
  email: string
  pending: boolean
  problem: string | null
  /** The server's refusal of the current password, shown on that field. */
  currentProblem: string | null
  /** Typing in the field clears that refusal: it was about the old value. */
  onCurrentEdited: () => void
  onSubmit: (current: string, next: string) => void
}) {
  const [current, setCurrent] = React.useState("")
  const [next, setNext] = React.useState("")
  const [confirm, setConfirm] = React.useState("")
  const [touched, setTouched] = React.useState<Record<string, boolean>>({})

  const missingCurrent = touched.current && current.length === 0
  const tooShort = touched.next && next.length < 8
  const sameAsOld = touched.next && next.length > 0 && next === current
  const mismatch = touched.confirm && confirm !== next
  const ready =
    current.length > 0 &&
    next.length >= 8 &&
    next !== current &&
    confirm === next

  return (
    <form
      className="flex flex-col gap-kit-group"
      onSubmit={(event) => {
        event.preventDefault()
        setTouched({ current: true, next: true, confirm: true })
        if (!ready) return
        onSubmit(current, next)
      }}
    >
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <Field
        label="Current password"
        error={
          missingCurrent
            ? "Type the password you sign in with now."
            : (currentProblem ?? undefined)
        }
      >
        <Input
          type="password"
          autoComplete="current-password"
          value={current}
          onBlur={() => setTouched((t) => ({ ...t, current: true }))}
          onValueChange={(value) => {
            setCurrent(value)
            if (currentProblem) onCurrentEdited()
          }}
        />
      </Field>

      <Field
        label="New password"
        description={tooShort || sameAsOld ? undefined : "At least 8 characters."}
        error={
          tooShort
            ? "Use at least 8 characters."
            : sameAsOld
              ? "That is the password you already have."
              : undefined
        }
      >
        <Input
          type="password"
          autoComplete="new-password"
          value={next}
          onBlur={() => setTouched((t) => ({ ...t, next: true }))}
          onValueChange={setNext}
        />
      </Field>

      <Field
        label="Type it again"
        error={mismatch ? "The two do not match yet." : undefined}
      >
        <Input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
          onValueChange={setConfirm}
        />
      </Field>

      <Problem message={problem} />

      <div>
        <Button
          type="submit"
          variant="action"
          pending={pending}
          pendingLabel="Changing…"
        >
          Change password
        </Button>
      </div>
    </form>
  )
}
