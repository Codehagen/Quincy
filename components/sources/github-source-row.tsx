"use client"

import { useState, useTransition } from "react"

import {
  disconnectGithub,
  saveGithubLogin,
  type GithubSetup,
} from "@/app/(app)/sources/actions"
import type { Connection } from "@/lib/sources"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { HoldToConfirm } from "@/components/hold-to-confirm"
import { SourceMark } from "@/components/sources/source-mark"

/**
 * Connecting GitHub: one link out, and usually nothing to type. See plans/021.
 *
 * The contrast with `CirclebackSourceRow` is the whole argument for having
 * built the App rather than asking people to paste a webhook into repository
 * settings. That row has to state a numbered sequence, hand out a URL, warn
 * that the URL is a password, and take a secret back — because Circleback mints
 * the secret and there is no arrangement of the UI that avoids the round trip.
 * Here GitHub owns the install screen, the secret belongs to the deployment,
 * and the whole flow is a button.
 *
 * One field survives, and only sometimes. An App installed on an organisation
 * knows the org's name and not the user's, so it cannot tell a merge by you
 * from a merge by a colleague — and until it can, `shippedGate` refuses
 * everything. That is stated in place rather than left to be discovered from an
 * absence of cards.
 *
 * **No brass.** `--signal*` means a rhythm is running; a source connecting is
 * not that.
 */

/**
 * What the install callback managed to say on its way back.
 *
 * A redirect is the only channel that flow has — it has no session state to
 * write a receipt into and nothing on screen to update — so the outcome rides
 * in the query string and is read here. Without this, `?github=failed` and
 * `?github=taken` land on a page that looks exactly like one where nothing
 * happened, which is indistinguishable from a broken deploy.
 *
 * `connected` is deliberately absent: the row already shows the connection, and
 * a banner repeating what the row says is noise. Only the outcomes the row
 * cannot express get a line.
 */
const OUTCOME: Record<string, { tone: "error" | "muted"; message: string }> = {
  failed: {
    tone: "error",
    message:
      "GitHub sent Quincy back without a valid installation. Nothing was connected — try installing again.",
  },
  taken: {
    tone: "error",
    message:
      "That installation is already connected to another Quincy account. Uninstall it there first, or install on a different GitHub account.",
  },
  unconfigured: {
    tone: "error",
    message:
      "This deployment has no GitHub App configured yet, so the install could not be recorded.",
  },
  requested: {
    tone: "muted",
    message:
      "Quincy asked the organisation's owner to approve the install. It will connect once they do.",
  },
  "needs-login": {
    tone: "muted",
    message:
      "Installed. Because this is an organisation, Quincy needs to know which username is yours before it reads anything.",
  },
}

