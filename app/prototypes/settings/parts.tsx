"use client"

import * as React from "react"

import { ZONES } from "./data"

/**
 * Shared machinery for the three settings directions.
 *
 * Only the parts that must be identical live here: the save lifecycle, the
 * password rules, and the zone label. If validation differed between variants
 * the picker would be comparing two arguments at once, and the layout question
 * would be decided by whichever variant happened to be kinder about a typo.
 */

export type SaveState = "idle" | "saving" | "saved"

/**
 * A field that knows whether it has been changed, and says so after it saves.
 *
 * 700ms of latency, because instant is a lie: a Save that resolves in the same
 * frame never shows its pending state, so the pending state never gets judged.
 * The "Saved" note clears itself after 2s — long enough to read at a glance,
 * short enough that it is gone before the next edit starts.
 */
export function useSavedField<T>(initial: T) {
  const [value, setValue] = React.useState<T>(initial)
  const [committed, setCommitted] = React.useState<T>(initial)
  const [state, setState] = React.useState<SaveState>("idle")
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const dirty = value !== committed

  async function save() {
    if (!dirty) return
    setState("saving")
    await new Promise((resolve) => setTimeout(resolve, 700))
    setCommitted(value)
    setState("saved")
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState("idle"), 2000)
  }

  function reset() {
    setValue(committed)
    setState("idle")
  }

  return { value, setValue, committed, dirty, state, save, reset }
}

/**
 * The one thing every direction says the same way.
 *
 * `aria-live="polite"` because it appears without the focus moving — a
 * keyboard user who pressed Save and tabbed on would otherwise never learn it
 * landed. Fade only, no movement, and `motion-reduce` drops even that.
 */
export function SavedNote({ state }: { state: SaveState }) {
  return (
    <span
      aria-live="polite"
      className="text-caption text-muted-foreground tabular-nums transition-opacity duration-200 ease-out motion-reduce:transition-none"
      style={{ opacity: state === "saved" ? 1 : 0 }}
    >
      {state === "saved" ? "Saved" : " "}
    </span>
  )
}

/**
 * Zone options with the account's own zone guaranteed present.
 *
 * A select whose value is not among its options renders as empty, and the
 * person reads that as "Quincy does not know where I am" rather than as a
 * missing row in our list.
 */
export function zoneOptions(current: string) {
  return ZONES.includes(current) ? ZONES : [current, ...ZONES]
}

/**
 * "Europe/Oslo · GMT+2" — the offset is what makes the identifier legible to
 * somebody who does not think in IANA names. Derived, never stored: an offset
 * is a fact about one moment and the clocks move twice a year.
 */
export function zoneLabel(zone: string, at: Date) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      timeZoneName: "shortOffset",
    }).formatToParts(at)
    const offset = parts.find((p) => p.type === "timeZoneName")?.value
    return offset ? `${zone.replace(/_/g, " ")} · ${offset}` : zone
  } catch {
    return zone
  }
}

/** The local time in a zone, for the sentence that says why the zone matters. */
export function timeIn(zone: string, at: Date) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(at)
  } catch {
    return "—"
  }
}

export type PasswordFields = {
  current: string
  next: string
  confirm: string
}

/**
 * Validation, once, for all three directions.
 *
 * Returns the field at fault and a sentence that says how to fix it, never
 * "invalid password". Eight characters is better-auth's own floor
 * (`minPasswordLength`), so this cannot disagree with the server.
 */
export function passwordProblem(
  fields: PasswordFields,
  touched: Partial<Record<keyof PasswordFields, boolean>>
): Partial<Record<keyof PasswordFields, string>> {
  const problems: Partial<Record<keyof PasswordFields, string>> = {}

  if (touched.current && !fields.current) {
    problems.current = "Type the password you sign in with today."
  }

  if (touched.next && fields.next.length > 0 && fields.next.length < 8) {
    problems.next = "Use at least 8 characters."
  }

  if (touched.next && fields.next && fields.next === fields.current) {
    problems.next = "That is the password you already have."
  }

  if (touched.confirm && fields.confirm && fields.confirm !== fields.next) {
    problems.confirm = "The two do not match yet."
  }

  return problems
}

export function passwordReady(fields: PasswordFields) {
  return (
    fields.current.length > 0 &&
    fields.next.length >= 8 &&
    fields.next !== fields.current &&
    fields.confirm === fields.next
  )
}

/**
 * The password form's own lifecycle, shared so the three layouts differ in
 * arrangement and nothing else.
 *
 * Validate on blur, then on change once an error has shown — reward early,
 * punish late. `touched` is what encodes that: a field is only judged after it
 * has been left, and from then on every keystroke re-judges it so the error
 * clears the moment it is fixed.
 */
export function usePasswordForm() {
  const [fields, setFields] = React.useState<PasswordFields>({
    current: "",
    next: "",
    confirm: "",
  })
  const [touched, setTouched] = React.useState<
    Partial<Record<keyof PasswordFields, boolean>>
  >({})
  const [state, setState] = React.useState<SaveState>("idle")
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const problems = passwordProblem(fields, touched)
  const ready = passwordReady(fields)

  function set(key: keyof PasswordFields, value: string) {
    setFields((f) => ({ ...f, [key]: value }))
  }

  function blur(key: keyof PasswordFields) {
    setTouched((t) => ({ ...t, [key]: true }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setTouched({ current: true, next: true, confirm: true })
    if (!passwordReady(fields)) return

    setState("saving")
    await new Promise((resolve) => setTimeout(resolve, 900))
    setFields({ current: "", next: "", confirm: "" })
    setTouched({})
    setState("saved")
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState("idle"), 2500)
  }

  return { fields, problems, ready, state, set, blur, submit }
}

/**
 * Sessions, minus the ones signed out during this run.
 *
 * The current session is never removable: a "sign out everywhere" that logs you
 * out of the tab you are reading it in is a control nobody presses twice.
 */
export function useSessions(initial: { id: string; current: boolean }[]) {
  const [revoked, setRevoked] = React.useState<string[]>([])

  const others = initial.filter((s) => !s.current && !revoked.includes(s.id))

  return {
    revoked,
    others,
    isRevoked: (id: string) => revoked.includes(id),
    revoke: (id: string) => setRevoked((r) => [...r, id]),
    revokeOthers: () =>
      setRevoked(initial.filter((s) => !s.current).map((s) => s.id)),
  }
}
