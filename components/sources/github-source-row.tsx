"use client"

import * as React from "react"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import {
  disconnectGithub,
  readLastMergedPull,
  readMergeOutcome,
  saveGithubLogin,
  type GithubSetup,
} from "@/app/(app)/sources/actions"
import { isSettled, sayOutcome } from "@/lib/shipped-outcome"
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

/**
 * Every three seconds, and give up after two minutes.
 *
 * The wait being covered is one model call — measured at about eight seconds
 * from press to verdict on a merge that gets refused, and about thirty on one
 * that becomes a riff. Three seconds is a couple of polls before the common
 * answer lands. The ceiling is well past the slow case and exists for the run
 * that dies: without it, a tab left open would ask about a row that is never
 * going to change for as long as the laptop stayed awake.
 */
const POLL_INTERVAL_MS = 3000
const POLL_GIVE_UP_MS = 2 * 60 * 1000

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
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [login, setLogin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  /**
   * The read's state lives here rather than inside `ReadLastMerge`, and that is
   * not tidiness — it is the only place it can live.
   *
   * `readLastMergedPull` now records the arrival, so the action's
   * `revalidatePath("/sources")` flips this row from `waiting` to `arriving`
   * the moment it returns. The offer only renders in the `waiting` branch, so a
   * component holding its own answer would be unmounted by its own success
   * about a second before the answer arrived — the message would appear for one
   * frame and then be gone with the branch that drew it.
   */
  const [reading, setReading] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  /** The merge being waited on, or null. Drives the poll below. */
  const [awaiting, setAwaiting] = useState<string | null>(null)

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

  /**
   * Ask, then wait for the answer.
   *
   * The action returns as soon as the merge is stored, which is several seconds
   * before the workflow knows whether there was a post in it — and "no" is the
   * commonest answer. So the press has two halves: a receipt, then a verdict.
   */
  const readLastMerge = () => {
    setSaid(null)
    setReading(true)

    void (async () => {
      const result = await readLastMergedPull()
      setReading(false)

      if (!result.ok || !result.started) {
        setSaid(result.message)
        return
      }

      setSaid("Reading it — I will say what was in it in a moment.")
      setAwaiting(result.sourceItemId)
    })()
  }

  /**
   * Poll until the workflow has an answer, then stop.
   *
   * The same call `RiffsRefresh` makes and for the same reason: the wait is
   * seconds, it happens a handful of times a day, and a socket would mean a
   * connection held open all day plus a second delivery path for state a
   * `select` already knows. The difference is that this one polls a single row
   * rather than re-rendering a page, so it is cheaper than that one.
   */
  React.useEffect(() => {
    if (!awaiting) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const startedAt = Date.now()

    const tick = async () => {
      const outcome = await readMergeOutcome(awaiting)
      if (cancelled) return

      if (isSettled(outcome)) {
        setSaid(sayOutcome(outcome))
        setAwaiting(null)
        // A riff may now exist. Nothing on this page shows one, but /riffs is
        // one click away and its cache should not be a step behind.
        router.refresh()
        return
      }

      if (Date.now() - startedAt > POLL_GIVE_UP_MS) {
        /**
         * The run died, or is slower than anything measured. Say the true thing
         * rather than a fourth outcome — a sentence that admits it does not
         * know beats the confident one this whole change removed.
         */
        setSaid(
          "I read the merge, but nothing has come back from the write yet. If there was a post in it, it will appear on /riffs."
        )
        setAwaiting(null)
        return
      }

      timer = setTimeout(tick, POLL_INTERVAL_MS)
    }

    timer = setTimeout(tick, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [awaiting, router])

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
            /**
             * The one empty state on this page with something to do.
             *
             * "Connected — nothing merged yet" is accurate and inert, and it
             * lands the moment somebody has just installed an app and has no
             * evidence it worked. An empty state should explain *and* act; this
             * one only explained. The read is bounded to a single pull request
             * and carries its own cooldown — see `readLastMergedPull`.
             */
            <div className="flex flex-col gap-1 pt-0.5">
              <p className="text-caption text-muted-foreground">
                Connected {connection.since} — nothing merged yet
              </p>
              {/* Gone once it has been answered. The answer renders below, at
                  row level, where the state flip cannot take it away. */}
              {said ? null : (
                <ReadLastMerge
                  onPress={readLastMerge}
                  pending={reading || awaiting !== null}
                />
              )}
            </div>
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
            <Button
              variant="outline"
              // The rendered element is an anchor, so Base UI needs telling —
              // without this it warns that native button semantics are gone.
              nativeButton={false}
              render={<a href={setup.installUrl} />}
            >
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

      {/* What the read said. Spelled out in place rather than toasted, because
          most of these answers are "nothing happened, and here is why" — a
          message that vanishes in four seconds is the wrong home for a reason
          somebody may want to read twice. */}
      {said ? (
        <p className="text-caption text-muted-foreground text-pretty">{said}</p>
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

/**
 * "Do not wait for the next merge — read the last one."
 *
 * A text button rather than an outline one: the row already has its primary
 * control on the right ("Manage"), and a second bordered button under the
 * status line would make the row read as two decisions. This is an offer, and
 * it should look like one.
 *
 * The offer only, with no opinion about what came of it. It used to hold that
 * too, and could not: the answer outlives the branch this renders in — see the
 * state hoisted into `GithubSourceRow`.
 */
function ReadLastMerge({
  onPress,
  pending,
}: {
  onPress: () => void
  pending: boolean
}) {
  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        className="h-auto px-0 text-muted-foreground underline underline-offset-4"
        onClick={onPress}
      >
        {pending ? "Reading it…" : "Read my last merged pull request"}
      </Button>
    </div>
  )
}
