"use client"

import { useState, useTransition } from "react"
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons"

import {
  disconnectCircleback,
  saveCirclebackSecret,
  startCirclebackSetup,
  type CirclebackSetup,
} from "@/app/(app)/sources/actions"
import type { Connection } from "@/lib/sources"
import { COULD_NOT_REACH } from "@/lib/action-error"
import { Button, Field, HoldButton, Input, Text } from "@/components/kit"
import {
  SourcePanelRule,
  SourceRowFrame,
  sourceNameId,
} from "@/components/sources/source-row"

/**
 * Connecting Circleback: a URL out, a secret back. See plans/019.
 *
 * A client component for the reason ChannelSourceRow is one: the row owns
 * mutations and their receipts, and the receipt belongs in place rather than
 * in a toast that is gone when the eye comes back.
 *
 * **The two-step setup is not a design failure to be hidden.** Circleback
 * mints the signing secret and only reveals it after the automation exists, so
 * there is no arrangement of this UI that avoids sending the person away and
 * asking them to come back with a string. The panel states the sequence
 * plainly and numbers it, rather than presenting two fields and hoping the
 * order is guessed.
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
  /** The secret refused: shown under its field (forms.md). */
  const [secretError, setSecretError] = useState<string | undefined>()
  /** Anything else refused (starting, disconnecting): shown in the row. */
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const begin = () => {
    setError(null)
    startTransition(async () => {
      const result = await startCirclebackSetup().catch(() => null)
      if (!result) {
        setError(COULD_NOT_REACH)
        return
      }
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
      // A clipboard permission refusal is not an error worth a line: the URL
      // is on screen and selectable, which is the fallback.
      setCopied(false)
    }
  }

  const save = () => {
    setSecretError(undefined)
    setError(null)
    startTransition(async () => {
      const result = await saveCirclebackSecret(secret).catch(() => null)
      if (!result) {
        setSecretError(COULD_NOT_REACH)
        return
      }
      if (!result.ok) {
        setSecretError(result.message)
        return
      }
      setSecret("")
      setSetup((current) =>
        current ? { ...current, verified: true } : current
      )
      setOpen(false)
    })
  }

  const remove = async () => {
    setError(null)
    const result = await disconnectCircleback()
    if (!result.ok) {
      setError(result.message)
      // Thrown so the hold returns to idle for a retry, rather than saying
      // "Disconnected" over a refusal.
      throw new Error(result.message)
    }
    setSetup(null)
    setOpen(false)
    setSecret("")
  }

  const status =
    setup && !setup.verified
      ? "Waiting for the signing secret."
      : connection?.state === "waiting"
        ? `Connected ${connection.since}. Nothing yet.`
        : connection?.state === "arriving"
          ? `Last meeting ${connection.lastAt}.`
          : null

  return (
    <SourceRowFrame
      id="circleback"
      name="Circleback"
      description={
        setup
          ? "The moment worth quoting from a call."
          : // Before connecting, the row says what Quincy keeps and what it
            // never stores: that is what somebody is deciding on here.
            "Each call as it ends. Quincy reads your half of the transcript, keeps the passage worth posting, and stores nothing anyone else said."
      }
      status={status}
      action={
        setup ? (
          <Button
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-describedby={sourceNameId("circleback")}
          >
            {open ? "Close" : setup.verified ? "Manage" : "Finish setup"}
          </Button>
        ) : (
          <Button
            onClick={begin}
            pending={pending}
            pendingLabel="Connecting…"
            aria-describedby={sourceNameId("circleback")}
          >
            Connect
          </Button>
        )
      }
    >
      {(open && setup) || error ? (
        <>
          {open && setup ? (
            <>
              <SourcePanelRule />

              <div className="flex flex-col gap-kit-related">
                <Text>
                  1. In Circleback, make an automation that sends a webhook
                  request, and paste this URL into it.
                </Text>

                <div className="flex items-end gap-kit-controls">
                  {/* Readonly rather than a styled div: it is selectable, it is
                  focusable, and a keyboard user can copy it without the
                  button. The button is the enhancement. */}
                  <Field label="Webhook URL">
                    <Input
                      readOnly
                      mono
                      value={setup.url}
                      onFocus={(event) => event.currentTarget.select()}
                    />
                  </Field>
                  <Button
                    icon={copied ? Tick02Icon : Copy01Icon}
                    reserve={["Copy", "Copied"]}
                    onClick={copy}
                  >
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>

                <Text variant="small" tone="muted">
                  Treat it like a password. Anyone who has it can send Quincy a
                  meeting, which is why the secret below is required.
                </Text>
              </div>

              {/* A real form, so Enter submits (forms.md). */}
              <form
                noValidate
                className="flex flex-col gap-kit-related"
                onSubmit={(event) => {
                  event.preventDefault()
                  save()
                }}
              >
                <Field
                  label="2. Paste the signing secret Circleback showed you"
                  error={secretError}
                >
                  <Input
                    value={secret}
                    onValueChange={(value: string) => {
                      setSecret(value)
                      if (secretError) setSecretError(undefined)
                    }}
                    mono
                    placeholder="whsec_…"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>

                <div className="flex flex-wrap items-center gap-kit-related">
                  <Button
                    type="submit"
                    disabled={!secret.trim()}
                    pending={pending}
                    pendingLabel="Saving…"
                  >
                    {setup.verified ? "Replace" : "Save"}
                  </Button>
                  <Text variant="small" tone="muted">
                    {setup.verified
                      ? "Signed deliveries are coming in."
                      : "Until this is saved, Quincy drops every delivery unread."}
                  </Text>
                </div>
              </form>

              {/* Away from Save, at the foot of the panel (removing.md). A hold,
              because disconnecting deletes the row and the URL stops
              resolving for whoever has it. */}
              <div className="flex flex-col items-start gap-kit-related">
                <HoldButton
                  onConfirm={remove}
                  pendingLabel="Disconnecting…"
                  doneLabel="Disconnected"
                >
                  Disconnect Circleback
                </HoldButton>
                <Text variant="small" tone="muted">
                  The URL stops working at once. Connecting again gives you a
                  new one, which is also how to replace it if this one leaks.
                </Text>
              </div>
            </>
          ) : null}

          {error ? (
            <Text role="status" variant="small">
              {error}
            </Text>
          ) : null}
        </>
      ) : null}
    </SourceRowFrame>
  )
}
