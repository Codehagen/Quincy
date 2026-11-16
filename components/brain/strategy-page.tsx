"use client"

import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"

import { brainKeys } from "@/lib/brain-keys"
import type { EditablePage } from "@/lib/brain"
import {
  channelTitle,
  strategyMarkdown,
  strategySlug,
  type Strategy,
} from "@/lib/strategy-format"
import { Button, Card, EmptyState, Text } from "@/components/kit"
import { Markdown } from "@/components/ui/markdown"
import { Friend } from "@/components/mascot"
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
      variant={page ? "quiet" : "action"}
      onPress={() => void propose()}
    />
  )

  if (!page) {
    return (
      <Card>
        <div className="flex flex-col gap-kit-related">
          <EmptyState
            frame="none"
            media={<Friend size={40} state="idle" className="text-kit-ink" />}
            bold={`No plan for ${label} yet.`}
            rest={
              corpusPosts > 0
                ? `I can propose one from your ${corpusPosts.toLocaleString("en-US")} posts: what this channel is for, who reads it, and the split I write to. Every number in it is yours to change.`
                : "I propose one from the posts I have read. Connect X on Channels and let me read yours first."
            }
          >
            {proposeButton}
          </EmptyState>

          <Failure error={error} />
          <Waiting notice={notice} />
        </div>
      </Card>
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
          // Both labels reserved for the reason ProseEditor gives: they are
          // different lengths and this is the button you just pressed.
          <Button reserve={["Edit"]} onClick={() => setEditing(false)}>
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
        <Button reserve={["Preview"]} onClick={() => setEditing(true)}>
          Edit
        </Button>
      }
      aside={
        page.provenance === "inferred" ? (
          <Text variant="small" tone="muted">
            Quincy proposed this from your posts. Nothing here is confirmed
            yet: edit anything that is wrong and the page becomes yours.
          </Text>
        ) : null
      }
    >
      <div className="flex w-full flex-col gap-kit-group">
        {markdown ? (
          // The kit's page preset (no remark-breaks), as ProseEditor.
          <Markdown preset="kit-page">
            {markdown}
          </Markdown>
        ) : (
          <Text tone="muted">Nothing here yet.</Text>
        )}

        {/* Under the plan rather than beside the heading, and that is a
            decision about which control is the loudest. On a page that already
            holds a strategy the action is Save, and a second wide button in
            the header row would compete with it — and overflow the row on a
            phone, where the header actions do not wrap. Rewriting the plan is
            a thing you go looking for. */}
        <section className="flex flex-wrap items-center gap-x-kit-group gap-y-kit-tight">
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
 * `quiet` once a strategy exists, `action` when there is none: the ink pill is
 * reserved for the one action a screen is for, and on a page that already
 * holds a plan that action is Save. The same reading
 * `components/brain/voice-preview.tsx` makes. `pendingLabel` reserves the
 * longer label's width, so the row does not reflow under the pointer.
 */
function ProposeButton({
  pending,
  notice,
  variant,
  onPress,
}: {
  pending: boolean
  notice: string | null
  variant: "action" | "quiet"
  onPress: () => void
}) {
  return (
    <Button
      variant={variant}
      pending={pending}
      pendingLabel="Reading your posts…"
      disabled={Boolean(notice)}
      onClick={onPress}
    >
      Propose from my posts
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
function Waiting({ notice }: { notice: string | null }) {
  if (!notice) return null

  return (
    <Text variant="small" tone="muted">
      {notice}
    </Text>
  )
}

/**
 * The server writes these and they name the way out, so the sentence stands
 * alone. Ink, not red, and `status` rather than `alert`: a refusal is not
 * destruction and nothing the person wrote is at risk (docs/design/states.md).
 */
function Failure({ error }: { error?: string }) {
  if (!error) return null

  return (
    <div role="status">
      <Text>{error}</Text>
    </div>
  )
}
