"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"

/**
 * Types only. `lib/onboarding.ts` imports `db`, so a value import here would
 * drag drizzle and a connection string into the client bundle — which is why
 * the proposed sentence arrives as a prop rather than being computed in place.
 */
import type {
  CorpusReceipt,
  Suggestion,
  WiringState,
} from "@/lib/onboarding"
import {
  Button,
  ButtonAnchor,
  Card,
  Composer,
  Lead,
  List,
  ListRow,
  Rule,
  Tag,
  Text,
} from "@/components/kit"
import { ReplyActions } from "@/components/quincy"
import {
  PlatformMark,
  hasPlatformMark,
} from "@/components/channels/platform-mark"
import {
  ARRIVES,
  QuincyTurn,
  Refusal,
  UserTurn,
  Working,
} from "@/components/welcome/turn"
import {
  ComposerSlot,
  useWelcomeActions,
} from "@/components/welcome/welcome-actions"

/**
 * The wiring, after the talking. See plans/022 for the shape this started as,
 * and plans/025 for why it stopped being a form.
 *
 * **The seam is gone, and that is the change.** The first version put every ask
 * on one screen at once, on the argument that a permission grant and a dollar
 * of spend are not conversation. That argument was right about the *asking* and
 * wrong about everything after it: connecting X used to leave you looking at a
 * second button, "Read my posts", on the same settings screen — so the reward
 * for granting the largest permission in the product was another chore.
 *
 * Now the grant is the last thing a person is asked for on this screen. Coming
 * back from X, Quincy reads, and then says what it learned. The order is
 * deliberate:
 *
 * - **The read starts itself.** Its consent was bought at the X grant, whose
 *   sentence says so — `alsoBuys` in lib/onboarding.ts is "Reading your last
 *   N posts to learn how you write", and it is on screen before the person
 *   presses Connect. A second press to collect something already agreed to is a
 *   confirmation dialog wearing a card.
 * - **The receipt is what Quincy now knows, not what it did.** "Read 187 posts,
 *   wrote 9 rules" is a receipt for work. The portrait is evidence of
 *   understanding, and it is the first moment in first run where the product
 *   demonstrates something rather than promising it.
 * - **The price is not on this screen.** It is a cost of running Quincy, not a
 *   line item the person is being quoted; it stays in `docs/billing.md` and on
 *   /credits, where spend belongs.
 *
 * **The corpus read is still not a source row.** It is what the X consent
 * already bought, so it belongs to the channels section. `lib/sources.ts`
 * refuses to list channels as sources for the same reason: a screen that asks
 * for X twice has misread the product.
 */
