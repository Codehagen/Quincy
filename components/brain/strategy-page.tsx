"use client"

import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Alert02Icon, Megaphone01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { brainKeys } from "@/lib/brain-keys"
import type { EditablePage } from "@/lib/brain"
import {
  channelTitle,
  strategyMarkdown,
  strategySlug,
  type Strategy,
} from "@/lib/strategy-format"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Markdown } from "@/components/ui/markdown"
import { EditorShell } from "@/components/brain/editor-shell"
import { PolicyEditor } from "@/components/channels/policy-editor"
import {
  proposeStrategyAction,
  saveStrategyPage,
} from "@/app/(app)/brain/actions"

/**
 * The strategy for one channel, on /brain. Plan 027, 3a.
 *
 * **The editor is not new and is not copied.** `PolicyEditor` has edited this
 * exact page from /channels/[platform] since channels existed, and it is
 * imported rather than reimplemented — a second form over the same `data`
 * would be a second place for the pillar weights to be validated differently.
 * What is new is everything around it: a way to get a first strategy without
 * typing eight fields, and a rendered read view, because a plan is read far
 * more often than it is edited.
 *
 * Read is the default and edit is the request, which is the split
 * `ProseEditor` already makes on the identity and memory pages. The markdown
 * is generated from `data` on every render and never stored — the fields stay
 * the one authoritative representation, which is the rule `PolicyEditor` was
 * built around.
 */
export function StrategyPage({
  page,
  channel,
  corpusPosts,
  cooldown,
}: {
  page: EditablePage | null
  channel: string
  /** How many of their own posts Quincy has read. Named in the empty state. */
  corpusPosts: number
  /** "Proposed 2 hours ago — try again after 12:00", or null when ready. */
  cooldown: string | null
}) {
  const [editing, setEditing] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [notice, setNotice] = React.useState(cooldown)
  const [error, setError] = React.useState<string>()
  const queryClient = useQueryClient()

  const slug = strategySlug(channel)
  const label = channelTitle(channel)

  const propose = React.useCallback(async () => {
    setPending(true)
    setError(undefined)

    try {
      const result = await proposeStrategyAction(channel)

      if (result.ok) {
        // The page arrives through the same cache every other brain surface
        // reads, so the tree, the editor and this view all move together.
        void queryClient.invalidateQueries({ queryKey: brainKeys.lists() })
        setNotice(result.notice)
      } else {
        // The server writes these and they name the thing to do — a clock time
        // for a cooldown, a next step for an account with no corpus.
        setError(result.error)
      }
    } catch (cause) {
      console.error(cause)
      setError("Could not reach Quincy. Try again.")
    } finally {
      setPending(false)
    }
  }, [channel, queryClient])

  const save = React.useCallback(
    async (data: Strategy) => saveStrategyPage(channel, data),
    [channel]
  )

  const proposeButton = (
    <ProposeButton
      pending={pending}
      notice={notice}
      variant={page ? "outline" : "default"}
      onPress={() => void propose()}
    />
  )

  if (!page) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-8 py-10">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Megaphone01Icon} />
            </EmptyMedia>
            <EmptyTitle>No strategy for {label} yet</EmptyTitle>
            <EmptyDescription>
              {corpusPosts > 0
                ? `Quincy can propose one from your ${corpusPosts.toLocaleString("en-US")} posts: what this channel is for, who is on the other end, and the split it writes to. You edit it afterwards, and every number in it is yours to change.`
                : "Quincy proposes one from the posts it has read. Connect X on /channels and let it read yours first."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>{proposeButton}</EmptyContent>
        </Empty>

        <Failure error={error} />
        <Waiting notice={notice} centred />
      </div>
    )
  }

  if (editing) {
    return (
      <PolicyEditor
        key={slug}
        page={page}
        slug={slug}
        title={label}
        save={save}
        actions={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            // Fixed width for the reason ProseEditor gives: the two labels are
            // different lengths and this is the button you just pressed.
            className="min-w-[5.5rem]"
            onClick={() => setEditing(false)}
          >
            Preview
          </Button>
        }
      />
    )
  }

  const markdown = strategyMarkdown((page.data ?? {}) as Partial<Strategy>)

  return (
    <EditorShell
      title={label}
      description="What Quincy drafts to on this channel. The pillars and the avoid list go into every draft; the weights and windows are for the schedule."
      // Nothing is editable in the read view, so there is nothing to save. The
      // control stays in place rather than moving between the two modes.
      dirty={false}
      state="idle"
      error={error}
      onSave={() => {}}
      actions={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-w-[5.5rem]"
          onClick={() => setEditing(true)}
        >
          Edit
        </Button>
      }
      aside={
        page.provenance === "inferred" ? (
          <p className="max-w-[60ch] text-caption text-pretty text-muted-foreground">
            Quincy proposed this from your posts. Nothing here has been
            confirmed — edit anything that is wrong and the page becomes yours.
          </p>
        ) : null
      }
    >
      <div className="flex w-full max-w-[65ch] flex-col gap-8">
        {markdown ? (
          <Markdown>{markdown}</Markdown>
        ) : (
          <p className="text-body text-muted-foreground">Nothing here yet.</p>
        )}

        {/* Under the plan rather than beside the heading, and that is a
            decision about which control is the loudest. On a page that already
            holds a strategy the action is Save, and a second wide button in
            the header row would compete with it — and overflow the row on a
            phone, where the header actions do not wrap. Rewriting the plan is
            a thing you go looking for. */}
        <section className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {proposeButton}
          <Waiting notice={notice} />
        </section>
      </div>
    </EditorShell>
  )
}

/**
 * One button, and it spends.
 *
 * `outline` once a strategy exists, `default` when there is none: the filled
 * variant is reserved for the one action a screen is for, and on a page that
 * already holds a plan that action is Save. The same reading
 * `components/brain/voice-preview.tsx` makes.
 */
function ProposeButton({
  pending,
  notice,
  variant,
  onPress,
}: {
  pending: boolean
  notice: string | null
  variant: "default" | "outline"
  onPress: () => void
}) {
  return (
    <Button
      type="button"
      variant={variant}
      size={variant === "outline" ? "sm" : undefined}
      disabled={pending || Boolean(notice)}
      onClick={onPress}
      // Sized for the longer label, so the row does not reflow under the
      // pointer the instant it is pressed.
      style={{ minWidth: "11rem" }}
    >
      {pending ? "Reading your posts…" : "Propose from my posts"}
    </Button>
  )
}

/**
 * The cooldown, in words.
 *
 * A disabled button with no sentence beside it is a dead control, and the two
 * facts a person needs are when it last ran and when it comes back — see
 * `cooldownNotice`, which writes this string in their own timezone.
 */
function Waiting({
  notice,
  centred,
}: {
  notice: string | null
  centred?: boolean
}) {
  if (!notice) return null

  return (
    <p
      className={
        centred
          ? "text-center text-caption text-pretty text-muted-foreground"
          : "text-caption text-pretty text-muted-foreground"
      }
    >
      {notice}
    </p>
  )
}

function Failure({ error }: { error?: string }) {
  if (!error) return null

  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-md border border-destructive/30 px-3 py-2 text-body text-destructive"
    >
      <HugeiconsIcon icon={Alert02Icon} className="mt-0.5 shrink-0" />
      <span className="text-pretty">{error}</span>
    </p>
  )
}
