"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons"

import {
  answerMergeQuestion,
  disconnectCircleback,
  disconnectGithub,
  importFromX,
  readLastMergedPull,
  readMergeOutcome,
  saveCirclebackSecret,
  saveGithubLogin,
  startCirclebackSetup,
  type ImportFromXReceipt,
} from "@/app/(app)/sources/actions"
import { disableRhythm, enableRhythm, runRhythmNow } from "@/app/(app)/rhythm/actions"
import {
  Button,
  ButtonAnchor,
  ButtonLink,
  Code,
  Field,
  HoldButton,
  Input,
  Switch,
  Text,
  TextLink,
} from "@/components/kit"
import { Friend } from "@/components/mascot"
import { QuincyAsks } from "@/components/quincy"
import { disconnectSentence, isConnected, type ConnectorDetail } from "@/lib/connectors"
import { isSettled, MAX_ANSWER_CHARS, sayOutcome } from "@/lib/shipped-outcome"

import { useConnector } from "./connector-context"

/**
 * Every verb a connector has, each through the server action or route that
 * already carries its guards: the entitlement gate, the cooldown, the
 * ceiling on what one press buys. Nothing here adds a spend or loosens one.
 *
 * Each connector's verbs own their pending state and their receipt, in
 * place, never in a toast: what a read found is the product of the press,
 * and it should still be on screen when the eye comes back.
 *
 * Mounted under the pane's sentence (connector-pane.tsx). The one verb that
 * leaves the app (Connect, Install, Reconnect) is `Connector.Primary`, above
 * these; a verb that runs here (Connect Circleback, a form, a switch) is in
 * these, ink when the page gives it the ink.
 */
export function ConnectorVerbs() {
  const { connector: c } = useConnector()
  switch (c.detail.id) {
    case "github":
      return <GithubVerbs detail={c.detail} />
    case "circleback":
      return <CirclebackVerbs detail={c.detail} />
    case "x-posts":
      return <XPostsVerbs detail={c.detail} />
    case "x-bookmarks":
      return <BookmarksVerbs />
    case "channel":
      return <ChannelVerbs detail={c.detail} />
    case "none":
      return c.id === "voice" ? (
        <Verbs>
          <ButtonLink href="/ideas" size="sm">
            Record on Ideas
          </ButtonLink>
        </Verbs>
      ) : null
  }
}

/* ── Layout ───────────────────────────────────────────────────────── */

/**
 * The verbs as quiet pills side by side, so their labels hold one left edge
 * with the text above. A hairline over them divides; it does not lift.
 */
function Verbs({ children, below }: { children: React.ReactNode; below?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-kit-related border-t border-kit-hairline pt-kit-group">
      <div className="flex flex-wrap items-center gap-kit-controls">{children}</div>
      {below}
    </div>
  )
}

/** A section under its own hairline: a form, a question, a step. */
function Section({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-kit-related border-t border-kit-hairline pt-kit-group">{children}</div>
}

/**
 * Disconnect: a hold, last, under its own hairline, away from every other
 * verb (removing.md). `onConfirm` throws on a refusal so the hold returns to
 * idle for a retry; the refusal is said in ink beside it.
 */
function Disconnect({
  label,
  note,
  onConfirm,
}: {
  label: string
  note?: React.ReactNode
  onConfirm: () => Promise<void>
}) {
  const { connector: c } = useConnector()
  const [error, setError] = React.useState<string | null>(null)
  return (
    <div className="flex flex-col items-start gap-kit-related border-t border-kit-hairline pt-kit-group">
      <Text variant="small" tone="muted">
        {disconnectSentence(c)} {note}
      </Text>
      <HoldButton
        onConfirm={async () => {
          setError(null)
          try {
            await onConfirm()
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : `${c.name} could not be disconnected. Try again.`)
            throw cause
          }
        }}
        pendingLabel="Disconnecting…"
        doneLabel="Disconnected"
      >
        {label}
      </HoldButton>
      {error ? (
        // `alert`: a failed disconnect means Quincy can still read or speak for you.
        <div role="alert">
          <Text variant="small">{error}</Text>
        </div>
      ) : null}
    </div>
  )
}

/** Throws the refusal's words, so the hold goes back to idle and Disconnect can say them. */
async function orThrow(result: Promise<{ ok: true } | { ok: false; message: string }>) {
  const r = await result
  if (!r.ok) throw new Error(r.message)
}