export function Wiring({
  wiring,
  corpusItems,
  receipt,
  /**
   * Defaulted, and the default is load-bearing rather than tidy.
   *
   * A missing array here read `undefined.length` and threw inside render, which
   * React answers by unmounting the tree — so first run went completely blank,
   * header and all, with the failure visible only in the browser console. One
   * absent prop should cost the section that uses it, never the page.
   *
   * It goes missing whenever the server payload and this bundle disagree about
   * the props, which in practice means any half-applied edit: a hot reload that
   * updated the client chunk before the server one, or a `git stash` across a
   * running dev server. That is a development-only cause with a production-shaped
   * consequence, and the guard costs two characters.
   */
  suggestions = [],
  addition,
  hasMaterial,
  materialAsk,
  githubConnected,
  githubInstallUrl,
  circlebackConnected,
}: {
  wiring: WiringState
  corpusItems: number
  /** What a previous read learned. Present on a return visit. */
  receipt: CorpusReceipt | null
  /** The angles the material ask paid for. Empty is a real answer. */
  suggestions?: Suggestion[]
  /** The sentence Quincy would add to My Human. Computed server-side. */
  addition: string | null
  /** True once a riff exists, which is the only thing the material ask writes. */
  hasMaterial: boolean
  /** Named by the corpus where there is one, plain where there is not. */
  materialAsk: string
  githubConnected: boolean
  githubInstallUrl: string | null
  circlebackConnected: boolean
}) {
  const router = useRouter()
  const actions = useWelcomeActions()
  const [leaving, setLeaving] = React.useState<"finish" | "skip" | null>(null)

  /**
   * One filled button in view: the first channel still outstanding.
   *
   * `soon` is excluded, or the emphasis would move to LinkedIn the moment X is
   * connected — pointing the eye at the one row on this screen that has nothing
   * to press.
   */
  const nextChannel = wiring.channels.find(
    (c) => !c.connected && c.connectable && !c.soon
  )?.id

  /**
   * Which angle the exit button writes. Defaults to the first, so the button
   * always means something without anybody having to choose.
   */
  const [picked, setPicked] = React.useState<string | null>(null)
  const chosen = picked ?? suggestions[0]?.id ?? null

  /** A refusal from `draftAngle`, shown rather than swallowed. */
  const [refusal, setRefusal] = React.useState<string | null>(null)

  /**
   * Whether the channels step is behind us, and therefore whether the material
   * ask may appear.
   *
   * **One decision on screen at a time.** Earlier steps stay visible as
   * history — that is what makes this a conversation rather than a wizard — but
   * a step only appears because the one above it resolved. Without that, first
   * run asks for a channel, this week's work and a GitHub install in the same
   * paint, and the person has to decide where to start. That is the wall this
   * screen was rebuilt to remove, and it came back through this flag.
   *
   * **A corpus already read is the only thing that opens it for free.** It used
   * to open whenever X was *not* connectable either, on the reasoning that no
   * read was coming so nothing was worth waiting for. True, and it skipped the
   * step rather than sequencing it. Somebody who will not connect X now says so
   * — see the skip beside the channels card — and saying so is itself the
   * decision that advances them.
   *
   * `CorpusRead` closes the last gap by calling `onSettled` when its read lands
   * or is skipped, because a failed read never changes server state.
   */
  const [settled, setSettled] = React.useState(() => corpusItems > 0)
  const settle = React.useCallback(() => setSettled(true), [])

  /**
   * First run ends with a draft that exists, not with a promise of one.
   *
   * The button used to set `onboardedAt` and push to /ideas, which handed
   * somebody a list of angles and asked them to start working. Everything
   * before it on this screen — the read, the portrait, the suggestions — is
   * Quincy demonstrating that it understands you, and then the last thing it
   * did was give you homework.
   *
   * So it writes first and leaves second. `draftAngle` is the same action
   * /ideas uses, unchanged: it carries the entitlement gate, it reads the hook
   * from the row rather than trusting the client, and it is idempotent on the
   * hook — a second press after a slow response returns the existing draft
   * instead of paying twice.
   *
   * **A refused draft does not move you on.** Landing in Drafts with nothing in
   * it is worse than staying here with a sentence explaining why, and the retry
   * is the same button.
   */
  async function leave(where: "finish" | "skip") {
    if (leaving) return
    setLeaving(where)
    setRefusal(null)

    // A server action that never answers (offline, a deploy mid-request)
    // throws here. Without the catch the button would say "Writing it…"
    // for good; with it, the same button is the retry.
    try {
      if (where === "skip") {
        await actions.skipFirstRun()
        router.push("/studio")
        return
      }

      if (chosen) {
        const result = await actions.draftAngle({ angleId: chosen })

        if (!result.ok) {
          setRefusal(result.message)
          setLeaving(null)
          return
        }

        await actions.finishFirstRun()
        router.push("/drafts")
        return
      }

      // No angles — the model call behind question four failed, and there is
      // nothing to write. Ideas (/ideas) is where the material still is.
      await actions.finishFirstRun()
      router.push("/ideas")
    } catch {
      setRefusal("That did not reach Quincy. Try again.")
      setLeaving(null)
    }
  }


  return (
    <div className="flex w-full flex-col gap-kit-page-gap pb-kit-group">
      {/* No heading of its own. "That is the talking done" is said in the
          conversation this sits underneath, by Quincy, as a turn — a screen
          that announces itself again directly below the sentence announcing it
          reads as two different products introducing the same thing twice. */}
      <section aria-labelledby="wiring-channels" className="flex flex-col gap-kit-related">
        <SectionHead
          id="wiring-channels"
          title="Where the writing goes out"
          rest="I publish nowhere you have not handed me, and never without you pressing send."
        />

        {/* Ruled, not just gapped. X's "also unlocks" line sits directly
            above LinkedIn's row and reads as LinkedIn's without a rule, and
            that is the one sentence here that must not be misattributed. */}
        <Card>
          {wiring.channels.map((channel, index) => (
            <React.Fragment key={channel.id}>
              {index > 0 ? <Rule /> : null}
              <ChannelRow
                channel={channel}
                // One ink pill in view (docs/design/actions.md): the next
                // channel, unless an angle is waiting to be written, which
                // is the further step and wins.
                emphasise={channel.id === nextChannel && !chosen}
              />
            </React.Fragment>
          ))}
        </Card>

        {/**
         * The way past this step without granting anything.
         *
         * Only while it is the live step — once the read has happened or the
         * person has moved on, offering to skip something already behind them
         * is noise. Quiet, because connecting is the recommendation and this is
         * the door beside it, not a second option of equal weight.
         */}
        {!settled && !wiring.corpusOfferable ? (
          <div>
            <Button onClick={settle}>
              I will connect it later
            </Button>
          </div>
        ) : null}
      </section>

      {/* The read, as turns rather than cards. Only once X is granted, because
          it runs through that grant. */}
      {wiring.corpusOfferable ? (
        <CorpusRead
          alreadyRead={corpusItems}
          receipt={receipt}
          addition={addition}
          onSettled={settle}
        />
      ) : null}

      {/* Then, and only then, the ask. */}
      {settled ? (
        <MaterialStep
          ask={materialAsk}
          hasMaterial={hasMaterial}
          suggestions={suggestions}
          selectedId={chosen}
          onSelect={setPicked}
        />
      ) : null}

      {/**
       * And GitHub last, once there is material.
       *
       * It is the only step that is about *tomorrow* rather than about the
       * draft being written now, so it earns its place after the payoff. Shown
       * before the material lands, it was the third ask on a screen that had
       * not yet done anything for anybody.
       */}
      {settled && hasMaterial ? (
        <GithubStep
          connected={githubConnected}
          installUrl={githubInstallUrl}
          circlebackConnected={circlebackConnected}
        />
      ) : null}

      <div className="flex flex-col gap-kit-related">
        <ReplyActions>
          {/**
           * The primary exit exists only once there is an angle to write.
           *
           * It used to render from the first paint, which put a filled "Write
           * the first draft" next to a filled "Connect" — two primary buttons,
           * so neither reads as the next step. Worse, pressing it early did the
           * one thing this screen must never do: end first run having written
           * nothing, and drop somebody on Ideas to start work themselves.
           *
           * One ink pill in view is the rule (docs/design/actions.md), and the
           * honest way to keep it here is for the button not to exist yet.
           */}
          {chosen ? (
            <Button
              variant="action"
              disabled={leaving === "skip"}
              pending={leaving === "finish"}
              pendingLabel="Writing it…"
              onClick={() => leave("finish")}
            >
              Write this one
            </Button>
          ) : null}
          {/* Skipping is a button, not something you have to say. It sits
              beside every step rather than after the last one: this screen has
              a paid read and a third-party install in it, and "do this later"
              has to be reachable from inside both, not only from the bottom. */}
          <Button
            disabled={leaving === "finish"}
            pending={leaving === "skip"}
            pendingLabel="One moment…"
            onClick={() => leave("skip")}
          >
            Do the rest later
          </Button>
        </ReplyActions>

        {/* Under the buttons, not in place of them: the retry is the same
            button that just refused, so it has to stay where the hand already
            is. */}
        {refusal ? <Refusal>{refusal}</Refusal> : null}
      </div>
    </div>
  )
}

