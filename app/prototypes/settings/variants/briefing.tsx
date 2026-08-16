"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { HoldToConfirm } from "@/components/hold-to-confirm"
import { Input } from "@/components/ui/input"
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/page-header"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { ACCOUNT, DELETION_COVERS, SESSIONS } from "../data"
import {
  SavedNote,
  timeIn,
  useSavedField,
  useSessions,
  usePasswordForm,
  zoneLabel,
  zoneOptions,
} from "../parts"

const NOW = new Date("2026-08-11T20:15:00Z")

/**
 * The value, inside the sentence, as the thing you press.
 *
 * A real `<button>` — not a span with a click handler — so it is tabbable and
 * announced. The dotted underline is the affordance: a solid one would read as
 * a link to another page, which is exactly what this is not.
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
 * **Briefing** — Quincy states what it knows, and the facts are the controls.
 *
 * The axis is voice. This is the same surface as the other two, written as the
 * product's own sentences rather than as a form: the settings are read as
 * claims Quincy is making about you, and correcting one is pressing the word
 * that is wrong. It is the same posture as first run, which is the only other
 * place the product addresses somebody directly.
 *
 * The cost is scanning. There are no labels down the left edge, so finding
 * "time zone" means reading a paragraph rather than jumping a column — and it
 * is the direction that ages worst, because the tenth setting has to be
 * written into prose that already says nine things.
 */
