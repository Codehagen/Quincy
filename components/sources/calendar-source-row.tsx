"use client"

import * as React from "react"
import { useState } from "react"

import {
  answerMeetingQuestion,
  disconnectCalendar,
  type CalendarSetup,
  type MeetingQuestion,
} from "@/app/(app)/sources/actions"
import { Button } from "@/components/ui/button"
import { HoldToConfirm } from "@/components/hold-to-confirm"
import { AnswerQuestion } from "@/components/sources/answer-question"
import { SourceMark } from "@/components/sources/source-mark"

/**
 * The calendar: one link out, nothing to type, and one sentence about what is
 * read. See plans/027 4d.
 *
 * **The sentence is the row.** Every other source on this page hands Quincy
 * something the person chose to hand over — a transcript they recorded, a pull
 * request they wrote. A calendar is different in kind: it holds other people's
 * names, other people's addresses, and the subject lines of things that were
 * said in private. So the row states the boundary in place, at the moment of
 * connecting, rather than filing it in a policy page: the title, the times, how
 * many were invited, and whether you called it. Nothing else, and never a name.
 *
 * The claim is checkable. lib/calendar.ts's `StoredEvent` is the whole of what
 * a row can hold, the scope asked for is `calendar.events.readonly`, and the
 * description is read once in memory to decide whether the meeting touches a
 * story and is dropped with the response. A promise on a page is worth what the
 * type behind it is worth.
 *
 * **No brass.** `--signal*` means a rhythm is running; a source connecting is
 * not that, and neither is a question waiting.
 */

/**
 * What the callback managed to say on its way back.
 *
 * A redirect is the only channel that flow has, so the outcome rides in the
 * query string and is read here. Without it, `?calendar=failed` lands on a page
 * that looks exactly like one where nothing happened.
 *
 * `connected` is deliberately absent: the row already shows the connection, and
 * a banner repeating what the row says is noise.
 */
const OUTCOME: Record<string, { tone: "error" | "muted"; message: string }> = {
  cancelled: {
    tone: "muted",
    message:
      "Nothing was connected — you closed Google's consent screen. Nothing was read and nothing was stored.",
  },
  expired: {
    tone: "error",
    message:
      "That connection attempt took too long and has been discarded. Start it again.",
  },
  bad_handshake: {
    tone: "error",
    message: "Quincy could not verify the round trip to Google. Try again.",
  },
  state_mismatch: {
    tone: "error",
    message: "Quincy could not verify the round trip to Google. Try again.",
  },
  no_code: {
    tone: "error",
    message: "Google sent Quincy back without an authorisation. Try again.",
  },
  no_refresh: {
    tone: "error",
    message:
      "Google granted access for one hour only, with no way to renew it. Nothing was stored — try again, and choose the account you want when the consent screen asks.",
  },
  signed_out: {
    tone: "error",
    message: "Your session ended during the round trip. Sign in and try again.",
  },
  unconfigured: {
    tone: "error",
    message:
      "This deployment has no Google client configured yet, so the calendar cannot be connected.",
  },
  failed: {
    tone: "error",
    message:
      "Google refused the exchange. Nothing was connected — try again in a moment.",
  },
}

/**
 * A real anchor to an API route, and `<Link>` would be wrong here.
 *
 * `/api/connect/google-calendar` is not a page: it sets an httpOnly cookie on
 * its own response and then redirects to another origin. A soft navigation has
 * nowhere to put either. An anchor is also what lets this be opened in a new
 * tab, middle-clicked, and read by a screen reader as a destination rather than
 * an action — the same call `components/welcome/wiring.tsx` makes for the
 * channel handshake.
 *
 * Named here rather than written inline twice, which also keeps
 * `@next/next/no-html-link-for-pages` quiet — that rule reads literal hrefs and
 * would send this to `<Link>`, which is the one thing it must not be. If this
 * ever goes back inline, the rule fires and this comment is the answer.
 */
const CONNECT_HREF = "/api/connect/google-calendar"

