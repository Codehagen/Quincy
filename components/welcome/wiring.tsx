"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowRight01Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { finishFirstRun, skipFirstRun } from "@/app/(welcome)/welcome/actions"
import { importFromX } from "@/app/(app)/sources/actions"
import type { WiringState } from "@/lib/onboarding"
import { SOURCES } from "@/lib/sources"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  PlatformMark,
  hasPlatformMark,
} from "@/components/channels/platform-mark"

/**
 * The wiring, after the talking. See plans/022, whose decision record carries
 * the two tails this one beat and why.
 *
 * The seam between the interview and this screen is deliberate and is named on
 * screen. Granting an app permission to publish in your name, and spending a
 * dollar, are not conversation: in a thread you get one ask at a time with no
 * sense of how many are coming, the terms scroll away behind you, and "no"
 * costs more socially than it should. Here every ask is visible at once, the
 * grant sentence sits under each, and skipping is a button.
 *
 * It is also /channels above /sources, in that order, at the moment they
 * matter — so the person learns those two pages exist and what the difference
 * is, instead of meeting them for the first time when something breaks.
 *
 * **The corpus read is not a source row.** It is what the X consent already
 * bought, so it appears inside the channels section once X is granted.
 * `lib/sources.ts` refuses to list channels as sources for the same reason: a
 * screen that asks for X twice has misread the product.
 */
