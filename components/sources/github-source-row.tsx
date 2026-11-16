"use client"

import * as React from "react"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import {
  answerMergeQuestion,
  disconnectGithub,
  readLastMergedPull,
  readMergeOutcome,
  saveGithubLogin,
  type GithubSetup,
  type MergeQuestion,
} from "@/app/(app)/sources/actions"
import { isSettled, MAX_ANSWER_CHARS, sayOutcome } from "@/lib/shipped-outcome"
import type { Connection } from "@/lib/sources"
import {
  Button,
  ButtonAnchor,
  Code,
  Field,
  HoldButton,
  Input,
  LiveDot,
  Text,
  TextButton,
  TextLink,
} from "@/components/kit"
import { QuincyAsks } from "@/components/quincy"
import {
  SourcePanelRule,
  SourceRowFrame,
  sourceNameId,
} from "@/components/sources/source-row"

/**
 * Connecting GitHub: one link out, and usually nothing to type. See plans/021.
 *
 * The contrast with `CirclebackSourceRow` is the whole argument for having
 * built the App rather than asking people to paste a webhook into repository
 * settings. That row has to state a numbered sequence, hand out a URL, warn
 * that the URL is a password, and take a secret back, because Circleback
 * mints the secret. Here GitHub owns the install screen, the secret belongs
 * to the deployment, and the whole flow is a link.
 *
 * One field survives, and only sometimes. An App installed on an organisation
 * knows the org's name and not the person's, so it cannot tell a merge by you
 * from a merge by a colleague, and until it can, `shippedGate` refuses
 * everything. That is stated in place rather than left to be discovered from
 * an absence of ideas.
 */

/**
 * What the install callback managed to say on its way back.
 *
 * A redirect is the only channel that flow has, so the outcome rides in the
 * query string and is read here. Without this, `?github=failed` and
 * `?github=taken` land on a page that looks exactly like one where nothing
 * happened.
 *
 * `connected` is deliberately absent: the row already shows the connection.
 * `refused` outcomes are said in ink, the rest in grey. Neither is red: a
 * refusal is not destruction (states.md).
 */
const OUTCOME: Record<string, { tone: "refused" | "note"; message: string }> = {
  failed: {
    tone: "refused",
    message:
      "GitHub sent you back without a valid installation, so nothing was connected. Try installing again.",
  },
  taken: {
    tone: "refused",
    message:
      "That installation is already connected to another Quincy account. Uninstall it there first, or install on a different GitHub account.",
  },
  unconfigured: {
    tone: "refused",
    message:
      "This deployment has no GitHub App yet, so the install could not be recorded.",
  },
  requested: {
    tone: "note",
    message:
      "Quincy asked the organisation's owner to approve the install. It connects once they do.",
  },
  "needs-login": {
    tone: "note",
    message:
      "Installed. This is an organisation, so Quincy needs to know which username is yours before it reads anything.",
  },
}

/**
 * Every three seconds, and give up after two minutes.
 *
 * The wait being covered is one model call: measured at about eight seconds
 * from press to verdict on a merge that gets refused, and about thirty on one
 * that becomes an idea. The ceiling exists for the run that dies: without it,
 * a tab left open would ask about a row that is never going to change.
 */
const POLL_INTERVAL_MS = 3000
const POLL_GIVE_UP_MS = 2 * 60 * 1000

