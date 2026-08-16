"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  ArrowRight01Icon,
  Brain02Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import {
  answerMaterial,
  enrichHuman,
  finishFirstRun,
  readCorpus,
  skipFirstRun,
} from "@/app/(welcome)/welcome/actions"
// The same action /riffs uses. A second one that skipped its entitlement gate
// or its idempotency, reachable by an account two minutes old, is exactly the
// cost bug AGENTS.md's money section describes.
import { draftAngle } from "@/app/(app)/riffs/actions"
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
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  PlatformMark,
  hasPlatformMark,
} from "@/components/channels/platform-mark"
import { Composer } from "@/components/chat/composer"
import { ARRIVES, QuincyTurn, UserTurn } from "@/components/welcome/turn"

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
   * The button used to set `onboardedAt` and push to /riffs, which handed
   * somebody a list of angles and asked them to start working. Everything
   * before it on this screen — the read, the portrait, the suggestions — is
   * Quincy demonstrating that it understands you, and then the last thing it
   * did was give you homework.
   *
   * So it writes first and leaves second. `draftAngle` is the same action
   * /riffs uses, unchanged: it carries the entitlement gate, it reads the hook
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

    if (where === "skip") {
      await skipFirstRun()
      router.push("/studio")
      return
    }

    if (chosen) {
      const result = await draftAngle({ angleId: chosen })

      if (!result.ok) {
        setRefusal(result.message)
        setLeaving(null)
        return
      }

      await finishFirstRun()
      router.push("/drafts")
      return
    }

    // No angles — the model call behind question four failed, and there is
    // nothing to write. /riffs is where the material still is.
    await finishFirstRun()
    router.push("/riffs")
  }

  return (
    <div className="flex w-full flex-col gap-8 pb-24">
      {/* No heading of its own. "That is the talking done" is said in the
          conversation this sits underneath, by Quincy, as a turn — a screen
          that announces itself again directly below the sentence announcing it
          reads as two different products introducing the same thing twice. */}
      <section aria-labelledby="wiring-channels" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 px-1">
          <h2 id="wiring-channels" className="text-card-title">
            Where the writing goes out
          </h2>
          <p className="text-caption text-muted-foreground text-pretty">
            Quincy publishes nowhere you have not handed it, and never without
            you pressing send.
          </p>
        </div>

        {/* Divided, not just gapped. X's "also unlocks" line sits directly
            above LinkedIn's tile and reads as LinkedIn's without a rule, and
            that is the one sentence here that must not be misattributed. */}
        <div className="divide-border bg-card flex flex-col divide-y rounded-xl p-4 shadow-xs *:py-4 *:first:pt-0 *:last:pb-0">
          {wiring.channels.map((channel) => (
            <ChannelRow
              key={channel.id}
              channel={channel}
              emphasise={channel.id === nextChannel}
            />
          ))}
        </div>

        {/**
         * The way past this step without granting anything.
         *
         * Only while it is the live step — once the read has happened or the
         * person has moved on, offering to skip something already behind them
         * is noise. Ghost, because connecting is the recommendation and this is
         * the door beside it, not a second option of equal weight.
         */}
        {!settled && !wiring.corpusOfferable ? (
          <div className="px-1">
            <Button size="sm" variant="ghost" onClick={settle}>
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

      <div className="flex flex-wrap items-center gap-2">
        {/**
         * The primary exit exists only once there is an angle to write.
         *
         * It used to render from the first paint, which put a filled "Write the
         * first draft" next to a filled "Connect" — two primary buttons, so
         * neither reads as the next step. Worse, pressing it early did the one
         * thing this screen must never do: end first run having written
         * nothing, and drop somebody on /riffs to start work themselves.
         *
         * Exactly one filled button in view is the rule from plans/022, and the
         * honest way to keep it here is for the button not to exist yet.
         */}
        {chosen ? (
          <Button
            disabled={leaving !== null}
            onClick={() => leave("finish")}
          >
            {leaving === "finish" ? "Writing it…" : "Write this one"}
            <HugeiconsIcon
              aria-hidden="true"
              data-icon="inline-end"
              icon={ArrowRight01Icon}
            />
          </Button>
        ) : null}
        {/* Skipping is a button, not something you have to say. It sits beside
            every step rather than after the last one: this screen now has a
            paid read and a third-party install in it, and "do this later" has
            to be reachable from inside both, not only from the bottom. */}
        <Button
          variant="ghost"
          disabled={leaving !== null}
          onClick={() => leave("skip")}
        >
          {leaving === "skip" ? "One moment…" : "Do the rest later"}
        </Button>
      </div>

      {/* Under the buttons, not in place of them: the retry is the same button
          that just refused, so it has to stay where the hand already is. */}
      {refusal ? (
        <p className="text-caption text-destructive px-1" role="alert">
          {refusal}
        </p>
      ) : null}
    </div>
  )
}

function Tile({ id, label }: { id: string; label: string }) {
  // Card radius is 20px and rows inset 16px, so the tile derives to 4px.
  return (
    <div className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-xs">
      {hasPlatformMark(id) ? (
        <PlatformMark platform={id} size={16} />
      ) : (
        <span aria-hidden="true" className="text-caption font-medium">
          {label.slice(0, 1).toUpperCase()}
        </span>
      )}
    </div>
  )
}

/**
 * One row of the wiring: a tile, a name, a state, one control, and the sentence
 * you read before granting anything.
 *
 * Channels and sources both render through this. They were two different
 * shapes for a while — X got a card row and GitHub got a paragraph with a
 * button under it — and the difference was not saying anything true. Both are
 * "hand Quincy a thing it does not have yet", both need a name, a state and a
 * consent sentence, and a person comparing them should be comparing what they
 * grant rather than two layouts.
 */
function ConnectRow({
  id,
  label,
  /** What this row is doing right now, under the name. */
  state,
  /** The control on the right. */
  action,
  /** The consent or capability sentence, always visible. */
  description,
  children,
}: {
  id: string
  label: string
  state: string
  action: React.ReactNode
  description: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Tile id={id} label={label} />
        <div className="flex min-w-0 flex-col">
          <span className="text-card-title">{label}</span>
          <span className="text-caption text-muted-foreground">{state}</span>
        </div>
        <div className="ml-auto shrink-0">{action}</div>
      </div>

      <p className="text-caption text-muted-foreground text-pretty">
        {description}
      </p>

      {children}
    </div>
  )
}

/** Done, in the one place every row says it. */
function DoneMark({ label }: { label: string }) {
  return (
    <span className="text-caption text-muted-foreground inline-flex items-center gap-1.5">
      <HugeiconsIcon aria-hidden="true" icon={Tick02Icon} className="size-3.5" />
      {label}
    </span>
  )
}

/**
 * A word, not a disabled button.
 *
 * A greyed-out Connect is still a control: it invites a press, answers nothing
 * when pressed, and cannot hold a tooltip because a disabled control takes no
 * focus. "Coming soon" says the same thing in less space and asks for nothing.
 */
function SoonPill() {
  return (
    <span className="text-caption text-muted-foreground bg-muted rounded-full px-2.5 py-1">
      Coming soon
    </span>
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
            ? "Not yet"
            : "Not connected"
      }
      /* The consent sentence, verbatim from connection-strip.tsx. What a person
         reads before granting should not be written twice in two voices, and it
         stays visible after connecting because this is the sentence somebody
         comes back to check. */
      description={channel.grant}
      action={
        channel.connected ? (
          <DoneMark label="Done" />
        ) : comingSoon ? (
          <SoonPill />
        ) : (
          /**
           * A link, not a button: the connect handshake is a GET that
           * redirects to the provider, and `?next=/welcome` is what brings
           * the person back here rather than dropping them on /channels
           * with the wiring half done.
           */
          <Button
            variant={emphasise ? "default" : "outline"}
            size="sm"
            // The rendered element is an anchor, so Base UI needs telling.
            nativeButton={false}
            render={
              <a href={`/api/connect/${channel.id}?next=/welcome`}>Connect</a>
            }
          />
        )
      }
    >
      {channel.alsoBuys ? (
        <p className="text-caption text-muted-foreground text-pretty">
          Also unlocks: {channel.alsoBuys.toLowerCase()}.
        </p>
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
    const result = await readCorpus()

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
  }, [alreadyRead, onSettled, router])

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
      <div className="flex flex-col gap-5">
        <QuincyTurn>
          {
            /* No count in this sentence. The grant above it already states the
               exact cap, interpolated from `DEFAULT_MAX_POSTS` — and this file
               cannot import that constant, because it lives beside `db`. A
               number typed here by hand is a second source of truth that goes
               stale the first time the cap moves, which is what happened when
               it went from 200 to 100. */
            "Good — that is the one permission I actually needed.\n\nReading your posts now. Give me a minute; I am looking for how you build a sentence, not what you posted about."
          }
        </QuincyTurn>
        {/**
         * Says what it is doing rather than three dots, and shimmers while it
         * does it.
         *
         * **This is the one wait in first run long enough to need motion.** It
         * is a paid network read over two hundred posts followed by a model
         * call — tens of seconds, on a screen where nothing else moves. A
         * static line through that reads as a hung page, which is precisely
         * what it was mistaken for. Motion here is not decoration; it answers
         * "is this still alive", which is the only question anybody has during
         * a wait of that length.
         *
         * `shimmer` rather than a spinner or a pulse, because it is already
         * this codebase's word for a sentence that is still being worked on —
         * the studio's "Thinking", streaming replies, an uploading attachment.
         * A new indicator invented here would say the same thing in a dialect
         * nothing else speaks. It ships with shadcn, so there is no new CSS and
         * no new dependency for it.
         */}
        <p
          className={cn(
            "text-caption text-muted-foreground shimmer px-3",
            ARRIVES
          )}
          role="status"
        >
          Reading your timeline…
        </p>
      </div>
    )
  }

  if (state.stage === "failed") {
    return (
      <div className="flex flex-col gap-5">
        <QuincyTurn>
          {`I could not finish that read. ${state.message}\n\nIt is not lost work — you can press again here, or leave it and do it from Sources whenever.`}
        </QuincyTurn>
        <div className="flex flex-wrap items-center gap-2 px-1">
          <Button size="sm" variant="outline" onClick={read}>
            Try again
          </Button>
          {/* Do this later, from inside the step that failed. */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setState({ stage: "done", postsRead: 0, truncated: false })
              // Skipping settles it too, or the material ask never arrives and
              // first run dead-ends on a failed read.
              onSettled()
            }}
          >
            Skip this
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <QuincyTurn>
        {state.postsRead > 0
          ? `Read ${state.postsRead} of your posts.${
              state.truncated ? " There are more — I stopped at the cap." : ""
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
    <div className={cn("bg-card flex flex-col gap-4 rounded-xl p-4 shadow-xs", ARRIVES)}>
      <div className="flex items-center gap-2">
        <HugeiconsIcon
          aria-hidden="true"
          icon={Brain02Icon}
          className="text-muted-foreground size-4"
        />
        <h3 className="text-caption font-medium">What I have on you now</h3>
      </div>

      {receipt.portrait ? (
        <p className="text-body text-pretty">{receipt.portrait}</p>
      ) : null}

      {receipt.rules.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h4 className="text-eyebrow text-muted-foreground uppercase">
            How you write
          </h4>
          <ul role="list" className="flex flex-col gap-1.5">
            {receipt.rules.map((rule) => (
              <li key={rule} className="flex gap-2">
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={Tick02Icon}
                  className="text-muted-foreground mt-0.5 size-3.5 shrink-0"
                />
                <span className="text-caption text-pretty">{rule}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {receipt.stories.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h4 className="text-eyebrow text-muted-foreground uppercase">
            What you keep coming back to
          </h4>
          <ul role="list" className="flex flex-col gap-2">
            {receipt.stories.map((story) => (
              <li key={story.slug} className="flex flex-col gap-0.5">
                <span className="text-caption font-medium">{story.title}</span>
                <span className="text-caption text-muted-foreground text-pretty">
                  {story.point}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-caption text-muted-foreground text-pretty">
        All of it is on pages you can open and edit. If I have you wrong
        anywhere, correcting it there is what fixes every draft after.
      </p>
    </div>
  )
}

/**
 * What Quincy would post, right after it has proved it knows who you are.
 *
 * These are the angles from question four, not a fresh generation — see
 * `firstRiffSuggestions`. They are shown here rather than only on /riffs
 * because first run's last impression should be a proposal: the portrait says
 * "I understand you", and without this the next thing it says is "install
 * GitHub", which reads as more setup.
 *
 * **A choice, not a set of buttons.** Every row is selectable and exactly one is
 * selected, because the screen already has its filled button at the bottom and a
 * "Draft this" on each row would put three of them in view. Picking a row says
 * which one that button writes. `why` is on every row because an angle with no
 * reasoning is a suggestion you cannot argue with.
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
    <ul
      role="list"
      className={cn(
        "divide-border bg-card divide-y overflow-hidden rounded-xl shadow-xs",
        ARRIVES
      )}
    >
      {items.map((item) => {
        const active = item.id === selectedId
        return (
          <li key={item.id}>
            <button
              type="button"
              // Pressed rather than a radio: these are not a form field, and
              // `aria-pressed` is what tells a screen reader which one the
              // button at the bottom is about to write.
              aria-pressed={active}
              onClick={() => onSelect(item.id)}
              className={cn(
                "flex w-full flex-col gap-1.5 px-4 py-3 text-left",
                "transition-[background-color] duration-150 ease-out",
                "hover:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active && "bg-accent"
              )}
            >
              <div className="flex items-baseline gap-2">
                <span className="text-eyebrow text-muted-foreground shrink-0 uppercase">
                  {item.shape}
                </span>
                {active ? (
                  <span className="text-eyebrow text-muted-foreground ml-auto shrink-0 uppercase">
                    Writing this one
                  </span>
                ) : null}
              </div>
              <p className="text-body text-pretty">{item.hook}</p>
              {item.why ? (
                <p className="text-caption text-muted-foreground text-pretty">
                  {item.why}
                </p>
              ) : null}
            </button>
          </li>
        )
      })}
    </ul>
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
 * The composer is the same one the interview uses, so the ask reads as the
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

    const result = await answerMaterial(whole, force)

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
      <div className="flex flex-col gap-5">
        {suggestions.length > 0 ? (
          <>
            <QuincyTurn>
              {
                "Here is how I would take it. Pick the one you want and I write it properly — you will be looking at the draft in a few seconds."
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
              "I have that, but I could not find an angle in it worth writing. It is in your riffs — have a look there and we can try again."
            }
          </QuincyTurn>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <QuincyTurn>{ask}</QuincyTurn>

      {/* What they said stays on screen as a turn, above the follow-up. It is
          accepted material, not a draft awaiting approval. */}
      {kept ? <UserTurn>{kept}</UserTurn> : null}
      {followUp ? <QuincyTurn>{followUp}</QuincyTurn> : null}

      {busy ? (
        // Says what it is doing rather than three dots — this spends a model
        // call and the wait is real rather than decorative.
        <p
          className={cn("text-caption text-muted-foreground shimmer px-3", ARRIVES)}
          role="status"
        >
          Reading that and looking for angles…
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <Composer
            value={input}
            onValueChange={setInput}
            onSubmit={({ text }) => send(text)}
            isBusy={busy}
            placeholder={
              followUp ? "The hardest part was…" : "What changed this week?"
            }
          />

          {/**
           * The way past the follow-up, and it is unconditional.
           *
           * Only shown once Quincy has asked, because before that there is
           * nothing to skip. A word count must never be the reason somebody
           * cannot finish first run — the previous version had no escape at
           * all, which is what turned "one more sentence, please" into a wall.
           */}
          {followUp ? (
            <div className="px-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => send("", true)}
              >
                That is all I have
              </Button>
            </div>
          ) : null}

          {error ? (
            <p className="text-caption text-destructive px-1" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      )}
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
    const result = await enrichHuman()
    setBusy(false)
    if (!result.ok) return
    setDone("added")
    // The rail reads My Human from the server.
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-5">
      <QuincyTurn>
        {`One thing about you specifically. You told me what you do in a line, and I would add this under it:\n\n${addition}`}
      </QuincyTurn>
      <div className="flex flex-wrap items-center gap-2 px-1">
        <Button size="sm" variant="outline" disabled={busy} onClick={add}>
          {busy ? "Writing it down…" : "Add it"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => setDone("kept")}
        >
          Keep mine
        </Button>
      </div>
    </div>
  )
}

/** A corpus too thin to compile a voice page from. Said plainly. */
function ThinCorpus() {
  return (
    <div className={cn("bg-card flex flex-col gap-2 rounded-xl p-4 shadow-xs", ARRIVES)}>
      <h3 className="text-caption font-medium">Not much to go on yet</h3>
      <p className="text-caption text-muted-foreground text-pretty">
        There was not enough there for me to say how you write with any
        confidence. I would rather tell you that than invent a voice for you.
        What you told me a minute ago still stands, and this gets better the
        more you post.
      </p>
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
    <div className="flex flex-col gap-5">
      <QuincyTurn>
        {
          "One more and I stop asking. Give me somewhere your work already lands, and I write the post the moment it happens — you press send."
        }
      </QuincyTurn>

      <section aria-labelledby="wiring-sources" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 px-1">
          <h2 id="wiring-sources" className="text-card-title">
            Where the material comes in
          </h2>
          <p className="text-caption text-muted-foreground text-pretty">
            Quincy drafts from material, never from nothing.
          </p>
        </div>

        {/* The same card as the channels above it, deliberately. */}
        <div className="divide-border bg-card flex flex-col divide-y rounded-xl p-4 shadow-xs *:py-4 *:first:pt-0 *:last:pb-0">
          <ConnectRow
            id="github"
            label="GitHub"
            state={connected ? "Connected" : installUrl ? "Not connected" : "Not yet"}
            description="Quincy reads pull requests as they merge — the title, the description and the branch. It cannot read your code, and it publishes nothing on its own."
            action={
              connected ? (
                <DoneMark label="Done" />
              ) : installUrl ? (
                /**
                 * GitHub keeps its button in first run because its install is a
                 * link *out* to github.com and comes back through the callback
                 * into the flow. An anchor, so Base UI needs telling.
                 */
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<a href={installUrl}>Install</a>}
                />
              ) : (
                // Null install URL means this deployment has no App configured.
                <SoonPill />
              )
            }
          />

          {/**
           * Described, never offered. Circleback's setup mints a webhook URL to
           * paste into another product and waits for a signing secret to come
           * back — several minutes inside somebody else's dashboard, and first
           * run is the wrong place for it. The row is here so the person knows
           * it exists.
           *
           * **No in-app link, either.** Until `onboardedAt` is set every route
           * in the `(app)` group redirects back to /welcome, so a
           * `<Link href="/sources">` here is a button that silently returns you
           * to the page you are on. That is exactly what happened on the first
           * real run.
           */}
          <ConnectRow
            id="circleback"
            label="Circleback"
            state={circlebackConnected ? "Connected" : "After setup"}
            description="The moment worth quoting from a call. It takes a few minutes in Circleback's own settings, so it lives on Sources rather than here."
            action={
              circlebackConnected ? (
                <DoneMark label="Done" />
              ) : (
                <span className="text-caption text-muted-foreground">
                  On Sources
                </span>
              )
            }
          />
        </div>
      </section>
    </div>
  )
}