export function GithubSourceRow({
  connection,
  setup,
  outcome,
}: {
  /** null = never connected. */
  connection: Connection | null
  setup: GithubSetup
  /** `?github=…` from the install callback. Undefined on an ordinary visit. */
  outcome?: string
}) {
  const [open, setOpen] = useState(false)
  const [login, setLogin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  /**
   * `setup.connected` is the row; `connection` is only how to describe it.
   *
   * This used to be `connection !== null`, which gave the component a second
   * opinion about a fact the server had already settled — and the two
   * disagreed. `connection` comes from `getSourceConnections()`, a map keyed by
   * source that is allowed to be missing a key for a source that is genuinely
   * connected, so a real installation rendered an Install button. One fact,
   * one source.
   */
  const connected = setup.connected
  const needsLogin = connected && setup.isOrganisation && !setup.login

  /**
   * Suppressed once the user has acted, because the parameter outlives the
   * fact. It stays in the URL until the next navigation, so a refresh after
   * setting the username would otherwise keep insisting the username is
   * missing — a notice that contradicts the row beside it is worse than none.
   */
  const notice =
    outcome && !(outcome === "needs-login" && !needsLogin)
      ? OUTCOME[outcome]
      : undefined

  const save = () => {
    setError(null)
    startTransition(async () => {
      const result = await saveGithubLogin(login)
      if (!result.ok) {
        setError(result.message)
        return
      }
      setLogin("")
      setOpen(false)
    })
  }

  const remove = async () => {
    const result = await disconnectGithub()
    if (!result.ok) {
      setError(result.message)
      return
    }
    setOpen(false)
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-3">
      <div className="flex items-center gap-3">
        <SourceMark id="github" label="GitHub" />

        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-card-title">GitHub</p>
          <p className="text-caption text-muted-foreground text-pretty">
            Pull requests as they merge
          </p>

          {/* The state a phone can read. The desktop column is `sm:` only, and
              without this a 390px row cannot tell "installed and waiting" from
              "material arriving" — the distinction the page exists to draw. */}
          {needsLogin ? (
            <p className="text-caption text-muted-foreground pt-0.5 text-pretty">
              Installed on {setup.account} — say which username is yours
            </p>
          ) : connection?.state === "waiting" ? (
            <p className="text-caption text-muted-foreground pt-0.5">
              Connected {connection.since} — nothing merged yet
            </p>
          ) : connection?.state === "arriving" ? (
            <p className="text-caption text-muted-foreground pt-0.5">
              Last merge {connection.lastAt}
            </p>
          ) : null}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {connected ? (
            <Button
              variant="ghost"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
            >
              {open ? "Close" : needsLogin ? "Finish setup" : "Manage"}
            </Button>
          ) : setup.installUrl ? (
            /* A link, not a button with an onClick. This leaves the app
               entirely, and a real anchor is what lets it be opened in a new
               tab, middle-clicked, and read by a screen reader as a
               destination rather than an action. */
            <Button variant="outline" render={<a href={setup.installUrl} />}>
              Install on GitHub
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
              ? "text-destructive text-caption text-pretty"
              : "text-caption text-muted-foreground text-pretty"
          }
        >
          {notice.message}
        </p>
      ) : null}

      {!connected && !setup.installUrl ? (
        <p className="text-caption text-muted-foreground text-pretty">
          This deployment has no GitHub App yet. Whoever runs it creates one
          once, at <code className="font-mono">/api/connect/github/app</code>.
        </p>
      ) : null}

      {open && connected ? (
        /* Derived nested radius: the list around this is `rounded-xl` (20px)
           with 16px of padding, so a child sits at `rounded-xs` (4px). See
           AGENTS.md — inner = outer − padding. */
        <div className="bg-muted flex flex-col gap-4 rounded-xs p-4">
          <p className="text-caption text-foreground text-pretty">
            Installed on <span className="font-medium">{setup.account}</span>.
            Quincy reads the title and the description of pull requests{" "}
            {setup.login ? (
              <>
                <span className="font-medium">{setup.login}</span> merges
              </>
            ) : (
              "you merge"
            )}{" "}
            into the default branch. It never reads the diff.
          </p>

          {setup.isOrganisation ? (
            /* A real form, so Enter submits — AGENTS.md on forms. */
            <form
              onSubmit={(event) => {
                event.preventDefault()
                save()
              }}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="github-login">
                    Your GitHub username
                  </FieldLabel>
                  <Input
                    id="github-login"
                    value={login}
                    onChange={(event) => setLogin(event.target.value)}
                    placeholder={setup.login || "octocat"}
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono text-xs"
                  />
                </Field>

                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={pending || !login.trim()}>
                    {pending ? "Saving…" : setup.login ? "Replace" : "Save"}
                  </Button>

                  {setup.login ? (
                    <p className="text-caption text-muted-foreground">
                      Merges by {setup.login} are being read.
                    </p>
                  ) : (
                    <p className="text-caption text-muted-foreground text-pretty">
                      Until this is set, every merge is skipped — Quincy will
                      not guess which of your organisation is you.
                    </p>
                  )}
                </div>
              </FieldGroup>
            </form>
          ) : null}

          {error ? (
            <p className="text-destructive text-caption text-pretty">{error}</p>
          ) : null}

          {/* Away from the confirm button above, per AGENTS.md on forms. */}
          <div className="border-border/60 flex flex-col gap-2 border-t pt-3">
            <HoldToConfirm onConfirm={remove} doneLabel="Disconnected">
              Disconnect GitHub
            </HoldToConfirm>
            <p className="text-caption text-muted-foreground text-pretty">
              Quincy stops reading merges immediately. The app stays installed
              on GitHub until you remove it there — nothing here can uninstall
              it, and an integration that could would be one that could do it
              unasked.
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
