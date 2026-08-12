"use client"

import { useState, useTransition } from "react"
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import {
  disconnectCircleback,
  saveCirclebackSecret,
  startCirclebackSetup,
  type CirclebackSetup,
} from "@/app/(app)/sources/actions"
import type { Connection } from "@/lib/sources"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { HoldToConfirm } from "@/components/hold-to-confirm"
import { SourceMark } from "@/components/sources/source-mark"

/**
 * Connecting Circleback: a URL out, a secret back. See plans/019.
 *
 * A client component for the reason ChannelSourceRow is one — the row owns
 * mutations and their receipts, and the receipt belongs in place rather than
 * in a toast that is gone when the eye comes back.
 *
 * **The two-step setup is not a design failure to be hidden.** Circleback
 * mints the signing secret and only reveals it after the automation exists, so
 * there is no arrangement of this UI that avoids sending the user away and
 * asking them to come back with a string. The panel therefore states the
 * sequence plainly and numbers it, rather than presenting two fields and
 * hoping the order is guessed.
 *
 * **No brass.** The same rule the rest of /sources follows: `--signal*` means a
 * rhythm is running, and a source connecting is not that.
 */

export function CirclebackSourceRow({
  connection,
  setup: initialSetup,
}: {
  /** null = never connected. */
  connection: Connection | null
  /** Present when a connection exists, so the URL survives a reload. */
  setup: CirclebackSetup | null
}) {
  const [setup, setSetup] = useState<CirclebackSetup | null>(initialSetup)
  const [open, setOpen] = useState(false)
  const [secret, setSecret] = useState("")
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const begin = () => {
    setError(null)
    startTransition(async () => {
      const result = await startCirclebackSetup()
      if (!result.ok) {
        setError(result.message)
        return
      }
      setSetup(result.setup)
      setOpen(true)
    })
  }

  const copy = async () => {
    if (!setup) return
    try {
      await navigator.clipboard.writeText(setup.url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // A clipboard permission refusal is not an error worth a red line —
      // the URL is on screen and selectable, which is the fallback.
      setCopied(false)
    }
  }

  const save = () => {
    setError(null)
    startTransition(async () => {
      const result = await saveCirclebackSecret(secret)
      if (!result.ok) {
        setError(result.message)
        return
      }
      setSecret("")
      setSetup((current) => (current ? { ...current, verified: true } : current))
      setOpen(false)
    })
  }

  const remove = async () => {
    const result = await disconnectCircleback()
    if (!result.ok) {
      setError(result.message)
      return
    }
    setSetup(null)
    setOpen(false)
    setSecret("")
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-3">
      <div className="flex items-center gap-3">
        <SourceMark id="circleback" label="Circleback" />

        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-card-title">Circleback</p>
          <p className="text-caption text-muted-foreground text-pretty">
            The moment worth quoting from a call
          </p>

          {/* The state a phone can read. The desktop column below is `sm:`
              only, and without this a 390px row cannot tell "connected and
              waiting" from "material arriving" — which is the distinction the
              whole page exists to draw. */}
          {setup && !setup.verified ? (
            <p className="text-caption text-muted-foreground pt-0.5 text-pretty">
              Waiting for the signing secret
            </p>
          ) : connection?.state === "waiting" ? (
            <p className="text-caption text-muted-foreground pt-0.5">
              Connected {connection.since} — nothing yet
            </p>
          ) : connection?.state === "arriving" ? (
            <p className="text-caption text-muted-foreground pt-0.5">
              Last meeting {connection.lastAt}
            </p>
          ) : null}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {setup ? (
            <Button
              variant="ghost"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
            >
              {open ? "Close" : setup.verified ? "Manage" : "Finish setup"}
            </Button>
          ) : (
            <Button variant="outline" onClick={begin} disabled={pending}>
              {pending ? "Connecting…" : "Connect"}
            </Button>
          )}
        </div>
      </div>

      {open && setup ? (
        /* Derived nested radius: the list around this is `rounded-xl` (20px)
           with 16px of padding, so a child sits at `rounded-xs` (4px). See
           AGENTS.md — inner = outer − padding. */
        <div className="bg-muted flex flex-col gap-4 rounded-xs p-4">
          <div className="flex flex-col gap-2">
            <p className="text-caption text-foreground">
              1. In Circleback, create an automation with the action{" "}
              <span className="font-medium">Send webhook request</span>, and
              paste this URL into it.
            </p>

            <div className="flex items-center gap-2">
              {/* Readonly rather than a styled div: it is selectable, it is
                  focusable, and a keyboard user can copy it without the
                  button. The button is the enhancement. */}
              <Input
                readOnly
                value={setup.url}
                aria-label="Circleback webhook URL"
                onFocus={(event) => event.currentTarget.select()}
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                onClick={copy}
                aria-label="Copy the webhook URL"
              >
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={copied ? Tick02Icon : Copy01Icon}
                />
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>

            <p className="text-caption text-muted-foreground text-pretty">
              Treat it like a password. Anyone holding it can send Quincy a
              meeting — which is why the secret below is not optional.
            </p>
          </div>

          {/* A real form, so Enter submits — AGENTS.md on forms. */}
          <form
            onSubmit={(event) => {
              event.preventDefault()
              save()
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="circleback-secret">
                  2. Paste the signing secret Circleback showed you
                </FieldLabel>
                <Input
                  id="circleback-secret"
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  placeholder="whsec_…"
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono text-xs"
                />
              </Field>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={pending || !secret.trim()}>
                  {pending ? "Saving…" : setup.verified ? "Replace" : "Save"}
                </Button>

                {setup.verified ? (
                  <p className="text-caption text-muted-foreground">
                    Signed deliveries are being accepted.
                  </p>
                ) : (
                  <p className="text-caption text-muted-foreground text-pretty">
                    Until this is saved, Quincy drops every delivery unread.
                  </p>
                )}
              </div>
            </FieldGroup>
          </form>

          {error ? (
            <p className="text-destructive text-caption text-pretty">{error}</p>
          ) : null}

          {/* Away from the confirm button above, per AGENTS.md on forms. A hold
              rather than a dialog, because disconnecting deletes the row and
              the URL stops resolving for whoever has it. */}
          <div className="border-border/60 flex flex-col gap-2 border-t pt-3">
            <HoldToConfirm onConfirm={remove} doneLabel="Disconnected">
              Disconnect Circleback
            </HoldToConfirm>
            <p className="text-caption text-muted-foreground text-pretty">
              The URL stops working immediately. Reconnecting issues a new one,
              which is also how you rotate it if this one leaks.
            </p>
          </div>
        </div>
      ) : null}

      {!open && error ? (
        <p className="text-destructive text-caption text-pretty">{error}</p>
      ) : null}
    </li>
  )
}
