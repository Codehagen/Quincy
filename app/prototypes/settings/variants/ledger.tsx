"use client"

import * as React from "react"

import { Badge } from "@/components/ui/badge"
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
 * A row: what it is, what it currently says, and the way in.
 *
 * The value is the point — a settings page is read far more often than it is
 * written, and every direction that hides current values behind an input makes
 * the common case (checking) as expensive as the rare one (changing).
 */
function Row({
  label,
  value,
  action,
  open,
  onToggle,
  children,
}: {
  label: string
  value: React.ReactNode
  action?: string
  open?: boolean
  onToggle?: () => void
  children?: React.ReactNode
}) {
  return (
    <div className="border-b border-foreground/8 last:border-b-0">
      <div className="flex items-baseline gap-4 py-4">
        <span className="text-caption text-muted-foreground w-32 shrink-0">
          {label}
        </span>
        <span className="text-body min-w-0 flex-1 break-words">{value}</span>
        {onToggle ? (
          <Button
            size="sm"
            variant="ghost"
            className="-my-1 shrink-0"
            aria-expanded={open}
            onClick={onToggle}
          >
            {open ? "Cancel" : (action ?? "Edit")}
          </Button>
        ) : null}
      </div>

      {open && children ? (
        <div className="animate-in fade-in slide-in-from-top-1 pb-5 pl-36 duration-200 ease-out motion-reduce:animate-none">
          {children}
        </div>
      ) : null}
    </div>
  )
}

/**
 * **Ledger** — one column of hairline rows, values in the open, edit in place.
 *
 * The axis is density and the read case. Nothing is behind a card header, every
 * current value is visible without a click, and the page is about a screen tall
 * instead of four. Editing expands the row it belongs to rather than moving you
 * to a different part of the page.
 *
 * The cost is that it looks like a list of facts rather than a settings page,
 * so the destructive action has less structural distance from the harmless ones
 * — bought back here with a rule, a heading and a full column of space.
 */
export function Ledger() {
  const [open, setOpen] = React.useState<string | null>(null)
  const name = useSavedField(ACCOUNT.name)
  const zone = useSavedField(ACCOUNT.timezone)
  const password = usePasswordForm()
  const sessions = useSessions(SESSIONS)
  const [deleted, setDeleted] = React.useState(false)

  // One row at a time. Two open editors in a column this dense read as one
  // form with a stray heading in the middle of it.
  const toggle = (id: string) => setOpen((current) => (current === id ? null : id))

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-8 py-10">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Settings.</PageHeaderTitle>
          <PageHeaderDescription>
            Everything Quincy holds about the account, and the way to change it.
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <div className="flex flex-col px-1">
        <Row
          label="Name"
          value={name.committed}
          open={open === "name"}
          onToggle={() => toggle("name")}
        >
          <form
            className="flex flex-col gap-3"
            onSubmit={async (event) => {
              event.preventDefault()
              await name.save()
              setOpen(null)
            }}
          >
            <Field className="max-w-sm">
              <FieldLabel htmlFor="ledger-name">Name</FieldLabel>
              <Input
                id="ledger-name"
                name="name"
                autoComplete="name"
                value={name.value}
                onChange={(event) => name.setValue(event.target.value)}
              />
              <FieldDescription>
                What Quincy calls you, in the app and in mail.
              </FieldDescription>
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
        </Row>

        <Row
          label="Time zone"
          value={
            <span className="flex flex-wrap items-baseline gap-x-2">
              {zoneLabel(zone.committed, NOW)}
              <span className="text-caption text-muted-foreground">
                {timeIn(zone.committed, NOW)} there now
              </span>
              <SavedNote state={zone.state} />
            </span>
          }
          open={open === "zone"}
          onToggle={() => toggle("zone")}
        >
          <form
            className="flex flex-col gap-3"
            onSubmit={async (event) => {
              event.preventDefault()
              await zone.save()
              setOpen(null)
            }}
          >
            <Field className="max-w-sm">
              <FieldLabel htmlFor="ledger-zone">Time zone</FieldLabel>
              <Select
                value={zone.value}
                onValueChange={(value) => zone.setValue(value ?? zone.value)}
              >
                <SelectTrigger id="ledger-zone" className="w-full">
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
              <FieldDescription>
                Slots, rhythms and every date in the product are drawn against
                this.
              </FieldDescription>
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
        </Row>

        {/* No edit affordance, because there is no edit. A disabled button
            here would be a control that exists to refuse. */}
        <Row
          label="Email"
          value={
            <span className="flex flex-wrap items-center gap-2">
              <span className="break-all">{ACCOUNT.email}</span>
              <Badge variant="secondary">Verified</Badge>
            </span>
          }
        />

        <Row
          label="Password"
          value={
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span aria-hidden="true">••••••••••</span>
              {/* The dots are decoration; this is what a screen reader gets,
                  and it has to be a sentence rather than the word "Set". */}
              <span className="sr-only">A password is set.</span>
              <SavedNote state={password.state} />
            </span>
          }
          action="Change"
          open={open === "password"}
          onToggle={() => toggle("password")}
        >
          <form
            className="flex max-w-sm flex-col gap-4"
            onSubmit={password.submit}
          >
            <Field>
              <FieldLabel htmlFor="ledger-current">Current password</FieldLabel>
              <Input
                id="ledger-current"
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
              <FieldLabel htmlFor="ledger-next">New password</FieldLabel>
              <Input
                id="ledger-next"
                type="password"
                autoComplete="new-password"
                aria-invalid={Boolean(password.problems.next)}
                value={password.fields.next}
                onBlur={() => password.blur("next")}
                onChange={(event) => password.set("next", event.target.value)}
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
              <FieldLabel htmlFor="ledger-confirm">Type it again</FieldLabel>
              <Input
                id="ledger-confirm"
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
                {password.state === "saving" ? "Changing…" : "Change password"}
              </Button>
            </div>
          </form>
        </Row>

        <Row
          label="Signed in"
          value={
            sessions.others.length > 0
              ? `${sessions.others.length + 1} browsers`
              : "This browser only"
          }
          action="Show"
          open={open === "sessions"}
          onToggle={() => toggle("sessions")}
        >
          <div className="flex max-w-md flex-col gap-3">
            <ul className="flex flex-col">
              {SESSIONS.filter((s) => !sessions.isRevoked(s.id)).map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 border-b border-foreground/8 py-2.5 last:border-b-0"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="text-body truncate">
                      {s.browser}
                      {s.current ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · this one
                        </span>
                      ) : null}
                    </span>
                    <span className="text-caption text-muted-foreground truncate">
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
              ))}
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
        </Row>
      </div>

      {/* The break. In a page with no cards this rule, this heading and the
          empty column above it are the whole separation between a harmless
          list and the one row that ends the account. */}
      <div className="flex flex-col gap-3 px-1 pt-4">
        <div className="bg-foreground/8 h-px" role="presentation" />
        <h2 className="text-eyebrow text-muted-foreground pt-4">Leaving</h2>
        {/* Semicolons, not commas: the first item contains a comma list of its
            own ("voice, rules, strategy and stories"), and joined with commas
            the four items read as one run-on inventory. */}
        <p className="text-caption text-muted-foreground max-w-prose text-pretty">
          Deleting cannot be undone and there is no copy. It removes{" "}
          {DELETION_COVERS.join("; ")}. An active subscription is cancelled at
          the same time.
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
