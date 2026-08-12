"use client"

import * as React from "react"
import {
  Alert01Icon,
  ComputerIcon,
  Mail01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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

/** Fixed, so the server and the client render the same clock. */
const NOW = new Date("2026-08-11T20:15:00Z")

/**
 * **Desk** — a card per concern, in the shape /settings/billing already uses.
 *
 * The axis is convention: four cards, each one thing, each with its own Save,
 * and the destructive one held apart at the bottom by a heading that changes
 * the subject. Somebody who has used any product's settings page can find
 * their way around this one without reading it.
 *
 * The cost is vertical space and repetition — four card headers say four times
 * what a single page title could say once.
 */
export function Desk() {
  const name = useSavedField(ACCOUNT.name)
  const zone = useSavedField(ACCOUNT.timezone)
  const password = usePasswordForm()
  const sessions = useSessions(SESSIONS)
  const [deleted, setDeleted] = React.useState(false)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-8 py-10">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Settings.</PageHeaderTitle>
          <PageHeaderDescription>
            Your account, and the two facts Quincy writes with.
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      {/* ── You ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-section">You</CardTitle>
          <CardDescription className="text-pretty">
            Quincy opens with your name and draws your day in your zone. Both
            are used, not stored for a profile page.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <form
            className="flex flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault()
              void name.save()
              void zone.save()
            }}
          >
            <Field>
              <FieldLabel htmlFor="desk-name">Name</FieldLabel>
              <Input
                id="desk-name"
                name="name"
                autoComplete="name"
                value={name.value}
                onChange={(event) => name.setValue(event.target.value)}
              />
              <FieldDescription>
                What Quincy calls you, in the app and in mail.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="desk-zone">Time zone</FieldLabel>
              <Select
                value={zone.value}
                onValueChange={(value) => zone.setValue(value ?? zone.value)}
              >
                <SelectTrigger id="desk-zone" className="w-full">
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
                It is {timeIn(zone.value, NOW)} there now. Slots, rhythms and
                every date in the product are drawn against this.
              </FieldDescription>
            </Field>

            {/* Only when there is something to save — a permanently visible
                Save beside two settled fields invites a press that does
                nothing. */}
            {name.dirty || zone.dirty ? (
              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  disabled={name.state === "saving" || zone.state === "saving"}
                >
                  {name.state === "saving" || zone.state === "saving"
                    ? "Saving…"
                    : "Save changes"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    name.reset()
                    zone.reset()
                  }}
                >
                  Discard
                </Button>
              </div>
            ) : (
              <SavedNote
                state={name.state === "saved" ? "saved" : zone.state}
              />
            )}
          </form>
        </CardContent>
      </Card>

      {/* ── Signing in ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-section">Signing in</CardTitle>
          <CardDescription className="text-pretty">
            One address, one password. Changing the address is not built yet —
            write to us and we will move it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <HugeiconsIcon
              aria-hidden="true"
              icon={Mail01Icon}
              size={16}
              className="text-muted-foreground"
            />
            {/* Breaks anywhere rather than pushing the card wide: this address
                has no spaces and is longer than the column. */}
            <span className="text-body min-w-0 break-all">{ACCOUNT.email}</span>
            <Badge variant="secondary">Verified</Badge>
          </div>

          <form className="flex flex-col gap-4" onSubmit={password.submit}>
            <Field>
              <FieldLabel htmlFor="desk-current">Current password</FieldLabel>
              <Input
                id="desk-current"
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

            <div className="grid gap-4 @md/field-group:grid-cols-2 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="desk-next">New password</FieldLabel>
                <Input
                  id="desk-next"
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
                <FieldLabel htmlFor="desk-confirm">Type it again</FieldLabel>
                <Input
                  id="desk-confirm"
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
            </div>

            <div className="flex items-center gap-3">
              <Button
                type="submit"
                variant="outline"
                disabled={!password.ready || password.state === "saving"}
              >
                {password.state === "saving"
                  ? "Changing…"
                  : "Change password"}
              </Button>
              <SavedNote state={password.state} />
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── Sessions ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-section">Where you are signed in</CardTitle>
          <CardDescription className="text-pretty">
            Sign a browser out and it needs the password again.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ul className="flex flex-col">
            {SESSIONS.filter((s) => !sessions.isRevoked(s.id)).map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 border-b border-foreground/8 py-3 last:border-b-0"
              >
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={ComputerIcon}
                  size={16}
                  className="text-muted-foreground shrink-0"
                />
                <div className="flex min-w-0 flex-col">
                  <span className="text-body truncate">
                    {s.browser}
                    {s.current ? (
                      <span className="text-muted-foreground"> · this one</span>
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
              <Button variant="outline" onClick={sessions.revokeOthers}>
                Sign out everywhere else
              </Button>
            </div>
          ) : (
            <p className="text-caption text-muted-foreground">
              This is the only browser signed in.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Leaving ─────────────────────────────────────────────────── */}
      <div className="mt-2 flex flex-col gap-3">
        <h2 className="text-eyebrow text-muted-foreground px-1">Leaving</h2>
        <Card className="ring-destructive/20">
          <CardHeader>
            <CardTitle className="text-section">Delete your account</CardTitle>
            <CardDescription className="text-pretty">
              This cannot be undone and there is no copy. It removes:
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="text-caption text-muted-foreground flex flex-col gap-1">
              {DELETION_COVERS.map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden="true">—</span>
                  <span className="text-pretty">{line}</span>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center gap-3">
              {deleted ? (
                <p className="text-caption text-destructive flex items-center gap-2">
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={Alert01Icon}
                    size={16}
                  />
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
              <span className="text-caption text-muted-foreground">
                An active subscription is cancelled at the same time.
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
