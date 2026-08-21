"use client"

import * as React from "react"
import confetti from "canvas-confetti"

import { validateEmail } from "@/lib/auth-validation"
import { useValidatedField } from "@/hooks/use-validated-field"
import { Button } from "@/components/ui/button"
import { Field, FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

/**
 * The one thing a stranger can do while Quincy is closed. See plans/023.
 *
 * Chosen from three directions at `/prototypes/waitlist`, since deleted — plus
 * a fourth picker entry that was the same page with the confetti off, built to
 * settle that one question by feel. The decision and what lost are in
 * plans/023.
 *
 * `useValidatedField` rather than local state, so the timing is the product's:
 * nothing is flagged while somebody types their first attempt, blur validates a
 * field they touched, submit validates everything, and once an error has shown
 * it clears on the next keystroke.
 *
 * **The label is the sentence.** A hero with "Email" set above a wide field
 * reads as a form, and a placeholder alone is not a label — it disappears at
 * the moment it is needed. Making the instruction the `<label>` satisfies both:
 * one visible line of copy, wired to the input, and clicking it focuses.
 */

/**
 * Ramp steps rasterised to sRGB. `canvas-confetti` parses colours with its own
 * hex reader and cannot take `oklch()`, so the tokens cannot be handed to it —
 * these are `--color-brass-300/400/500` and `--color-sand-600` measured, not
 * picked by eye. Re-measure them if the ramp moves.
 *
 * **The brass here is the one deliberate exception to the brass rule.**
 * AGENTS.md says brass means live and appears as a dot, a label, a chart mark
 * or a text selection, and is never a surface you press. A burst is none of
 * those either, and it is the largest brass object the site draws. It was
 * argued and kept: it fires once per person ever, it is not a surface at all,
 * and sand-600 in the mix stops it reading as a brand splash. If brass ever
 * has to mean only live, this is the first thing to delete.
 */
const BURST_COLORS = ["#e6aa61", "#cf8f3d", "#b1792d", "#746f6a"]

type Outcome = "idle" | "sending" | "joined"

/**
 * Remembering that this browser already joined. See plans/023.
 *
 * **localStorage rather than asking the server, and that is not laziness.**
 * `/api/waitlist` answers a new address and a returning one identically, on
 * purpose — an endpoint that can tell you whether an address is known is an
 * enumeration oracle, and `lib/waitlist.ts` argues that at length. A "have I
 * joined?" lookup would be exactly that oracle wearing a friendlier name. The
 * browser's own memory is the one place this question can be answered without
 * building one.
 *
 * So the guarantee is deliberately weak: it is a courtesy to somebody who came
 * back, not a lock. A different browser, a cleared store or a private window
 * shows the form again, and joining twice was always harmless — the UNIQUE
 * constraint on email makes the second one a no-op.
 *
 * Modelled on the same pattern in MiniskatteN (`apps/web/hooks/use-waitlist.ts`),
 * with one deliberate difference. That one reserves a fixed 248px because its
 * form and its receipt are wildly different sizes, so restoring after mount
 * would otherwise throw the page down. Measured here, ours are not: the top
 * form is 92px against a 95px confirmation, and the bottom one 71px against
 * the same 95px — a 3px settle where it matters and a 24px one at the foot of
 * the page, where the only thing below is the footer.
 *
 * A reserved height would cost every visitor who has not joined a permanent
 * band of dead space, to stop a footer moving for the ones who have. It is not
 * worth it at these numbers. It becomes worth it the moment either state grows
 * — a second field, a share card, a queue position — so re-measure before
 * assuming this still holds.
 */
const STORAGE_KEY = "quincy.waitlist"

/**
 * Fired when one copy of this form clears the stored address, so the other copy
 * on the same page stops claiming you are on the list. The DOM's own `storage`
 * event is no use here: it fires in every document *except* the one that wrote.
 */
const CLEARED_EVENT = "quincy:waitlist-cleared"

type StoredJoin = { email?: string; ts?: number }

function readStored(): StoredJoin | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredJoin) : null
  } catch {
    // Storage unavailable — Safari private mode throws on write, and a
    // corrupted value throws on parse. Neither is worth a broken form: the
    // state still lives in memory for this visit.
    return null
  }
}

function writeStored(email: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ email, ts: Date.now() }))
  } catch {
    // As above.
  }
}

function clearStored() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // As above.
  }
}