export function Briefing() {
  const [open, setOpen] = React.useState<string | null>(null)
  const name = useSavedField(ACCOUNT.name)
  const zone = useSavedField(ACCOUNT.timezone)
  const password = usePasswordForm()
  const sessions = useSessions(SESSIONS)
  const [deleted, setDeleted] = React.useState(false)

  const toggle = (id: string) =>
    setOpen((current) => (current === id ? null : id))

  const count = sessions.others.length + 1

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-8 py-10">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Settings.</PageHeaderTitle>
          <PageHeaderDescription>
            What I know about you, and how to correct it.
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <div className="flex flex-col gap-6 px-1">
        {/* Name ------------------------------------------------------- */}
        <div>
          <p className="max-w-prose text-body text-pretty">
            You are{" "}
            <Inline
              label="Change your name"
              open={open === "name"}
              onToggle={() => toggle("name")}
            >
              {name.committed}
            </Inline>
            . That is the name I open with, here and in mail.{" "}
            <SavedNote state={name.state} />
          </p>

          {open === "name" ? (
            <Drawer>
              <form
                className="flex flex-col gap-3"
                onSubmit={async (event) => {
                  event.preventDefault()
                  await name.save()
                  setOpen(null)
                }}
              >
                <Field>
                  <FieldLabel htmlFor="briefing-name">Name</FieldLabel>
                  <Input
                    id="briefing-name"
                    name="name"
                    autoComplete="name"
                    value={name.value}
                    onChange={(event) => name.setValue(event.target.value)}
                  />
                </Field>
                <div>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!name.dirty || name.state === "saving"}
                  >
                    {name.state === "saving" ? "Saving…" : "Save"}
                  </Button>
                </div>
              </form>
            </Drawer>
          ) : null}
        </div>

        {/* Time zone -------------------------------------------------- */}
        <div>
          <p className="max-w-prose text-body text-pretty">
            I draw your day in{" "}
            <Inline
              label="Change your time zone"
              open={open === "zone"}
              onToggle={() => toggle("zone")}
            >
              {zone.committed.replace(/_/g, " ")}
            </Inline>
            , where it is {timeIn(zone.committed, NOW)} now. Every slot, every
            rhythm and every date you see is that clock.{" "}
            <SavedNote state={zone.state} />
          </p>

          {open === "zone" ? (
            <Drawer>
              <form
                className="flex flex-col gap-3"
                onSubmit={async (event) => {
                  event.preventDefault()
                  await zone.save()
                  setOpen(null)
                }}
              >
                <Field>
                  <FieldLabel htmlFor="briefing-zone">Time zone</FieldLabel>
                  <Select
                    value={zone.value}
                    onValueChange={(value) =>
                      zone.setValue(value ?? zone.value)
                    }
                  >
                    <SelectTrigger id="briefing-zone" className="w-full">
                      <SelectValue>
                        {(value: string) => zoneLabel(value, NOW)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {zoneOptions(ACCOUNT.timezone).map((z) => (
                        <SelectItem key={z} value={z}>
                          {zoneLabel(z, NOW)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <div>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!zone.dirty || zone.state === "saving"}
                  >
                    {zone.state === "saving" ? "Saving…" : "Save"}
                  </Button>
                </div>
              </form>
            </Drawer>
          ) : null}
        </div>

        {/* Sign-in ---------------------------------------------------- */}
        <div>
          <p className="max-w-prose text-body text-pretty">
            You sign in at <span className="break-all">{ACCOUNT.email}</span>,
            which is verified, with{" "}
            <Inline
              label="Change your password"
              open={open === "password"}
              onToggle={() => toggle("password")}
            >
              a password
            </Inline>
            . Moving the address is something I cannot do yet — write to us and
            we will move it. <SavedNote state={password.state} />
          </p>

          {open === "password" ? (
            <Drawer>
              <form className="flex flex-col gap-4" onSubmit={password.submit}>
                <Field>
                  <FieldLabel htmlFor="briefing-current">
                    Current password
                  </FieldLabel>
                  <Input
                    id="briefing-current"
                    type="password"
                    autoComplete="current-password"
                    aria-invalid={Boolean(password.problems.current)}
                    value={password.fields.current}
                    onBlur={() => password.blur("current")}
                    onChange={(event) =>
                      password.set("current", event.target.value)
                    }
                  />
                  {password.problems.current ? (
                    <FieldDescription className="text-destructive">
                      {password.problems.current}
                    </FieldDescription>
                  ) : null}
                </Field>

                <Field>
                  <FieldLabel htmlFor="briefing-next">New password</FieldLabel>
                  <Input
                    id="briefing-next"
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={Boolean(password.problems.next)}
                    value={password.fields.next}
                    onBlur={() => password.blur("next")}
                    onChange={(event) =>
                      password.set("next", event.target.value)
                    }
                  />
                  {password.problems.next ? (
                    <FieldDescription className="text-destructive">
                      {password.problems.next}
                    </FieldDescription>
                  ) : (
                    <FieldDescription>At least 8 characters.</FieldDescription>
                  )}
                </Field>

                <Field>
                  <FieldLabel htmlFor="briefing-confirm">
                    Type it again
                  </FieldLabel>
                  <Input
                    id="briefing-confirm"
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={Boolean(password.problems.confirm)}
                    value={password.fields.confirm}
                    onBlur={() => password.blur("confirm")}
                    onChange={(event) =>
                      password.set("confirm", event.target.value)
                    }
                  />
                  {password.problems.confirm ? (
                    <FieldDescription className="text-destructive">
                      {password.problems.confirm}
                    </FieldDescription>
                  ) : null}
                </Field>

                <div>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!password.ready || password.state === "saving"}
                  >
                    {password.state === "saving"
                      ? "Changing…"
                      : "Change password"}
                  </Button>
                </div>
              </form>
            </Drawer>
          ) : null}
        </div>

        {/* Sessions --------------------------------------------------- */}
        <div>
          <p className="max-w-prose text-body text-pretty">
            {count === 1 ? (
              <>This browser is the only one signed in.</>
            ) : (
              <>
                You are signed in on{" "}
                <Inline
                  label="Show where you are signed in"
                  open={open === "sessions"}
                  onToggle={() => toggle("sessions")}
                >
                  {count} browsers
                </Inline>
                , including this one.
              </>
            )}
          </p>

          {open === "sessions" && count > 1 ? (
            <Drawer>
              <div className="flex flex-col gap-3">
                <ul className="flex flex-col">
                  {SESSIONS.filter((s) => !sessions.isRevoked(s.id)).map(
                    (s) => (
                      <li
                        key={s.id}
                        className="flex items-center gap-3 border-b border-foreground/8 py-2.5 last:border-b-0"
                      >
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-body">
                            {s.browser}
                            {s.current ? (
                              <span className="text-muted-foreground">
                                {" "}
                                · this one
                              </span>
                            ) : null}
                          </span>
                          <span className="truncate text-caption text-muted-foreground">
                            {s.place} · {s.lastSeen}
                          </span>
                        </div>
                        {s.current ? null : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="ml-auto"
                            onClick={() => sessions.revoke(s.id)}
                          >
                            Sign out
                          </Button>
                        )}
                      </li>
                    )
                  )}
                </ul>
                {sessions.others.length > 0 ? (
                  <div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={sessions.revokeOthers}
                    >
                      Sign out everywhere else
                    </Button>
                  </div>
                ) : null}
              </div>
            </Drawer>
          ) : null}
        </div>
      </div>

      {/* Leaving ------------------------------------------------------ */}
      <div className="flex flex-col gap-3 px-1 pt-6">
        <div className="h-px bg-foreground/8" role="presentation" />
        <h2 className="pt-4 text-eyebrow text-muted-foreground">
          If you want out
        </h2>
        <p className="max-w-prose text-body text-pretty">
          I will delete the account and everything under it —{" "}
          {DELETION_COVERS.join("; ")}. There is no copy afterwards, and an
          active subscription is cancelled at the same time.
        </p>
        <div className="pt-1">
          {deleted ? (
            <p className="text-caption text-destructive">
              Prototype — nothing was deleted.
            </p>
          ) : (
            <HoldToConfirm
              onConfirm={() => setDeleted(true)}
              doneLabel="Deleted"
              hint="hold to confirm"
            >
              Delete everything
            </HoldToConfirm>
          )}
        </div>
      </div>
    </div>
  )
}
