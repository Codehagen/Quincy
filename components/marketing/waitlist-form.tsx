"use client"

import * as React from "react"

import { Field, Input } from "@/components/kit"
import { validateEmail } from "@/lib/auth-validation"

import { MarketingButton } from "./button"
import { NAV_LINK } from "./nav-link"

/**
 * The one thing a stranger can do while Quincy is closed (plans/023).
 *
 * The request is the one the live form always sent: POST `/api/waitlist`
 * with `{ email, source }`. `source` tells the forms apart in
 * `waitlist.source`, so a page keeps the value its rows were counted under.
 *
 * Remembering a join is localStorage, never a server lookup: the endpoint
 * answers a new and a returning address the same on purpose, and a
 * "have I joined?" call would be the enumeration oracle it refuses to be.
 * The key is the old form's, so a browser that joined before is greeted as
 * already on the list. When one copy clears it, a custom event tells any
 * other copy on the page (the DOM's `storage` event skips the writer).
 *
 * Validation: on blur, then on every change once it has failed. The
 * confirmation replaces the form (`role="status"`, since the focused control
 * was just removed); no entrance animation, it is page-load state.
 *
 * No flash on refresh, and no script: localStorage cannot be read before
 * hydration, so the slot is `invisible` until the layout effect has read it
 * (still before the first client paint), then shows the right state. The
 * box never changes height: an invisible, inert copy of the confirmation
 * shares its grid cell, so the slot is always the taller state's size.
 * No JS means no visible form, which costs nothing: it posts with fetch.
 */
const STORAGE_KEY = "quincy.waitlist"
const CLEARED_EVENT = "quincy:waitlist-cleared"

type Outcome = "idle" | "sending" | "joined"

function readStored(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as { email?: unknown }) : null
    return typeof parsed?.email === "string" ? parsed.email : null
  } catch {
    // Private mode throws, a corrupt value throws on parse. Neither is worth a broken form.
    return null
  }
}

function writeStored(email: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ email, ts: Date.now() }))
  } catch {
    // As above: the state still lives in memory for this visit.
  }
}

function clearStored() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // As above.
  }
}

export type WaitlistFormProps = {
  /** The slot's id; the error line's id derives from it. */
  id: string
  /** Which form on which page, stored in `waitlist.source` (at most 32 characters). */
  source: string
  /** The field's visible label. Default "Your email". */
  label?: string
}

/** The confirmation's words. Rendered live, and once more invisible to hold the slot's height. */
function Joined({ email, restored, onReset }: { email: string; restored: boolean; onReset?: () => void }) {
  return (
    <>
      <p className="text-kit-figure text-kit-ink">{restored ? "You are already on the list" : "You are on the list"}</p>
      <p className="text-kit-display-body text-pretty text-kit-ink-muted">
        The invite goes to <span className="font-kit-strong text-kit-ink">{email}</span>. Quincy opens in small
        groups, in the order people asked, and you will hear from a person either way.
      </p>
      {/* For the wrong address, or the work one instead of the personal one.
          Prefilled, because the likeliest reason is a typo. */}
      <button
        type="button"
        onClick={onReset}
        className={`${NAV_LINK} text-kit-small underline decoration-kit-link-line underline-offset-(--kit-link-offset)`}
      >
        Use a different address
      </button>
    </>
  )
}

export function WaitlistForm({ id, source, label = "Your email" }: WaitlistFormProps) {
  const [value, setValue] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [punished, setPunished] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [outcome, setOutcome] = React.useState<Outcome>("idle")
  const [joined, setJoined] = React.useState("")
  // True only when the confirmation came from storage, not from this visit.
  const [restored, setRestored] = React.useState(false)

  // False in the server HTML: the slot is held, invisible, until storage is read.
  const [known, setKnown] = React.useState(false)

  // A layout effect: it runs after hydration (or a client navigation's
  // commit) and before the browser paints, so the first visible frame is
  // already the right state.
  React.useLayoutEffect(() => {
    const stored = readStored()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage cannot be read any earlier than mount
    setKnown(true)
    if (!stored) return
    setJoined(stored)
    setRestored(true)
    setOutcome("joined")
  }, [])

  // Another copy cleared the address. Only a restored confirmation follows
  // it: one earned this visit stays, because that person did just join.
  React.useEffect(() => {
    function onCleared() {
      setRestored((was) => {
        if (was) {
          setOutcome("idle")
          setJoined("")
        }
        return false
      })
    }
    window.addEventListener(CLEARED_EVENT, onCleared)
    return () => window.removeEventListener(CLEARED_EVENT, onCleared)
  }, [])

  function check(next: string) {
    const e = validateEmail(next)
    setError(e)
    if (e) setPunished(true)
    return !e
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (outcome === "sending" || !check(value)) return

    setFormError(null)
    setOutcome("sending")
    const attempted = value.trim()

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: attempted, source }),
      })
      if (response.status === 429) {
        setFormError("That is a few tries from here already. Give it an hour and it will go through.")
        setOutcome("idle")
        return
      }
      if (!response.ok) {
        setFormError("That address was refused. Check it and try again.")
        setOutcome("idle")
        return
      }
      writeStored(attempted)
      setJoined(attempted)
      setOutcome("joined")
    } catch {
      // A real network failure, or a redirect into HTML (a missing
      // /api/waitlist entry in proxy.ts PUBLIC). Both are "try again".
      setFormError("Could not reach the server. Check your connection.")
      setOutcome("idle")
    }
  }

  const sending = outcome === "sending"
  const alertId = `${id}-alert`
  const cell = "col-start-1 row-start-1"

  return (
    <div id={id} className={`grid w-full max-w-md ${known ? "" : "invisible"}`}>
      {/* Holds the slot at the confirmation's height (the taller state), so
          joining, or restoring a join, moves nothing below. */}
      <div aria-hidden inert className={`${cell} invisible flex flex-col items-center gap-kit-related text-center select-none`}>
        <Joined email={joined || "you@company.com"} restored />
      </div>

      {outcome === "joined" ? (
        <div role="status" className={`${cell} flex flex-col items-center gap-kit-related self-start text-center`}>
          <Joined
            email={joined}
            restored={restored}
            onReset={() => {
              clearStored()
              window.dispatchEvent(new Event(CLEARED_EVENT))
              setValue(joined)
              setJoined("")
              setRestored(false)
              setOutcome("idle")
            }}
          />
        </div>
      ) : (
        <form
          onSubmit={onSubmit}
          noValidate
          className={`${cell} flex flex-col gap-kit-related self-start text-left`}
        >
          <div className="flex flex-col gap-kit-controls sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <Field label={label} error={error ?? undefined}>
                <Input
                  type="email"
                  name="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder="you@company.com"
                  value={value}
                  disabled={sending}
                  aria-describedby={formError ? alertId : undefined}
                  onValueChange={(next: string) => {
                    setValue(next)
                    if (formError) setFormError(null)
                    if (punished) check(next)
                  }}
                  onBlur={() => {
                    if (value.trim()) check(value)
                  }}
                />
              </Field>
            </div>
            {/* Down by the label's height from 40rem, so the button lines up with the field. */}
            <div className="flex flex-col sm:pt-6.5">
              <MarketingButton type="submit" pending={sending} pendingLabel="Joining…">
                Join the waitlist
              </MarketingButton>
            </div>
          </div>
          {formError ? (
            <p id={alertId} role="alert" className="text-kit-small text-kit-danger">
              {formError}
            </p>
          ) : null}
        </form>
      )}
    </div>
  )
}