export function GithubSourceRow({
  connection,
  setup,
  outcome,
  question,
}: {
  /** null = never connected. */
  connection: Connection | null
  setup: GithubSetup
  /** `?github=…` from the install callback. Undefined on an ordinary visit. */
  outcome?: string
  /**
   * The one thing Quincy is waiting to be told, or null. See plans/027 1c.
   * Read on the server and handed down, because the row is a client
   * component and "is anything waiting on me" is a database question.
   */
  question?: MergeQuestion | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [login, setLogin] = useState("")
  /** The username refused: shown under its field (forms.md). */
  const [loginError, setLoginError] = useState<string | undefined>()
  /** Disconnect refused: shown in the row. */
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  /**
   * The read's state lives here rather than in the offer, and that is not
   * tidiness: `readLastMergedPull` records the arrival, so the action's
   * `revalidatePath("/sources")` flips this row from `waiting` to `arriving`
   * the moment it returns. The offer only renders in the `waiting` branch, so
   * state held there would be unmounted by its own success.
   */
  const [reading, setReading] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  /** The merge being waited on, or null. Drives the poll below. */
  const [awaiting, setAwaiting] = useState<string | null>(null)

  /** `setup.connected` is the row; `connection` is only how to describe it. */
  const connected = setup.connected
  const needsLogin = connected && setup.isOrganisation && !setup.login

  /**
   * Suppressed once the person has acted, because the parameter outlives the
   * fact: a refresh after setting the username would otherwise keep saying
   * the username is missing.
   */
  const notice =
    outcome && !(outcome === "needs-login" && !needsLogin)
      ? OUTCOME[outcome]
      : undefined

  /**
   * Ask, then wait for the answer. The action returns as soon as the merge is
   * stored, which is several seconds before the workflow knows whether there
   * was a post in it, so the press has two halves: a receipt, then a verdict.
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

      setSaid("Reading it. I'll say what was in it in a moment.")
      setAwaiting(result.sourceItemId)
    })()
  }

  /**
   * Poll until the workflow has an answer, then stop. The same call
   * `RiffsRefresh` makes and for the same reason: the wait is seconds and
   * happens a handful of times a day, so a socket would be a connection held
   * open all day for it.
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
        // An idea may now exist, and /riffs is one click away: its cache
        // should not be a step behind.
        router.refresh()
        return
      }

      if (Date.now() - startedAt > POLL_GIVE_UP_MS) {
        // The run died, or is slower than anything measured. Say the true
        // thing rather than invent an outcome.
        setSaid(
          "I read the merge, but nothing has come back from the write yet. If there was a post in it, it will show up in Ideas."
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
    setLoginError(undefined)
    startTransition(async () => {
      const result = await saveGithubLogin(login)
      if (!result.ok) {
        setLoginError(result.message)
        return
      }
      setLogin("")
      setOpen(false)
    })
  }

  const remove = async () => {
    setError(null)
    const result = await disconnectGithub()
    if (!result.ok) {
      setError(result.message)
      // Thrown so the hold returns to idle for a retry.
      throw new Error(result.message)
    }
    setOpen(false)
  }

  const working = reading || awaiting !== null

  const status = needsLogin
    ? `Installed on ${setup.account}. Say which username is yours.`
    : connection?.state === "waiting"
      ? `Connected ${connection.since}. Nothing merged yet.`
      : connection?.state === "arriving"
        ? `Last merge ${connection.lastAt}.`
        : null

  const panel = open && connected
  const below =
    panel ||
    notice ||
    said ||
    working ||
    question ||
    error ||
    (!connected && !setup.installUrl) ||
    (connection?.state === "waiting" && !needsLogin)

  return (
    <SourceRowFrame
      id="github"
      name="GitHub"
      description={
        connected
          ? "Pull requests as they merge."
          : // Before connecting, the promise somebody is deciding on.
            "Each pull request as it merges. Quincy reads the description you already wrote, never the diff, and keeps the merges that carry an idea."
      }
      status={status}
      action={
        connected ? (
          <Button
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-describedby={sourceNameId("github")}
          >
            {open ? "Close" : needsLogin ? "Finish setup" : "Manage"}
          </Button>
        ) : setup.installUrl ? (
          // A link, not a button: this leaves the app, and a real anchor is
          // what lets it open in a new tab and be read as a destination.
          // ButtonAnchor rather than ButtonLink: next/link would prefetch and
          // try a client-side navigation to github.com.
          <ButtonAnchor href={setup.installUrl} pendingLabel="Opening GitHub…">
            Install on GitHub
          </ButtonAnchor>
        ) : null
      }
    >
      {below ? (
        <>
          {notice ? (
            <Text
              role="status"
              variant="small"
              tone={notice.tone === "refused" ? "ink" : "muted"}
            >
              {notice.message}
            </Text>
          ) : null}

          {!connected && !setup.installUrl ? (
            // No Install control at all, rather than a disabled one: a link
            // cannot be disabled, and this sentence is the reason.
            <Text variant="small" tone="muted">
              This deployment has no GitHub App yet. Whoever runs it makes one
              once, at <Code>/api/connect/github/app</Code>.
            </Text>
          ) : null}

          {/* The one empty state on this page with something to do. "Nothing
              merged yet" is accurate and inert, and it lands right after an
              install, with no evidence it worked. The read is bounded to one
              pull request and has its own cooldown (`readLastMergedPull`).
              Gone once answered; the answer renders below, where the state
              flip cannot take it away. */}
          {connection?.state === "waiting" && !needsLogin && !said ? (
            // An invitation inside the row's text, not a second control
            // beside Manage: the kit's TextButton, a real button in the
            // TextLink look.
            <Text variant="small" tone="muted">
              <TextButton
                onClick={readLastMerge}
                pending={working}
                pendingLabel="Reading it…"
              >
                Read my last merged pull request
              </TextButton>
            </Text>
          ) : null}

          {/* What the read said, in place rather than toasted: most answers
              are "nothing came of it, and here is why", which somebody may
              want to read twice. While the write runs, the line is Quincy
              working (states.md). */}
          {said ? (
            <Text as="div" role="status" variant="small" tone="muted">
              {awaiting ? <LiveDot pulse>{said}</LiveDot> : said}
            </Text>
          ) : null}

          {/* The one question, at row level rather than inside a state
              branch: an answer flips the row's own state, and a form inside
              the branch that drew it would be unmounted by its own success. */}
          {question ? (
            <div className="flex flex-col gap-kit-tight">
              <Text variant="small" tone="muted">
                About{" "}
                {question.url ? (
                  <TextLink
                    href={question.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {question.about}
                  </TextLink>
                ) : (
                  question.about
                )}
              </Text>
              <QuincyAsks
                question={question.text}
                rest="I couldn't find the story in this merge. One line is enough, and I'll write from it."
                answer={{
                  kind: "line",
                  label: "Your answer",
                  placeholder:
                    "The old one was throwing away a third of every note.",
                  maxLength: MAX_ANSWER_CHARS,
                  submitLabel: "Answer",
                  pendingLabel: "Writing…",
                  onAnswer: (text) =>
                    answerMergeQuestion(question.sourceItemId, text),
                }}
              />
            </div>
          ) : null}

          {panel ? (
            <>
              <SourcePanelRule />

              <Text>
                Installed on{" "}
                <strong className="font-kit-strong">{setup.account}</strong>.
                Quincy reads the title and description of pull requests{" "}
                {setup.login ? (
                  <>
                    <strong className="font-kit-strong">{setup.login}</strong>{" "}
                    merges
                  </>
                ) : (
                  "you merge"
                )}{" "}
                into the default branch. It never reads the diff.
              </Text>

              {setup.isOrganisation ? (
                // A real form, so Enter submits (forms.md).
                <form
                  noValidate
                  className="flex flex-col gap-kit-related"
                  onSubmit={(event) => {
                    event.preventDefault()
                    save()
                  }}
                >
                  <Field label="Your GitHub username" error={loginError}>
                    <Input
                      value={login}
                      onValueChange={(value: string) => {
                        setLogin(value)
                        if (loginError) setLoginError(undefined)
                      }}
                      placeholder={setup.login || "octocat"}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </Field>

                  <div className="flex flex-wrap items-center gap-kit-related">
                    <Button
                      type="submit"
                      disabled={!login.trim()}
                      pending={pending}
                      pendingLabel="Saving…"
                    >
                      {setup.login ? "Replace" : "Save"}
                    </Button>
                    <Text variant="small" tone="muted">
                      {setup.login
                        ? `Merges by ${setup.login} are being read.`
                        : "Until this is set, every merge is skipped. Quincy won't guess which of your organisation is you."}
                    </Text>
                  </div>
                </form>
              ) : null}

              {/* Away from Save, at the foot of the panel (removing.md). */}
              <div className="flex flex-col items-start gap-kit-related">
                <HoldButton
                  onConfirm={remove}
                  pendingLabel="Disconnecting…"
                  doneLabel="Disconnected"
                >
                  Disconnect GitHub
                </HoldButton>
                <Text variant="small" tone="muted">
                  Quincy stops reading merges at once. The app stays installed
                  on GitHub until you remove it there. Nothing here can
                  uninstall it, and an integration that could would be one that
                  could do it unasked.
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