export function CalendarSourceRow({
  setup,
  outcome,
  question,
}: {
  setup: CalendarSetup
  /** `?calendar=…` from the callback. Undefined on an ordinary visit. */
  outcome?: string
  /**
   * The one thing Quincy is waiting to be told, or null.
   *
   * Read on the server and handed down, because the row is a client component
   * and "is anything waiting on me" is a database question. Null for nearly
   * every visit — the form is the exception, not a field the row always
   * carries.
   */
  question?: MeetingQuestion | null
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const broken = setup.connected && setup.state === "broken"

  /**
   * Suppressed once the row disagrees with it, because the parameter outlives
   * the fact: it stays in the URL until the next navigation, so a refresh after
   * a successful retry would keep insisting the last attempt failed.
   */
  const notice =
    outcome && !(setup.connected && OUTCOME[outcome]?.tone === "error")
      ? OUTCOME[outcome]
      : undefined

  const remove = async () => {
    const result = await disconnectCalendar()
    if (!result.ok) {
      setError(result.message)
      return
    }
    setOpen(false)
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-3">
      <div className="flex items-center gap-3">
        {/* `calendar` is the mark's id — see SOURCE_MARK in source-mark.tsx. */}
        <SourceMark id="calendar" label="Calendar" />

        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-card-title">Calendar</p>
          {/* One sentence, and it says both halves: what is read and what is
              not. The second half is the one somebody is actually deciding
              on. */}
          <p className="text-caption text-pretty text-muted-foreground">
            Meeting titles and times — never who was there, and never the notes
          </p>

          {/* The state a phone can read. There is no desktop-only column on
              this row, so this is the only place it is said. */}
          {broken ? (
            <p className="pt-0.5 text-caption text-pretty text-destructive">
              Google is no longer letting Quincy read this calendar. Reconnect
              to start again.
            </p>
          ) : setup.connected && setup.lastReadAt ? (
            <p className="pt-0.5 text-caption text-muted-foreground">
              Last read {setup.lastReadAt.toLowerCase()}
            </p>
          ) : setup.connected ? (
            /* Connected and never read: the hourly job has not come round yet.
               Said plainly rather than left blank, because a row with no status
               line reads as a row that failed to load. */
            <p className="pt-0.5 text-caption text-pretty text-muted-foreground">
              Connected — Quincy looks once an hour
            </p>
          ) : null}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {setup.connected ? (
            <>
              {broken ? (
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<a href={CONNECT_HREF} />}
                >
                  Reconnect
                </Button>
              ) : null}
              <Button
                variant="ghost"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
              >
                {open ? "Close" : "Manage"}
              </Button>
            </>
          ) : setup.enabled ? (
            <Button
              variant="outline"
              // The rendered element is an anchor, so Base UI needs telling —
              // without this it warns that native button semantics are gone.
              nativeButton={false}
              render={<a href={CONNECT_HREF} />}
            >
              Connect calendar
            </Button>
          ) : (
            <Button variant="outline" disabled>
              Unavailable
            </Button>
          )}
        </div>
      </div>

      {notice ? (
        <p
          className={
            notice.tone === "error"
              ? "text-caption text-pretty text-destructive"
              : "text-caption text-pretty text-muted-foreground"
          }
        >
          {notice.message}
        </p>
      ) : null}

      {/* The one question, at row level rather than inside a state branch — an
          answer flips the row's own state, and a form living inside the branch
          that drew it would be unmounted by its own success. */}
      {question ? (
        <AnswerQuestion
          question={question}
          onAnswer={answerMeetingQuestion}
          inputId="meeting-answer"
          placeholder="They said the price was fine, the onboarding was not."
          lead={
            <>
              From “{question.about}”. One line is enough — I will make a riff
              out of it, and nothing is drafted until you ask.
            </>
          }
        />
      ) : null}

      {!setup.connected && !setup.enabled ? (
        <p className="text-caption text-pretty text-muted-foreground">
          This deployment has no Google client for calendars yet. Whoever runs
          it creates one once and sets{" "}
          <code className="font-mono">GOOGLE_CALENDAR_CLIENT_ID</code> and{" "}
          <code className="font-mono">GOOGLE_CALENDAR_CLIENT_SECRET</code>.
        </p>
      ) : null}

      {open && setup.connected ? (
        /* Derived nested radius: the list around this is `rounded-xl` (20px)
           with 16px of padding, so a child sits at `rounded-xs` (4px). See
           AGENTS.md — inner = outer − padding. */
        <div className="flex flex-col gap-4 rounded-xs bg-muted p-4">
          <div className="flex flex-col gap-2">
            <p className="text-caption text-pretty text-foreground">
              Once an hour Quincy reads the meetings that ended in the last
              hour, from your main calendar only. It stores the title, the start
              and end, how many people were invited, and whether you organised
              it.
            </p>
            {/* The absence, stated as plainly as the presence. A privacy claim
                that only lists what is kept is one the reader has to take on
                trust; this one names what a row cannot hold. */}
            <p className="text-caption text-pretty text-muted-foreground">
              It never stores who was there, their email addresses, the
              description, the location, or the meeting link. It cannot write to
              your calendar, respond to an invitation, or appear on one — the
              permission it asks for is read-only.
            </p>
            <p className="text-caption text-pretty text-muted-foreground">
              When a meeting touches a story you keep, Quincy asks one question
              about it here. One at a time, and never more.
            </p>
          </div>

          {setup.lastError ? (
            <p className="text-caption text-pretty text-destructive">
              {setup.lastError}
            </p>
          ) : null}

          {error ? (
            <p className="text-caption text-pretty text-destructive">{error}</p>
          ) : null}

          {/* Away from anything else pressable, per AGENTS.md on forms. */}
          <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
            <HoldToConfirm onConfirm={remove} doneLabel="Disconnected">
              Disconnect calendar
            </HoldToConfirm>
            <p className="text-caption text-pretty text-muted-foreground">
              Quincy tells Google to withdraw the permission and stops reading
              immediately. The meetings it already read stay — they are your
              record of your own week, and the riffs you wrote from them point
              back at them.
            </p>
          </div>
        </div>
      ) : null}

      {!open && error ? (
        <p className="text-caption text-pretty text-destructive">{error}</p>
      ) : null}
    </li>
  )
}