/** A section's name and its one line, above the object it is about. */
function SectionHead({
  id,
  title,
  rest,
}: {
  id: string
  title: string
  rest: string
}) {
  return (
    <div className="flex flex-col gap-kit-tight">
      <Text as="h2" id={id} weight="strong">
        {title}
      </Text>
      <Text tone="muted">{rest}</Text>
    </div>
  )
}

/** The platform's mark in a small well; its first letter where there is none. */
function Mark({ id, label }: { id: string; label: string }) {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-kit-control bg-kit-well text-kit-ink">
      {hasPlatformMark(id) ? (
        <PlatformMark platform={id} size={16} />
      ) : (
        <span aria-hidden className="text-kit-small font-kit-strong">
          {label.slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  )
}

/**
 * One row of the wiring: a mark, a name, a state, one control, and the
 * sentence you read before granting anything.
 *
 * Channels and sources both render through this. They were two different
 * shapes for a while — X got a card row and GitHub got a paragraph with a
 * button under it — and the difference was not saying anything true. Both are
 * "hand Quincy a thing it does not have yet", both need a name, a state and a
 * consent sentence, and a person comparing them should be comparing what they
 * grant rather than two layouts.
 *
 * Done and not-yet are words in the state line, not a pill and not a
 * disabled button: a greyed-out Connect still invites a press and answers
 * nothing.
 */
function ConnectRow({
  id,
  label,
  state,
  action,
  description,
  children,
}: {
  id: string
  label: string
  /** What this row is doing right now, under the name. */
  state: string
  /** The control on the right, if there is one to press. */
  action?: React.ReactNode
  /** The consent or capability sentence, always visible. */
  description: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-kit-related">
      <div className="flex items-center gap-kit-related">
        <Mark id={id} label={label} />
        <div className="flex min-w-0 flex-col">
          <Text as="span" weight="strong">
            {label}
          </Text>
          <Text as="span" variant="small" tone="muted">
            {state}
          </Text>
        </div>
        {action ? <div className="ml-auto shrink-0">{action}</div> : null}
      </div>

      <Text variant="small" tone="muted">
        {description}
      </Text>

      {children}
    </div>
  )
}

function ChannelRow({
  channel,
  emphasise,
}: {
  channel: WiringState["channels"][number]
  emphasise: boolean
}) {
  // Either reason lands in the same place on screen: nothing to press, and a
  // word saying why instead of a button that cannot answer.
  const comingSoon = !channel.connected && (channel.soon || !channel.connectable)

  return (
    <ConnectRow
      id={channel.id}
      label={channel.label}
      state={
        channel.connected
          ? "Connected"
          : comingSoon
            ? "Coming soon"
            : "Not connected"
      }
      /* The consent sentence, verbatim from connection-strip.tsx. What a person
         reads before granting should not be written twice in two voices, and it
         stays visible after connecting because this is the sentence somebody
         comes back to check. */
      description={channel.grant}
      action={
        channel.connected || comingSoon ? null : (
          /**
           * A link, not a button: the connect handshake is a GET that
           * redirects to the provider, and `?next=/welcome` is what brings
           * the person back here rather than dropping them on /channels
           * with the wiring half done.
           *
           * `prefetch={false}` is load-bearing: a prefetch of this route
           * would start the handshake (and set its state cookie) before
           * anybody pressed anything.
           */
          <ButtonAnchor
            href={`/api/connect/${channel.id}?next=/welcome`}
            variant={emphasise ? "action" : "quiet"}
            pendingLabel="Opening…"
          >
            Connect
          </ButtonAnchor>
        )
      }
    >
      {channel.alsoBuys ? (
        <Text variant="small" tone="muted">
          Also unlocks: {channel.alsoBuys.toLowerCase()}.
        </Text>
      ) : null}
    </ConnectRow>
  )
}

/**
 * No `idle`. Reaching this component at all means X is connected, and the read
 * is what that grant bought — so there is no state in which Quincy has the
 * permission, has not used it, and is waiting to be asked. The only way back to
 * a button is `failed`, which offers a retry for a specific reason.
 */
type ReadState =
  | { stage: "reading" }
  | { stage: "done"; postsRead: number; truncated: boolean }
  | { stage: "failed"; message: string }

/**
 * The read, then the introduction.
 *
 * `readCorpus` wraps `importFromX` unchanged, so the entitlement gate, the
 * ceiling and the ten-minute cooldown are all still the ones that action
 * carries. Nothing here spends on its own.
 */
function CorpusRead({
  alreadyRead,
  receipt,
  addition,
  onSettled,
}: {
  alreadyRead: number
  receipt: CorpusReceipt | null
  addition: string | null
  /**
   * Fired once the read has stopped being in flight — read, or skipped after a
   * failure. It is what lets the material ask wait for the portrait without
   * waiting on a server round trip that a failed read never produces.
   */
  onSettled: () => void
}) {
  const router = useRouter()
  const actions = useWelcomeActions()
  /**
   * Opens on "reading", never on a button.
   *
   * This component only renders when X is connected, so an empty corpus here
   * means exactly one thing: the read that the X grant already bought has not
   * happened. There is nothing to ask.
   *
   * Deriving the opening stage rather than starting `idle` and letting the
   * effect move it also removes a frame of "Read my posts" flashing before the
   * spinner replaces it — and because the condition is server-derived, the
   * server and the client agree on it, so there is nothing here to mismatch on
   * hydration.
   */
  const [state, setState] = React.useState<ReadState>(() =>
    alreadyRead > 0
      ? { stage: "done", postsRead: alreadyRead, truncated: false }
      : { stage: "reading" }
  )
  const [learned, setLearned] = React.useState<CorpusReceipt | null>(receipt)
  // Seeded from the server for a return visit, replaced by the read's own
  // result on a first one — so the offer appears in the same beat as the
  // portrait rather than after a refresh.
  const [offer, setOffer] = React.useState<string | null>(addition)

  const read = React.useCallback(async () => {
    setState({ stage: "reading" })
    let result: Awaited<ReturnType<typeof actions.readCorpus>>
    try {
      result = await actions.readCorpus()
    } catch {
      // Never answered: say so, with the retry, rather than read forever.
      result = { ok: false, message: "That did not reach Quincy. Try again." }
    }

    if (!result.ok) {
      setState({ stage: "failed", message: result.message })
      return
    }

    setLearned(result.receipt)
    setOffer(result.addition)
    setState({
      stage: "done",
      postsRead: result.postsRead || alreadyRead,
      truncated: result.truncated,
    })
    onSettled()
    // The rail counts brain pages, and the compile just wrote several. It also
    // brings down the material ask, which the receipt has just given its names.
    router.refresh()
  }, [actions, alreadyRead, onSettled, router])

  /**
   * The read starts itself as soon as X is connected, once.
   *
   * **It used to wait for `?connected=1`, and that is why it never fired.** The
   * flag only exists on the single redirect back from X's consent screen, and
   * this component does not mount on that paint — it is behind the wiring,
   * which is behind the closing line finishing its type-out. Any reload,
   * back-button, or slow return in between and the trigger was simply gone, so
   * the screen fell back to offering a button for something already consented
   * to. Two full test runs ended with an unread corpus because of it.
   *
   * The state of the database is the trigger now: X connected and no corpus
   * means read. That cannot be missed by arriving a moment late, and it needs
   * no query parameter to survive a redirect chain.
   *
   * The guards on spending are unchanged in substance:
   *
   * - An empty corpus, so a finished first run never re-reads.
   * - The ref stops a second read if this effect ever runs again after one has
   *   begun.
   * - `importXCorpus`'s ten-minute cooldown is the backstop that does not
   *   depend on the client behaving at all.
   *
   * The stale flag is still stripped from the URL when it is there, so a
   * refresh does not carry it around after it has stopped meaning anything.
   *
   * **The ref is set when the read begins, never when the effect runs — and
   * that ordering is a bug this screen has already shipped once.** It used to
   * arm on entry and schedule the work on a timeout the cleanup cancelled.
   * React's development double-invoke is mount → cleanup → mount: the first
   * pass armed the guard, the cleanup killed the work, and the second pass saw
   * the guard and returned. The read never fired at all in development, which
   * is exactly what "it is taking a while" looked like from the outside — a
   * screen sitting on "Reading…" with no request behind it. Production, with no
   * double-invoke, would have worked, so nothing but a real run could catch it.
   */
  const started = React.useRef(false)
  React.useEffect(() => {
    if (started.current || alreadyRead > 0) return

    if (new URLSearchParams(window.location.search).has("connected")) {
      window.history.replaceState(null, "", "/welcome")
    }

    /**
     * Deferred a tick rather than called straight.
     *
     * `read` sets state on its first line, and setting state synchronously
     * inside an effect is what `react-hooks/set-state-in-effect` exists to
     * stop — it lands in the same commit that just rendered.
     */
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (cancelled) return
      started.current = true
      void read()
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [alreadyRead, read])


  if (state.stage === "reading") {
    return (
      <div className="flex flex-col gap-kit-group">
        <QuincyTurn>
          {
            /* No count in this sentence. The grant above it already states the
               exact cap, interpolated from `DEFAULT_MAX_POSTS` — and this file
               cannot import that constant, because it lives beside `db`. A
               number typed here by hand is a second source of truth that goes
               stale the first time the cap moves, which is what happened when
               it went from 200 to 100. */
            "Good. That is the one permission I needed.\n\nReading your posts now. Give me a minute: I am looking at how you build a sentence, not what you posted about."
          }
        </QuincyTurn>
        {/* This is the one wait in first run long enough to need motion: a
            paid read over a hundred posts and a model call, tens of seconds on
            a screen where nothing else moves. A still line through that reads
            as a hung page. The friend reading beside the words is the
            product's word for "this is still running" (docs/design/states.md). */}
        <Working>Reading your timeline. This takes about a minute.</Working>
      </div>
    )
  }

  if (state.stage === "failed") {
    return (
      <div className="flex flex-col gap-kit-related">
        <QuincyTurn>
          {`I could not finish that read. ${state.message}\n\nNothing is lost. Try again here, or skip it and do it from Sources later.`}
        </QuincyTurn>
        <ReplyActions>
          <Button onClick={read}>
            Try again
          </Button>
          {/* Do this later, from inside the step that failed. */}
          <Button
           
            onClick={() => {
              setState({ stage: "done", postsRead: 0, truncated: false })
              // Skipping settles it too, or the material ask never arrives and
              // first run dead-ends on a failed read.
              onSettled()
            }}
          >
            Skip this
          </Button>
        </ReplyActions>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-kit-group">
      <QuincyTurn>
        {state.postsRead > 0
          ? `Read ${state.postsRead} of your posts.${
              state.truncated ? " There are more; I stopped at the cap." : ""
            } Here is who I think I am writing as.`
          : "I did not get anything new from your timeline this time. What I already had still stands:"}
      </QuincyTurn>

      {learned ? <Portrait receipt={learned} /> : <ThinCorpus />}

      <HumanAddition addition={offer} />
    </div>
  )
}

/**
 * What Quincy now knows, as evidence rather than as a count.
 *
 * Every line here is a line that is now on a brain page. Nothing is generated
 * for this card — the portrait is `voice/x`'s body, the rules are its
 * `data.rules`, the stories are `story` pages — so "you can change any of this
 * later" is literally true, and a person who opens /brain after this screen
 * finds exactly what they were shown.
 */
function Portrait({ receipt }: { receipt: CorpusReceipt }) {
  return (
    <div className={ARRIVES}>
      <Card>
        <div className="flex flex-col gap-kit-group">
          <Text as="h2" weight="strong">
            What I have on you now
          </Text>

          {receipt.portrait ? (
            <Text>
              <span className="text-pretty">{receipt.portrait}</span>
            </Text>
          ) : null}

          {receipt.rules.length > 0 ? (
            <div className="flex flex-col gap-kit-controls">
              <Text as="h3" variant="small" tone="muted">
                How you write
              </Text>
              <ul role="list" className="flex list-disc flex-col gap-kit-tight pl-4 marker:text-kit-ink-muted">
                {receipt.rules.map((rule) => (
                  <li key={rule}>
                    <Text as="span" variant="small">
                      {rule}
                    </Text>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {receipt.stories.length > 0 ? (
            <div className="flex flex-col gap-kit-controls">
              <Text as="h3" variant="small" tone="muted">
                What you keep coming back to
              </Text>
              <ul role="list" className="flex flex-col gap-kit-related">
                {receipt.stories.map((story) => (
                  <li key={story.slug} className="flex flex-col gap-kit-tight">
                    <Text as="span" weight="strong">
                      {story.title}
                    </Text>
                    <Text as="span" variant="small" tone="muted">
                      {story.point}
                    </Text>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <Text variant="small" tone="muted">
            All of it is on pages you can open and edit. If I have you wrong
            anywhere, fixing it there fixes every draft after.
          </Text>
        </div>
      </Card>
    </div>
  )
}

/**
 * The angles, as rows: picking one is one press, and the exit button under
 * them writes the picked one. Rows only pick; the verb lives in the button
 * (docs/design/page.md, "Rows only open").
 */
function Suggestions({
  items,
  selectedId,
  onSelect,
}: {
  items: Suggestion[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className={ARRIVES}>
      <List aria-label="Ideas from what you told me">
        {items.map((item) => (
          <ListRow
            key={item.id}
            selected={item.id === selectedId}
            titleLines={2}
            description={item.why || undefined}
            meta={item.shape ? <Tag>{item.shape}</Tag> : undefined}
            onClick={() => onSelect(item.id)}
          >
            {item.hook}
          </ListRow>
        ))}
      </List>
    </div>
  )
}

/**
 * The material ask, and everything it unlocks.
 *
 * **This used to be question four, asked before Quincy had done anything.** It
 * moved here on 2026-08-16, after a real first run answered it "Shipped about
 * Quincy" and the angle model could only hand those four words back. A cold ask
 * for somebody's week, from a product they met a minute ago, earns a cold
 * answer — and the fix was not a longer minimum but a later question.
 *
 * Asked here, Quincy has read two hundred of their posts and can name the
 * themes it found. That is a question worth answering, and the angles it
 * produces are cut once, against a brain that holds the voice.
 *
 * The composer is the same one the interview uses, in the same bar at the
 * bottom (portalled into FirstRun's slot), so the ask reads as the
 * conversation continuing rather than as a form appearing at the end of it.
 */
function MaterialStep({
  ask,
  hasMaterial,
  suggestions,
  selectedId,
  onSelect,
}: {
  ask: string
  hasMaterial: boolean
  suggestions: Suggestion[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const router = useRouter()
  const actions = useWelcomeActions()
  const slot = React.useContext(ComposerSlot)
  const [input, setInput] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  /**
   * The conversation so far, as turns.
   *
   * `kept` is what the person has already said and Quincy has already accepted
   * — it is never thrown away, and never pushed back into the composer, because
   * an answer that reappears in the box you just emptied reads as rejected.
   * `followUp` is the one extra question Quincy asked about it.
   */
  const [kept, setKept] = React.useState<string | null>(null)
  const [followUp, setFollowUp] = React.useState<string | null>(null)

  async function send(text: string, force = false) {
    const addition = text.trim()
    // The follow-up's answer is added to the first one rather than replacing
    // it: both sentences are the material, and the riff should hold both.
    const whole = [kept, addition].filter(Boolean).join("\n\n").trim()
    if (!whole || busy) return

    setBusy(true)
    setError(null)
    setInput("")

    let result: Awaited<ReturnType<typeof actions.answerMaterial>>
    try {
      result = await actions.answerMaterial(whole, force)
    } catch {
      result = {
        ok: false,
        reason: "failed",
        message: "That did not reach Quincy. Try again.",
      }
    }

    if (!result.ok && result.reason === "thin") {
      // Kept, shown as a turn, and asked about — not handed back.
      setKept(result.answered)
      setFollowUp(result.followUp)
      setBusy(false)
      return
    }

    if (!result.ok) {
      // A genuine write failure. The words go back in the composer, because
      // losing what somebody just typed is the worst possible first minute.
      setError(result.message)
      setInput(addition)
      setBusy(false)
      return
    }

    // The riff and its angles are on the server now; this pulls them down.
    // `busy` stays true through the refresh, so the composer does not flash
    // back before the angles replace it.
    router.refresh()
  }

  // Answered already — on a return visit, or a moment ago. The angles are the
  // answer, so the composer has nothing left to do.

  if (hasMaterial) {
    return (
      <div className="flex flex-col gap-kit-group">
        {suggestions.length > 0 ? (
          <>
            <QuincyTurn>
              {
                "Here is how I would take it. Pick one and I will write it properly. The draft takes a few seconds."
              }
            </QuincyTurn>
            <Suggestions
              items={suggestions}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          </>
        ) : (
          <QuincyTurn>
            {
              "I have that, but I could not find an idea in it worth writing. It is waiting in Ideas, and we can try again there."
            }
          </QuincyTurn>
        )}
      </div>
    )
  }

  const composer = (
    <>
      {error ? <Refusal>{error}</Refusal> : null}
      <Composer
        label="Tell Quincy what happened"
        value={input}
        onValueChange={setInput}
        onSubmit={({ text }) => void send(text)}
        busy={busy}
        placeholder={
          followUp ? "The hardest part was…" : "What changed this week?"
        }
        autoFocus
      />
    </>
  )

  return (
    <div className="flex flex-col gap-kit-group">
      <QuincyTurn>{ask}</QuincyTurn>

      {/* What they said stays on screen as a turn, above the follow-up. It is
          accepted material, not a draft awaiting approval. */}
      {kept ? <UserTurn>{kept}</UserTurn> : null}
      {followUp ? (
        <div className="flex flex-col gap-kit-related">
          <QuincyTurn>{followUp}</QuincyTurn>
          {/**
           * The way out of the follow-up without inventing more to say. It
           * sends what was kept as it is (`force`), so somebody who has nothing
           * to add is never stuck behind a question they cannot answer.
           */}
          {!busy ? (
            <ReplyActions>
              <Button onClick={() => void send("", true)}>
                That is all I have
              </Button>
            </ReplyActions>
          ) : null}
        </div>
      ) : null}

      {busy ? <Working>Reading that and looking for ideas</Working> : null}

      {/* The composer sits in the bar under the conversation, where the
          questions' composer was. Without the slot (never, in practice) it
          stays in place rather than disappearing. */}
      {slot ? createPortal(composer, slot) : composer}
    </div>
  )
}

/**
 * The one place the read is allowed to change an answer somebody typed — and it
 * asks first.
 *
 * "Im building Quincy" is a fine answer to question one and a thin thing for
 * the rail to keep showing after Quincy has read two hundred posts. This offers
 * the difference as a sentence, under their own words rather than instead of
 * them.
 *
 * **Asking is the whole design, not politeness.** `human` is user-owned, and
 * `compileVoice` skips user-owned pages so that a model can never quietly
 * replace something a person stated. A button is how that rule bends without
 * breaking: the model drafts, the person decides, and the page records that a
 * human agreed.
 *
 * Dismissing is permanent for this screen only. The page is on /brain and the
 * sentence can be written there by hand at any time, so a "no" here costs
 * nothing later.
 */

function HumanAddition({ addition }: { addition: string | null }) {
  const router = useRouter()
  const actions = useWelcomeActions()
  const [done, setDone] = React.useState<"added" | "kept" | null>(null)
  const [busy, setBusy] = React.useState(false)

  if (!addition) return null

  if (done === "kept") {
    return <QuincyTurn>{"Understood. Your words, then."}</QuincyTurn>
  }

  if (done === "added") {
    return (
      <QuincyTurn>
        {"Added. It is on your My Human page with everything else."}
      </QuincyTurn>
    )
  }

  async function add() {
    if (busy) return
    setBusy(true)
    let result: Awaited<ReturnType<typeof actions.enrichHuman>>
    try {
      result = await actions.enrichHuman()
    } catch {
      result = { ok: false, message: "That did not reach Quincy. Try again." }
    }
    setBusy(false)
    if (!result.ok) return
    setDone("added")
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-kit-related">
      <QuincyTurn>
        {`One thing about you. You told me what you do in a line, and I would add this under it:\n\n${addition}`}
      </QuincyTurn>
      <ReplyActions>
        <Button pending={busy} pendingLabel="Writing it down…" onClick={add}>
          Add it
        </Button>
        <Button disabled={busy} onClick={() => setDone("kept")}>
          Keep mine
        </Button>
      </ReplyActions>
    </div>
  )
}

/** A corpus too thin to compile a voice page from. Said plainly. */
function ThinCorpus() {
  return (
    <div className={ARRIVES}>
      <Card>
        <Lead
          bold="Not much to go on yet."
          rest="There was not enough there to say how you write, and I would rather tell you that than invent a voice for you. What you told me still stands, and this gets better the more you post."
        />
      </Card>
    </div>
  )
}


/**
 * The next thing Quincy can do for you, offered as work rather than as setup.
 *
 * GitHub keeps its button in first run because its install is a link *out* to
 * github.com and comes back through the callback into the flow. Circleback
 * cannot: its setup mints a webhook URL to paste into another product and waits
 * for a signing secret to come back — a several-minute detour into somebody
 * else's dashboard, and first run is the wrong place for it. It is described on
 * /sources, not offered here.
 *
 * **No in-app links.** Until `onboardedAt` is set, every route in the `(app)`
 * group redirects back to /welcome, so a `<Link href="/sources">` inside first
 * run is a button that silently returns you to the page you are on. That is
 * exactly what happened on the first real run.
 */

function GithubStep({
  connected,
  installUrl,
  circlebackConnected,
}: {
  connected: boolean
  installUrl: string | null
  circlebackConnected: boolean
}) {
  return (
    <div className="flex flex-col gap-kit-group">
      <QuincyTurn>
        {
          "One more and I stop asking. Give me somewhere your work already lands, and I write the post the moment it happens. You press send."
        }
      </QuincyTurn>

      <section aria-labelledby="wiring-sources" className="flex flex-col gap-kit-related">
        <SectionHead
          id="wiring-sources"
          title="Where the material comes in"
          rest="I draft from material, never from nothing."
        />

        {/* The same object as the channels above it, deliberately. */}
        <Card>
          <ConnectRow
            id="github"
            label="GitHub"
            state={connected ? "Connected" : installUrl ? "Not connected" : "Coming soon"}
            description="I read pull requests as they merge: the title, the description and the branch. I cannot read your code, and I publish nothing on my own."
            action={
              !connected && installUrl ? (
                // Out to github.com, so it survives first run's redirect gate.
                <ButtonAnchor href={installUrl} pendingLabel="Opening…">
                  Install
                </ButtonAnchor>
              ) : null
            }
          />

          <Rule />

          {/**
           * Described, not offered: its setup is a detour into another
           * product's settings (see above). And no link to /sources, for the
           * reason above too.
           */}
          <ConnectRow
            id="circleback"
            label="Circleback"
            state={circlebackConnected ? "Connected" : "Set up from Sources"}
            description="The moment worth quoting from a call. It takes a few minutes in Circleback's own settings, so it lives on Sources rather than here."
          />
        </Card>
      </section>
    </div>
  )
}