export function Wiring({
  wiring,
  corpusItems,
  circlebackConnected,
  githubConnected,
  githubInstallUrl,
}: {
  wiring: WiringState
  corpusItems: number
  circlebackConnected: boolean
  githubConnected: boolean
  githubInstallUrl: string | null
}) {
  const router = useRouter()
  const [leaving, setLeaving] = React.useState<"finish" | "skip" | null>(null)

  const xConnected = wiring.channels.some((c) => c.id === "x" && c.connected)

  /** One filled button in view: the first channel still outstanding. */
  const nextChannel = wiring.channels.find(
    (c) => !c.connected && c.connectable
  )?.id

  async function leave(where: "finish" | "skip") {
    if (leaving) return
    setLeaving(where)
    if (where === "finish") {
      await finishFirstRun()
      router.push("/riffs")
    } else {
      await skipFirstRun()
      router.push("/studio")
    }
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

        {/* Only once X is granted, because it runs through that grant.
            Rendering it disabled beforehand puts a dead control in the middle
            of the screen; rendering it live would be the button that looks
            live and does nothing. */}
        {wiring.corpusOfferable ? (
          <CorpusCard alreadyRead={corpusItems} />
        ) : null}
      </section>

      <section aria-labelledby="wiring-sources" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 px-1">
          <h2 id="wiring-sources" className="text-card-title">
            Where the material comes in
          </h2>
          <p className="text-caption text-muted-foreground text-pretty">
            Quincy drafts from material, never from nothing. These are here so
            you know they exist — each one takes a few minutes in somebody
            else&rsquo;s settings, and Sources is where you do it.
          </p>
        </div>

        <SourceList
          circlebackConnected={circlebackConnected}
          githubConnected={githubConnected}
          githubInstallUrl={githubInstallUrl}
        />
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {/* Outline until a channel is connected. This screen's next step is
            the wiring, and a filled "Write the first draft" competing with a
            filled "Connect" means neither is the next step. */}
        <Button
          variant={xConnected ? "default" : "outline"}
          disabled={leaving !== null}
          onClick={() => leave("finish")}
        >
          {leaving === "finish" ? "Taking you there…" : "Write the first draft"}
          <HugeiconsIcon
            aria-hidden="true"
            data-icon="inline-end"
            icon={ArrowRight01Icon}
          />
        </Button>
        {/* Skipping is a button, not something you have to say. */}
        <Button
          variant="ghost"
          disabled={leaving !== null}
          onClick={() => leave("skip")}
        >
          {leaving === "skip" ? "One moment…" : "Do the rest later"}
        </Button>
      </div>
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

function ChannelRow({
  channel,
  emphasise,
}: {
  channel: WiringState["channels"][number]
  emphasise: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Tile id={channel.id} label={channel.label} />
        <div className="flex min-w-0 flex-col">
          <span className="text-card-title">{channel.label}</span>
          <span className="text-caption text-muted-foreground">
            {channel.connected ? "Connected" : "Not connected"}
          </span>
        </div>

        <div className="ml-auto shrink-0">
          {channel.connected ? (
            <span className="text-caption text-muted-foreground inline-flex items-center gap-1.5">
              <HugeiconsIcon
                aria-hidden="true"
                icon={Tick02Icon}
                className="size-3.5"
              />
              Done
            </span>
          ) : channel.connectable ? (
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
          ) : (
            <Button variant="outline" size="sm" disabled>
              Connect
            </Button>
          )}
        </div>
      </div>

      {/* The consent sentence, verbatim from connection-strip.tsx. What a
          person reads before granting should not be written twice in two
          voices, and it stays visible after connecting because this is the
          sentence somebody comes back to check. */}
      <p className="text-caption text-muted-foreground text-pretty">
        {channel.grant}
      </p>

      {channel.alsoBuys ? (
        <p className="text-caption text-muted-foreground text-pretty">
          Also unlocks: {channel.alsoBuys.toLowerCase()}.
        </p>
      ) : null}

      {!channel.connectable && !channel.connected ? (
        // In text, not a tooltip: a disabled control is not focusable, so a
        // tooltip on it is unreachable by keyboard.
        <p className="text-caption text-muted-foreground">
          Not available on this deployment yet.
        </p>
      ) : null}
    </div>
  )
}

type ReadState =
  | { stage: "idle" }
  | { stage: "reading" }
  | { stage: "done"; message: string }
  | { stage: "failed"; message: string }

/**
 * The one paid step in first run, and the largest single jump in draft quality.
 *
 * Calls `importFromX` unchanged. That action already carries the entitlement
 * gate, and `importXCorpus` behind it already carries the ceiling and the
 * cooldown. A copy of it without the cooldown, reachable by an account that is
 * ninety seconds old, is exactly the cost bug AGENTS.md's money section
 * describes.
 */
function CorpusCard({ alreadyRead }: { alreadyRead: number }) {
  const [state, setState] = React.useState<ReadState>(() =>
    alreadyRead > 0
      ? {
          stage: "done",
          message: `Already read ${alreadyRead} of your posts.`,
        }
      : { stage: "idle" }
  )

  async function read() {
    setState({ stage: "reading" })
    const result = await importFromX()

    if (!result.ok) {
      setState({ stage: "failed", message: result.message })
      return
    }

    setState({
      stage: "done",
      message: [
        `Read ${result.postsRead} posts.`,
        result.rulesWritten > 0
          ? `I wrote ${result.rulesWritten} voice rules and ${result.storiesWritten} stories.`
          : "Nothing new to learn from them yet.",
        // No silent caps: `truncated` reaches the copy.
        result.truncated ? "There are more, I stopped at the cap." : "",
      ]
        .filter(Boolean)
        .join(" "),
    })
  }

  return (
    <div className="bg-card flex flex-col gap-3 rounded-xl p-4 shadow-xs">
      <h3 className="text-card-title">
        While I have it: read my last 200 posts
      </h3>

      {state.stage === "done" ? (
        <p className="text-caption text-muted-foreground inline-flex items-start gap-1.5 text-pretty">
          <HugeiconsIcon
            aria-hidden="true"
            icon={Tick02Icon}
            className="mt-0.5 size-3.5 shrink-0"
          />
          {state.message}
        </p>
      ) : (
        <>
          <p className="text-caption text-muted-foreground text-pretty">
            This is the difference between a draft that sounds like you and one
            that sounds like a model. It is the only part of this you cannot do
            by describing yourself.
          </p>
          <p className="text-caption text-muted-foreground">
            About <span className="font-mono tabular-nums">$1.00</span>, charged
            by X at <span className="font-mono tabular-nums">$0.005</span> a
            post.
          </p>

          {state.stage === "failed" ? (
            <p className="text-caption text-destructive" role="alert">
              {state.message}
            </p>
          ) : null}

          <div>
            <Button
              size="sm"
              variant="outline"
              disabled={state.stage === "reading"}
              onClick={read}
            >
              {state.stage === "reading"
                ? "Reading your posts…"
                : state.stage === "failed"
                  ? "Try again"
                  : "Read my posts"}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * The two live sources, then the register with its buttons dead.
 *
 * The dead rows are shown rather than hidden: a roadmap you can see beats a
 * surface that pretends nothing else exists. What is not acceptable is a
 * button that looks live and does nothing, which is why the reason sits in
 * text above the group rather than in a tooltip no keyboard can reach.
 */
function SourceList({
  circlebackConnected,
  githubConnected,
  githubInstallUrl,
}: {
  circlebackConnected: boolean
  githubConnected: boolean
  /** Out to github.com. Null when the deployment has no App configured. */
  githubInstallUrl: string | null
}) {
  /**
   * **No in-app links here.** Until `onboardedAt` is set, every route in the
   * (app) group redirects back to /welcome — so a `<Link href="/sources">`
   * inside first run is a button that silently returns you to the page you
   * are on. That is exactly what happened on the first real run: pressing
   * Connect on Circleback looked like nothing at all.
   *
   * GitHub survives because its install is a link *out* to github.com, which
   * comes back through the callback and lands here with the row connected.
   * Circleback cannot: its setup is a server action that mints a webhook URL
   * to paste into another product and waits for a signing secret to come
   * back. That is a several-minute detour into somebody else's dashboard, and
   * first run is the wrong place for it — so it is described, not offered.
   */
  const live = [
    {
      id: "circleback",
      label: "Circleback",
      gives: "The moment worth quoting from a call",
      href: null,
      cta: null,
      connected: circlebackConnected,
    },
    {
      id: "github",
      label: "GitHub",
      gives: "Pull requests as they merge",
      href: githubInstallUrl,
      cta: "Install",
      connected: githubConnected,
    },
  ]

  const liveIds = new Set(live.map((s) => s.id))
  // From lib/sources.ts, in that file's order, so first run and /sources
  // cannot drift apart on what exists.
  const rest = SOURCES.filter((s) => !liveIds.has(s.id)).slice(0, 3)

  return (
    <div className="flex flex-col gap-3">
      <ul
        role="list"
        className="divide-border bg-card divide-y overflow-hidden rounded-xl shadow-xs"
      >
        {live.map((source) => (
          <li key={source.id} className="flex items-center gap-3 px-4 py-3">
            <Tile id={source.id} label={source.label} />
            <div className="flex min-w-0 flex-col">
              <span className="text-body">{source.label}</span>
              <span className="text-caption text-muted-foreground truncate">
                {source.gives}
              </span>
            </div>
            <div className="ml-auto shrink-0">
              {source.connected ? (
                <span className="text-caption text-muted-foreground inline-flex items-center gap-1.5">
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={Tick02Icon}
                    className="size-3.5"
                  />
                  Connected
                </span>
              ) : source.href && source.cta ? (
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<a href={source.href}>{source.cta}</a>}
                />
              ) : (
                <span className="text-caption text-muted-foreground">
                  After setup
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      <p className="text-caption text-muted-foreground px-1 text-pretty">
        The rest are on the way. Nothing reads them yet, so connecting one would
        do nothing.
      </p>

      <ul
        role="list"
        className={cn(
          "divide-border bg-card divide-y overflow-hidden rounded-xl shadow-xs",
          "opacity-60"
        )}
      >
        {rest.map((source) => (
          <li key={source.id} className="flex items-center gap-3 px-4 py-3">
            <Tile id={source.id} label={source.label} />
            <div className="flex min-w-0 flex-col">
              <span className="text-body">{source.label}</span>
              <span className="text-caption text-muted-foreground truncate">
                {source.gives}
              </span>
            </div>
            <div className="ml-auto shrink-0">
              <Button variant="outline" size="sm" disabled>
                Connect
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