/* ── GitHub ───────────────────────────────────────────────────────── */

/**
 * What the install callback said on its way back. A redirect is the only
 * channel that flow has, so it rides in `?github=`. Refusals in ink, notes
 * in grey; neither red.
 */
const GITHUB_OUTCOME: Record<string, { tone: "ink" | "muted"; message: string }> = {
  failed: {
    tone: "ink",
    message: "GitHub sent you back without a valid installation, so nothing was connected. Try installing again.",
  },
  taken: {
    tone: "ink",
    message:
      "That installation is already connected to another Quincy account. Uninstall it there first, or install on a different GitHub account.",
  },
  unconfigured: { tone: "ink", message: "This deployment has no GitHub App yet, so the install could not be recorded." },
  requested: { tone: "muted", message: "I asked the organisation's owner to approve the install. It connects once they do." },
  "needs-login": {
    tone: "muted",
    message: "Installed. This is an organisation, so I need to know which username is yours before I read anything.",
  },
}

/**
 * Every three seconds, giving up after two minutes. The wait is one model
 * call (about 8s to a refusal, 30s to an idea); the ceiling is for the run
 * that dies, so an open tab stops asking about a row that will not change.
 */
const POLL_INTERVAL_MS = 3000
const POLL_GIVE_UP_MS = 2 * 60 * 1000

function GithubVerbs({ detail }: { detail: Extract<ConnectorDetail, { id: "github" }> }) {
  const { connector: c, isAction } = useConnector()
  const router = useRouter()
  const st = c.status.s
  const connected = isConnected(c)
  const needsLogin = st === "setup"

  const notice =
    detail.outcome && !(detail.outcome === "needs-login" && !needsLogin) ? GITHUB_OUTCOME[detail.outcome] : undefined

  /* Read my last merge: a receipt, then a verdict (readLastMergedPull, one PR, its own cooldown). */
  const [reading, setReading] = React.useState(false)
  const [said, setSaid] = React.useState<string | null>(null)
  const [awaiting, setAwaiting] = React.useState<string | null>(null)

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
        router.refresh()
        return
      }
      if (Date.now() - startedAt > POLL_GIVE_UP_MS) {
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

  /* The username, on an organisation install. */
  const [login, setLogin] = React.useState("")
  const [loginError, setLoginError] = React.useState<string | undefined>()
  const [saving, startSaving] = React.useTransition()
  const save = () => {
    setLoginError(undefined)
    startSaving(async () => {
      const result = await saveGithubLogin(login)
      if (!result.ok) {
        setLoginError(result.message)
        return
      }
      setLogin("")
    })
  }

  const working = reading || awaiting !== null

  return (
    <>
      {notice ? (
        <Text role="status" variant="small" tone={notice.tone}>
          {notice.message}
        </Text>
      ) : null}

      {st === "off" ? (
        <Text variant="small" tone="muted">
          It is made once at <Code>/api/connect/github/app</Code>.
        </Text>
      ) : null}

      {/* The one question, at the connector rather than inside a state branch:
          an answer flips the state, and a form inside the branch that drew it
          would be unmounted by its own success. */}
      {detail.question ? (
        <Section>
          <Text variant="small" tone="muted">
            About{" "}
            {detail.question.url ? (
              <TextLink href={detail.question.url} target="_blank" rel="noreferrer">
                {detail.question.about}
              </TextLink>
            ) : (
              detail.question.about
            )}
          </Text>
          <QuincyAsks
            question={detail.question.text}
            rest="One line is enough, and I'll write from it."
            isAction={isAction}
            answer={{
              kind: "line",
              label: "Your answer",
              placeholder: "The old one was throwing away a third of every note.",
              maxLength: MAX_ANSWER_CHARS,
              submitLabel: "Answer",
              pendingLabel: "Writing…",
              onAnswer: (text) => answerMergeQuestion(detail.question!.sourceItemId, text),
            }}
          />
        </Section>
      ) : null}

      {connected ? (
        <Section>
          {/* On a half-set-up org install the sentence above already says where
              it is installed; the field is what is left to say. */}
          {needsLogin ? null : (
          <Text tone="muted">
            Installed on <strong className="font-kit-strong text-kit-ink">{detail.account}</strong>. I read the title and
            description of pull requests{" "}
            {detail.login ? (
              <>
                <strong className="font-kit-strong text-kit-ink">{detail.login}</strong> merges
              </>
            ) : (
              "you merge"
            )}{" "}
            into the default branch, never the diff.
          </Text>
          )}

          {detail.isOrganisation ? (
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
                  placeholder={detail.login || "octocat"}
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              <div className="flex flex-wrap items-center gap-kit-related">
                <Button
                  type="submit"
                  variant={needsLogin && isAction ? "action" : "quiet"}
                  disabled={!login.trim()}
                  pending={saving}
                  pendingLabel="Saving…"
                >
                  {detail.login ? "Replace" : "Save"}
                </Button>
                <Text variant="small" tone="muted">
                  {detail.login
                    ? `Merges by ${detail.login} are being read.`
                    : "Until this is set, every merge is skipped. I won't guess which of your organisation is you."}
                </Text>
              </div>
            </form>
          ) : null}
        </Section>
      ) : null}

      {connected ? (
        <Verbs
          below={
            said ? (
              // What the read said, in place: most answers are "nothing came of
              // it, and here is why", which somebody may want to read twice.
              <Text as="div" role="status" variant="small" tone="muted">
                {awaiting ? <span className="inline-flex items-center gap-2"><Friend size={20} state="reading" className="shrink-0" /><span className="min-w-0">{said}</span></span> : said}
              </Text>
            ) : null
          }
        >
          {/* The empty state's missing verb, while nothing has merged yet:
              one pull request, with its own cooldown (readLastMergedPull). */}
          {st === "waiting" ? (
            <Button size="sm" onClick={readLastMerge} pending={working} pendingLabel="Reading it…">
              Read my last merge
            </Button>
          ) : null}
          <ButtonLink href="/rhythm/shipped-work" size="sm">
            What reads it
          </ButtonLink>
        </Verbs>
      ) : null}

      {connected ? (
        <Disconnect
          label="Disconnect GitHub"
          note="The app stays installed on GitHub until you remove it there."
          onConfirm={() => orThrow(disconnectGithub())}
        />
      ) : null}
    </>
  )
}

