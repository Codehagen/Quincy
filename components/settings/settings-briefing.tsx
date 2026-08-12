"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { timeIn, zoneLabel, zoneOptions } from "@/lib/zones"
import {
  changePassword,
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
 * The value, inside the sentence, as the thing you press.
 *
 * A real `<button>` rather than a span with a handler, so it is tabbable and
 * announced. The dotted underline is the affordance — a solid one would read as
 * a link to somewhere else, which is exactly what this is not.
 */
function Inline({
  label,
  open,
  onToggle,
  children,
}: {
  label: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={open}
      onClick={onToggle}
      className="rounded-xs underline decoration-muted-foreground/50 decoration-dotted underline-offset-4 transition-[text-decoration-color] duration-150 ease-out hover:decoration-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none"
    >
      {children}
    </button>
  )
}

/** The editor a sentence opens, indented under the line it belongs to. */
function Drawer({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 mb-2 max-w-sm animate-in border-l border-foreground/10 pl-5 duration-200 ease-out fade-in slide-in-from-top-1 motion-reduce:animate-none">
      {children}
    </div>
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
      className="text-caption text-muted-foreground transition-opacity duration-200 ease-out motion-reduce:transition-none"
      style={{ opacity: show ? 1 : 0 }}
    >
      {show ? "Saved" : " "}
    </span>
  )
}

function Problem({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="text-caption text-pretty text-destructive">
      {message}
    </p>
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

export function SettingsBriefing({
  name,
  email,
  timezone,
  sessionGroups,
  supportEmail,
  nowIso,
}: {
  name: string
  email: string
  timezone: string
  sessionGroups: SessionGroup[]
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
  // form with stray sentences in the middle of it.
  const [open, setOpen] = React.useState<string | null>(null)
  const toggle = (id: string) =>
    setOpen((current) => (current === id ? null : id))

  const [pending, startTransition] = React.useTransition()
  const [saved, setSaved] = React.useState<string | null>(null)
  const [problem, setProblem] = React.useState<string | null>(null)
  const savedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const others = sessionGroups.filter((group) => !group.current)

  return (
    <div className="flex flex-col gap-6 px-1">
      {/* Name ------------------------------------------------------------ */}
      <div>
        <p className="max-w-prose text-body text-pretty">
          Quincy opens with{" "}
          <Inline
            label="Change your name"
            open={open === "name"}
            onToggle={() => {
              setProblem(null)
              toggle("name")
            }}
          >
            {name}
          </Inline>
          , here and in every mail it sends. <Saved show={saved === "name"} />
        </p>

        {open === "name" ? (
          <Drawer>
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault()
                setProblem(null)
                startTransition(async () => {
                  const result = await saveName(nameDraft)
                  if (!result.ok) {
                    setProblem(result.message)
                    return
                  }
                  markSaved("name")
                  setOpen(null)
                })
              }}
            >
              <Field>
                <FieldLabel htmlFor="settings-name">Name</FieldLabel>
                <Input
                  id="settings-name"
                  name="name"
                  autoComplete="name"
                  maxLength={80}
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                />
              </Field>
              <Problem message={problem} />
              <div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={pending || nameDraft.trim() === name}
                >
                  {pending ? "Saving…" : "Save"}
                </Button>
              </div>
            </form>
          </Drawer>
        ) : null}
      </div>

      {/* Time zone ------------------------------------------------------- */}
      <div>
        <p className="max-w-prose text-body text-pretty">
          Your day is drawn in{" "}
          <Inline
            label="Change your time zone"
            open={open === "zone"}
            onToggle={() => {
              setProblem(null)
              toggle("zone")
            }}
          >
            {timezone.replace(/_/g, " ")}
          </Inline>
          , where it is {timeIn(timezone, now)} now. Every slot, every rhythm
          and every date in the product is that clock.{" "}
          <Saved show={saved === "zone"} />
        </p>

        {open === "zone" ? (
          <Drawer>
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault()
                setProblem(null)
                startTransition(async () => {
                  const result = await saveTimezone(zoneDraft, timezone)
                  if (!result.ok) {
                    setProblem(result.message)
                    return
                  }
                  markSaved("zone")
                  setOpen(null)
                })
              }}
            >
              <Field>
                <FieldLabel htmlFor="settings-zone">Time zone</FieldLabel>
                <Select
                  value={zoneDraft}
                  onValueChange={(value) => setZoneDraft(value ?? zoneDraft)}
                >
                  <SelectTrigger id="settings-zone" className="w-full">
                    <SelectValue>
                      {(value: string) => zoneLabel(value, now)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {zoneOptions(timezone).map((zone) => (
                      <SelectItem key={zone} value={zone}>
                        {zoneLabel(zone, now)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  It is {timeIn(zoneDraft, now)} there.
                </FieldDescription>
              </Field>
              <Problem message={problem} />
              <div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={pending || zoneDraft === timezone}
                >
                  {pending ? "Saving…" : "Save"}
                </Button>
              </div>
            </form>
          </Drawer>
        ) : null}
      </div>

      {/* Signing in ------------------------------------------------------ */}
      <div>
        <p className="max-w-prose text-body text-pretty">
          You sign in at <span className="break-all">{email}</span>, which is
          verified, with{" "}
          <Inline
            label="Change your password"
            open={open === "password"}
            onToggle={() => {
              setProblem(null)
              toggle("password")
            }}
          >
            a password
          </Inline>
          . Moving the address is not built yet —{" "}
          <a
            href={`mailto:${supportEmail}?subject=Change%20my%20email%20address`}
            className="underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-current"
          >
            write to us
          </a>{" "}
          and we will move it. <Saved show={saved === "password"} />
        </p>

        {open === "password" ? (
          <Drawer>
            <PasswordForm
              pending={pending}
              onSubmit={(current, next) =>
                startTransition(async () => {
                  setProblem(null)
                  const result = await changePassword(current, next)
                  if (!result.ok) {
                    setProblem(result.message)
                    return
                  }
                  markSaved("password")
                  setOpen(null)
                })
              }
              problem={problem}
            />
          </Drawer>
        ) : null}
      </div>

      {/* Sessions -------------------------------------------------------- */}
      <div>
        <p className="max-w-prose text-body text-pretty">
          {others.length === 0 ? (
            <>This browser is the only one signed in.</>
          ) : (
            <>
              You are signed in on{" "}
              <Inline
                label="Show where you are signed in"
                open={open === "sessions"}
                onToggle={() => {
                  setProblem(null)
                  toggle("sessions")
                }}
              >
                {sessionGroups.length} browsers
              </Inline>
              , including this one. Changing the password signs the others out.
            </>
          )}
        </p>

        {open === "sessions" && others.length > 0 ? (
          <Drawer>
            <div className="flex flex-col gap-3">
              <ul className="flex flex-col">
                {sessionGroups.map((group) => (
                  <li
                    key={group.ids[0]}
                    className="flex items-center gap-3 border-b border-foreground/8 py-2.5 last:border-b-0"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-body">
                        {group.browser}
                        {group.current ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · this one
                          </span>
                        ) : null}
                      </span>
                      <span className="truncate text-caption text-muted-foreground">
                        {/* The count only earns its place when it is more than
                            one. "1 session" beside a browser name is noise the
                            reader has to read past to reach the date. */}
                        {group.count > 1
                          ? `${group.count} sessions · ${group.lastSeen.toLowerCase()}`
                          : group.lastSeen}
                      </span>
                    </div>
                    {group.current ? null : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            setProblem(null)
                            const result = await revokeSessions(group.ids)
                            if (!result.ok) setProblem(result.message)
                          })
                        }
                      >
                        Sign out
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              <Problem message={problem} />
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      setProblem(null)
                      const result = await revokeOtherSessions()
                      if (!result.ok) setProblem(result.message)
                    })
                  }
                >
                  Sign out everywhere else
                </Button>
              </div>
            </div>
          </Drawer>
        ) : null}
      </div>

      {/* Leaving --------------------------------------------------------- */}
      <div className="flex flex-col gap-3 pt-6">
        <div className="h-px bg-foreground/8" role="presentation" />
        <h2 className="pt-4 text-eyebrow text-muted-foreground">
          If you want out
        </h2>
        {/* No button here, and that is deliberate. Deleting an account has to
            cascade the app tables and cancel the subscription in the same
            breath, and none of that is built — a control that looked like it
            worked would be worse than this sentence. plans/024, follow-up 1. */}
        <p className="max-w-prose text-body text-pretty">
          Quincy cannot delete an account on its own yet.{" "}
          <a
            href={`mailto:${supportEmail}?subject=Delete%20my%20account`}
            className="underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-current"
          >
            Write to us
          </a>{" "}
          and it is done by hand, usually the same day: the brain, every
          conversation, riff and draft, the channel connections and their
          tokens, and anything waiting in the schedule. An active subscription
          is cancelled at the same time. Nothing is kept afterwards.
        </p>
      </div>
    </div>
  )
}

/**
 * The password form, kept separate so its three fields own their own state.
 *
 * Validate on blur, then on change once an error has shown — reward early,
 * punish late. `touched` is what encodes that: a field is judged only after it
 * has been left, and from then on every keystroke re-judges it, so the error
 * clears the moment it is fixed.
 */
function PasswordForm({
  pending,
  problem,
  onSubmit,
}: {
  pending: boolean
  problem: string | null
  onSubmit: (current: string, next: string) => void
}) {
  const [current, setCurrent] = React.useState("")
  const [next, setNext] = React.useState("")
  const [confirm, setConfirm] = React.useState("")
  const [touched, setTouched] = React.useState<Record<string, boolean>>({})

  const tooShort = touched.next && next.length > 0 && next.length < 8
  const sameAsOld = touched.next && next.length > 0 && next === current
  const mismatch = touched.confirm && confirm.length > 0 && confirm !== next
  const ready =
    current.length > 0 &&
    next.length >= 8 &&
    next !== current &&
    confirm === next

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        setTouched({ current: true, next: true, confirm: true })
        if (!ready) return
        onSubmit(current, next)
      }}
    >
      <Field>
        <FieldLabel htmlFor="settings-current">Current password</FieldLabel>
        <Input
          id="settings-current"
          type="password"
          autoComplete="current-password"
          value={current}
          onBlur={() => setTouched((t) => ({ ...t, current: true }))}
          onChange={(event) => setCurrent(event.target.value)}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="settings-next">New password</FieldLabel>
        <Input
          id="settings-next"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(tooShort || sameAsOld)}
          value={next}
          onBlur={() => setTouched((t) => ({ ...t, next: true }))}
          onChange={(event) => setNext(event.target.value)}
        />
        {tooShort ? (
          <FieldDescription className="text-destructive">
            Use at least 8 characters.
          </FieldDescription>
        ) : sameAsOld ? (
          <FieldDescription className="text-destructive">
            That is the password you already have.
          </FieldDescription>
        ) : (
          <FieldDescription>At least 8 characters.</FieldDescription>
        )}
      </Field>

      <Field>
        <FieldLabel htmlFor="settings-confirm">Type it again</FieldLabel>
        <Input
          id="settings-confirm"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(mismatch)}
          value={confirm}
          onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
          onChange={(event) => setConfirm(event.target.value)}
        />
        {mismatch ? (
          <FieldDescription className="text-destructive">
            The two do not match yet.
          </FieldDescription>
        ) : null}
      </Field>

      <Problem message={problem} />

      <div>
        <Button type="submit" size="sm" disabled={!ready || pending}>
          {pending ? "Changing…" : "Change password"}
        </Button>
      </div>
    </form>
  )
}