export function JoinForm({
  id = "join",
  source = "landing",
  label = "Opening to a small group first. Leave your email and you get an invite when there is room.",
  cta = "Join the waitlist",
}: {
  id?: string
  /** Which form on which page, so `waitlist.source` can tell them apart. */
  source?: string
  label?: string
  cta?: string
}) {
  const email = useValidatedField(validateEmail)
  const [outcome, setOutcome] = React.useState<Outcome>("idle")
  const [joined, setJoined] = React.useState("")
  const [formError, setFormError] = React.useState<string | null>(null)

  // True only when the confirmation was restored from storage rather than
  // earned this visit. It is what keeps the confetti from firing at somebody
  // who just navigated back to the page.
  const [restored, setRestored] = React.useState(false)

  const inputId = `${id}-email`
  const errorId = `${inputId}-error`
  const alertId = `${inputId}-alert`

  // The row is measured, not the button, because the burst is fired after the
  // form has been replaced by the confirmation — by then the button is gone.
  const rowRef = React.useRef<HTMLDivElement>(null)

  // localStorage does not exist on the server, so this cannot run before the
  // first paint: a returning visitor sees the form for one frame, then the
  // confirmation. The alternative is a blocking inline script that sets a class
  // on `<html>` — it buys that one frame at the cost of a render-blocking
  // script on the landing page, which is a bad trade for a courtesy.
  //
  // The measurements for why that frame is not papered over with a fade or a
  // reserved height are with STORAGE_KEY above.
  React.useEffect(() => {
    const stored = readStored()

    if (stored?.email) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from localStorage on mount; it cannot be read any earlier
      setJoined(stored.email)
      setOutcome("joined")
      setRestored(true)
    }
  }, [])

  // The other copy of this form cleared the address. Only a *restored*
  // confirmation follows it back to the form — one earned this visit stays put,
  // because that person really did just join and un-saying it would be a lie.
  React.useEffect(() => {
    function onCleared() {
      setRestored((wasRestored) => {
        if (wasRestored) {
          setOutcome("idle")
          setJoined("")
        }
        return false
      })
    }

    window.addEventListener(CLEARED_EVENT, onCleared)
    return () => window.removeEventListener(CLEARED_EVENT, onCleared)
  }, [])

  // `confetti()` mounts one fixed canvas on the document and reuses it. Left
  // running, a burst outlives the navigation it started on.
  React.useEffect(
    () => () => {
      confetti.reset()
    },
    []
  )

  function burst() {
    const el = rowRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()

    confetti({
      // Origin is the control that was pressed, not the middle of the screen.
      // A burst from the centre is a page-level event; this one belongs to the
      // button, and firing it anywhere else breaks that.
      origin: {
        x: (rect.left + rect.width / 2) / window.innerWidth,
        y: (rect.top + rect.height / 2) / window.innerHeight,
      },
      particleCount: 60,
      spread: 55,
      startVelocity: 28,
      scalar: 0.8,
      // Roughly two seconds and then the canvas is empty. The default runs long
      // enough that the confirmation is read through falling paper.
      ticks: 120,
      colors: BURST_COLORS,
      // The library's own gate reads the media query and does nothing. That is
      // the correct reduced-motion path here: there is no gentler confetti, so
      // the answer is none.
      disableForReducedMotion: true,
    })
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!email.validateNow() || outcome === "sending") {
      return
    }

    setFormError(null)
    setOutcome("sending")

    const attempted = email.value.trim()

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: attempted, source }),
      })

      if (response.status === 429) {
        setFormError(
          "That is a few tries from here already. Give it an hour and it will go through."
        )
        setOutcome("idle")
        return
      }

      if (!response.ok) {
        setFormError("That address was refused. Check it and try again.")
        setOutcome("idle")
        return
      }

      burst()
      writeStored(attempted)
      setJoined(attempted)
      setOutcome("joined")
    } catch {
      // A thrown fetch is a real network failure — or a redirect into HTML,
      // which is what a missing `/api/waitlist` entry in proxy.ts PUBLIC looks
      // like from here. Both are "try again", and the endpoint's own tests are
      // what tell the two apart.
      setFormError("Could not reach the server. Check your connection.")
      setOutcome("idle")
    }
  }

  // Replaces the form rather than sitting under it. There is nothing left to
  // fill in, and a live field under a confirmation invites a second submission
  // for the same address.
  //
  // `role="status"` because the control that had focus was just removed. Without
  // it a screen reader announces nothing at all.
  if (outcome === "joined") {
    return (
      <div
        id={id}
        role="status"
        // **No entrance animation, and that is a decision.** A 150ms fade was
        // here and an audit took it out. Two reasons: this is page-load state,
        // which the animation rules say not to animate; and it was not the
        // cross-fade it looked like. MiniskatteN can cross-fade because its
        // form and receipt share one grid cell, so one dissolves into the
        // other. Here the form unmounts and this mounts, so the fade played
        // against nothing — stretching the swap over 150ms instead of hiding
        // it. Instant is the honest version. If this ever needs to feel
        // smooth, the fix is the shared grid cell, not a longer fade.
        className="flex max-w-[46ch] scroll-mt-24 flex-col items-start gap-1.5"
      >
        <p className="text-section">
          {restored ? "You are already on the list" : "You are on the list"}
        </p>
        <p className="text-body text-pretty text-muted-foreground">
          The invite goes to{" "}
          <span className="font-medium text-foreground">{joined}</span>. Quincy
          opens in small groups, in the order people asked, and you will hear
          from a person either way.
        </p>

        {/* Joining twice was never harmful — the UNIQUE constraint makes the
            second one a no-op — so this is not an escape from a lock. It is
            for the person who joined with the wrong address, or who wants
            their work one rather than the personal one they used at home. */}
        <button
          type="button"
          onClick={() => {
            clearStored()
            // Broadcast, because the page renders this component twice and the
            // other copy holds its own state. Without it, clearing here leaves
            // the form at the foot of the page still saying "you are already
            // on the list" — the page contradicting itself in two places.
            // `storage` events do not fire in the document that wrote them, so
            // it has to be a custom one.
            window.dispatchEvent(new Event(CLEARED_EVENT))
            // Prefilled rather than emptied. The likeliest reason to press this
            // is a typo in the address you just used, and retyping all of it to
            // fix one character is the kind of small tax nobody forgives.
            email.onChange(joined)
            setOutcome("idle")
            setRestored(false)
            setJoined("")
          }}
          className="rounded-sm text-caption text-muted-foreground underline underline-offset-4 ring-ring outline-hidden transition-colors duration-150 hover:text-foreground focus-visible:ring-2"
        >
          Use a different address
        </button>
      </div>
    )
  }

  const isSending = outcome === "sending"

  return (
    // `scroll-mt-24` because the header's action is an anchor to this id, and
    // without it the form lands flush against the top of the viewport with its
    // own label scrolled out of sight — the one line saying what the field is
    // for.
    <form
      id={id}
      onSubmit={onSubmit}
      className="flex w-full scroll-mt-24 flex-col gap-2.5"
    >
      <label
        htmlFor={inputId}
        className="max-w-[46ch] text-body text-pretty text-muted-foreground"
      >
        {label}
      </label>

      <Field
        data-invalid={email.error ? true : undefined}
        className="max-w-md gap-2"
      >
        {/* Row, not stacked: two controls that are one action. It collapses
            below 380px, where a button beside a field leaves the field about
            eleven characters wide. */}
        <div ref={rowRef} className="flex flex-col gap-2 min-[380px]:flex-row">
          <Input
            id={inputId}
            // `name` as well as `autoComplete`. Nothing submits natively here —
            // React owns the value — but password managers and Safari's autofill
            // read the name attribute as part of deciding what a field is for,
            // and an unnamed input gets weaker heuristics for no reason.
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="you@company.com"
            disabled={isSending}
            value={email.value}
            aria-invalid={email.error ? true : undefined}
            // Both messages, not just the field one. Somebody hearing "could
            // not reach the server" through a screen reader otherwise gets it
            // as loose text with nothing tying it to the input that failed.
            aria-describedby={
              [email.error ? errorId : null, formError ? alertId : null]
                .filter(Boolean)
                .join(" ") || undefined
            }
            onChange={(event) => email.onChange(event.target.value)}
            onBlur={email.onBlur}
            // Taller than the app default. This is the one control on the page
            // and it sits under display type; the 32px chrome height reads as a
            // settings field that wandered onto a hero.
            className="h-10 flex-1"
          />
          <Button type="submit" disabled={isSending} className="h-10 px-4">
            {isSending ? "Joining…" : cta}
          </Button>
        </div>

        {email.error ? (
          <FieldError id={errorId}>{email.error}</FieldError>
        ) : null}
      </Field>

      {formError ? (
        <p id={alertId} role="alert" className="text-caption text-destructive">
          {formError}
        </p>
      ) : null}
    </form>
  )
}