/* ── Circleback ───────────────────────────────────────────────────── */

/**
 * A URL out, a secret back (plans/019). Circleback mints the secret and
 * shows it only after the automation exists, so the two steps are stated
 * and numbered rather than hidden.
 */
function CirclebackVerbs({ detail }: { detail: Extract<ConnectorDetail, { id: "circleback" }> }) {
  const { connector: c, isAction } = useConnector()
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  const [secret, setSecret] = React.useState("")
  const [secretError, setSecretError] = React.useState<string | undefined>()
  const [copied, setCopied] = React.useState(false)

  const begin = () => {
    setError(null)
    startTransition(async () => {
      // Idempotent: a second press returns the same URL (startCirclebackSetup).
      const result = await startCirclebackSetup()
      if (!result.ok) setError(result.message)
    })
  }

  const copy = async () => {
    if (!detail.url) return
    try {
      await navigator.clipboard.writeText(detail.url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // A refused clipboard is not worth a line: the URL is on screen and selectable.
      setCopied(false)
    }
  }

  const save = () => {
    setSecretError(undefined)
    startTransition(async () => {
      const result = await saveCirclebackSecret(secret)
      if (!result.ok) {
        setSecretError(result.message)
        return
      }
      setSecret("")
    })
  }

  if (c.status.s === "available" || !detail.url) {
    return (
      <div className="flex flex-col items-start gap-kit-related">
        <Button variant={isAction ? "action" : "quiet"} onClick={begin} pending={pending} pendingLabel="Connecting…">
          Connect
        </Button>
        {error ? (
          <Text role="status" variant="small">
            {error}
          </Text>
        ) : null}
      </div>
    )
  }

  const asking = c.status.s === "setup" || c.status.s === "failed"

  return (
    <>
      <Section>
        <Text>1. In Circleback, make an automation that sends a webhook request, and paste this URL into it.</Text>
        <div className="flex items-end gap-kit-controls">
          {/* Readonly rather than a styled div: selectable, focusable, copyable without the button. */}
          <Field label="Webhook URL">
            <Input readOnly mono value={detail.url} onFocus={(event) => event.currentTarget.select()} />
          </Field>
          <Button icon={copied ? Tick02Icon : Copy01Icon} reserve={["Copy", "Copied"]} onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <Text variant="small" tone="muted">
          Treat it like a password. Anyone who has it can send me a meeting, which is why the secret below is required.
        </Text>
        <form
          noValidate
          className="flex flex-col gap-kit-related"
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <Field label="2. Paste the signing secret Circleback showed you" error={secretError}>
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
              variant={asking && isAction ? "action" : "quiet"}
              disabled={!secret.trim()}
              pending={pending}
              pendingLabel="Saving…"
            >
              {detail.verified ? "Replace" : "Save"}
            </Button>
            <Text variant="small" tone="muted">
              {detail.verified ? "Signed deliveries are coming in." : "Until this is saved, I drop every delivery unread."}
            </Text>
          </div>
        </form>
      </Section>
      <Disconnect
        label="Disconnect Circleback"
        note="The URL stops working at once. Connecting again gives you a new one."
        onConfirm={() => orThrow(disconnectCircleback())}
      />
    </>
  )
}

/* ── Your X posts ─────────────────────────────────────────────────── */

/**
 * The read-back (plans/011): a person pressing a button, not a rhythm.
 * `importFromX` holds the gate, the 10-minute cooldown and the 100-post
 * ceiling. While it runs the line is Quincy working (the friend reading,
 * beside the words).
 */
function XPostsVerbs({ detail }: { detail: Extract<ConnectorDetail, { id: "x-posts" }> }) {
  const { connector: c, isAction } = useConnector()
  const [pending, startTransition] = React.useTransition()
  const [receipt, setReceipt] = React.useState<ImportFromXReceipt | null>(null)
  if (c.status.s === "needs") return null

  const run = () => {
    setReceipt(null)
    startTransition(async () => {
      setReceipt(await importFromX())
    })
  }

  return (
    <Verbs
      below={
        <div aria-live="polite">
          {pending ? (
            <Text as="div" variant="small" tone="muted">
              <span className="inline-flex items-center gap-2">
                <Friend size={20} state="reading" className="shrink-0" />
                <span className="min-w-0">
                  Reading your posts.
                </span>
              </span>
            </Text>
          ) : receipt?.ok ? (
            <Text variant="small" tone="muted">
              Read {receipt.postsRead === 0 && receipt.imported === 0 ? "nothing new" : `${receipt.postsRead} posts`}
              {receipt.truncated ? ". More remain, so import again for older ones" : ""}
              {receipt.rulesWritten > 0 || receipt.storiesWritten > 0
                ? `. ${receipt.rulesWritten} voice rules, ${receipt.storiesWritten} stories.`
                : receipt.skipped > 0
                  ? ". Your edited pages were left alone; the findings wait on them."
                  : "."}
            </Text>
          ) : receipt ? (
            // A refusal, in ink, where the action was. Not red: nothing was destroyed.
            <Text role="status" variant="small">
              {receipt.message}
            </Text>
          ) : null}
        </div>
      }
    >
      <Button
        size="sm"
        variant={isAction ? "action" : "quiet"}
        onClick={run}
        pending={pending}
        pendingLabel="Reading…"
      >
        {detail.items > 0 ? "Import again" : "Import posts"}
      </Button>
      <ButtonLink href="/brain" size="sm">
        See what I learned
      </ButtonLink>
    </Verbs>
  )
}

/* ── X bookmarks ──────────────────────────────────────────────────── */

const BOOKMARKS = "bookmarks-to-posts"

/**
 * The Bookmarks rhythm, seen from its material. The switch is the
 * subscription (enableRhythm / disableRhythm keep the time you chose);
 * "Read them now" is `runRhythmNow`, with its entitlement gate, its claim
 * and `MANUAL_RUN_COOLDOWN_MS`; the time is set on the rhythm's own page,
 * which is where every rhythm's time is set.
 */
function BookmarksVerbs() {
  const { connector: c, isAction } = useConnector()
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [said, setSaid] = React.useState<{ ok: boolean; message: string } | null>(null)
  const [running, startRun] = React.useTransition()
  const st = c.status.s
  if (st === "needs" || st === "reauth") return null

  const enable = (on: boolean) => {
    setSaid(null)
    startTransition(async () => {
      const result = on ? await enableRhythm({ rhythmId: BOOKMARKS }) : await disableRhythm(BOOKMARKS)
      if (!result.ok) setSaid({ ok: false, message: result.message })
      router.refresh()
    })
  }

  const runNow = () => {
    setSaid(null)
    startRun(async () => {
      const result = await runRhythmNow(BOOKMARKS)
      setSaid({ ok: result.ok, message: result.message ?? (result.ok ? "Done." : "") })
      router.refresh()
    })
  }

  const receipt = said ? (
    <Text role="status" variant="small" tone={said.ok ? "muted" : "ink"}>
      {said.message}
    </Text>
  ) : null

  if (st === "available") {
    return (
      <div className="flex flex-col items-start gap-kit-related">
        <Button variant={isAction ? "action" : "quiet"} onClick={() => enable(true)} pending={pending} pendingLabel="Switching on…">
          Read them daily
        </Button>
        {receipt}
      </div>
    )
  }

  const on = c.detail.id === "x-bookmarks" && c.detail.enabled
  return (
    <>
      {/* The switch beside its own words, the whole row its label. */}
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-kit-related select-none">
        <span className="text-kit-body text-kit-ink">Read them daily</span>
        <Switch aria-label={`Read them daily: ${c.name}`} checked={on} disabled={pending} onCheckedChange={enable} />
      </label>
      <Verbs
        below={
          running ? (
            <Text as="div" variant="small" tone="muted">
              <span className="inline-flex items-center gap-2">
                <Friend size={20} state="reading" className="shrink-0" />
                <span className="min-w-0">
                  Reading your bookmarks.
                </span>
              </span>
            </Text>
          ) : (
            receipt
          )
        }
      >
        <Button
          size="sm"
          variant={st === "failed" && isAction ? "action" : "quiet"}
          onClick={runNow}
          pending={running}
          pendingLabel="Reading…"
        >
          Read them now
        </Button>
        <ButtonLink href={`/rhythm/${BOOKMARKS}`} size="sm">
          Change the time
        </ButtonLink>
      </Verbs>
    </>
  )
}

/* ── Channels ─────────────────────────────────────────────────────── */

/** Where to take the permission away at the source. */
const REVOKE_AT: Record<string, { label: string; href: string }> = {
  linkedin: {
    label: "LinkedIn permitted services",
    href: "https://www.linkedin.com/mypreferences/d/data-sharing-with-third-parties",
  },
  x: { label: "X connected apps", href: "https://x.com/settings/connected_apps" },
}

/**
 * Whether Quincy may speak for you on one channel. Connect and Reconnect
 * leave for the consent screen (`Connector.Primary`); topics and times have
 * their own page; disconnecting deletes the stored credentials
 * (`POST /api/connect/:p/disconnect`).
 */
function ChannelVerbs({ detail }: { detail: Extract<ConnectorDetail, { id: "channel" }> }) {
  const { connector: c } = useConnector()
  const router = useRouter()
  const connected = isConnected(c)
  const revoke = REVOKE_AT[detail.platform]

  const disconnect = async () => {
    const response = await fetch(`/api/connect/${detail.platform}/disconnect`, { method: "POST" })
    if (!response.ok) {
      throw new Error(
        response.status === 401
          ? "Your session ended. Sign in again, then disconnect."
          : `${c.name} could not be disconnected (${response.status}). Try again.`
      )
    }
    router.refresh()
  }

  // Topics and times once there is something to set them for: a connection,
  // or a strategy already written (in Studio) for a channel not connected.
  // Before that, Connect is the one verb, as on the old Channels page.
  const strategy = connected || detail.strategy
  if (!strategy && !connected) return null

  return (
    <>
      {connected && detail.handle ? (
        <Text variant="small" tone="muted">
          Connected as {detail.displayName ? `${detail.displayName}, ` : ""}
          {detail.handle}.
        </Text>
      ) : null}
      <Verbs>
        {strategy ? (
          <ButtonLink href={`/connectors/${detail.platform}`} size="sm">
            Topics and times
          </ButtonLink>
        ) : null}
        {connected && c.status.s !== "reauth" ? (
          <ButtonAnchor href={`/api/connect/${detail.platform}`} size="sm" pendingLabel="Opening…">
            Reconnect
          </ButtonAnchor>
        ) : null}
      </Verbs>
      {connected ? (
        <Disconnect
          label={`Disconnect ${c.name}`}
          note={
            revoke ? (
              <>
                You can also remove Quincy from{" "}
                <TextLink href={revoke.href} target="_blank" rel="noreferrer noopener">
                  {revoke.label}
                  <span className="sr-only"> (opens in a new tab)</span>
                </TextLink>
                .
              </>
            ) : null
          }
          onConfirm={disconnect}
        />
      ) : null}
    </>
  )
}

