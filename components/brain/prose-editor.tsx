"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import type { EditablePage } from "@/lib/brain"
import { Button, Text, Textarea } from "@/components/kit"
import { Markdown } from "@/components/ui/markdown"
import { EditorShell, useBrainForm } from "@/components/brain/editor-shell"
import { correctPage, savePage } from "@/app/(app)/brain/actions"

/**
 * The only two kinds that are genuinely prose: identity and memory. Everything
 * else in the brain has a schema and gets a form, because `data` is the
 * authoritative representation there and a text box over it would be editing
 * the view. See docs/brain.md.
 *
 * Two modes, because the two things you do here are not the same activity.
 * Reading is the common one — a memory page exists so you can check what Quincy
 * believes about you, and My Human gets written once and revised rarely. Left
 * permanently in a textarea, the common case means reading raw `## heading` and
 * `- bullet` forever. So: rendered by default, source on request.
 *
 * Rendered means `.typeset` + the kit's page preset (`preset="kit-page"`),
 * the surface AGENTS.md reserves for exactly this ("Rendered markdown |
 * Brain").
 */
export function ProseEditor({
  page,
  slug,
  title,
  description,
  cap,
}: {
  page: EditablePage | null
  slug: string
  title: string
  description: string
  cap?: number
}) {
  // Two different questions, and conflating them loses data.
  //
  // Which write path: any page that carries `data` must go through
  // applyCorrection, because savePage defaults `data` to `{}` and a body-only
  // edit would silently drop it. For a story that means the point, hook, proof
  // and use-for tags that decide when it gets picked — gone, from editing a
  // typo. This holds whatever the provenance is, so a story you corrected last
  // week is as safe as one you have never touched.
  const patches = page?.kind === "memory" || page?.kind === "story"

  // Whether to say Quincy wrote it: that is about provenance, and it stops
  // being true the moment you correct the page.
  const isCompiled = patches && page.provenance !== "user"

  const save = React.useCallback(
    async (body: string) =>
      patches
        ? correctPage({ slug, body, note: `Edited ${title}` })
        : savePage({ slug, kind: page?.kind ?? "identity", title, body }),
    [patches, page?.kind, slug, title]
  )

  const form = useBrainForm(page?.body ?? "", save)

  // Read is the default only when there is something to read. An empty page
  // rendered is a blank screen with a button on it, so a page with no body
  // opens where the work actually is.
  const [editing, setEditing] = React.useState(!page?.body?.trim())

  const over = cap !== undefined && form.value.length > cap
  // A counter earns its place when it is close to biting. 271 of 50,000 is a
  // number nobody can act on, and it sits there implying the cap is a live
  // concern. Voice's 4 / 15 is worth showing because 15 is reachable.
  const near = cap !== undefined && form.value.length >= cap * 0.8

  return (
    <EditorShell
      title={title}
      description={description}
      dirty={form.dirty}
      state={form.state}
      error={form.error}
      onSave={form.onSave}
      actions={
        // Both labels reserved, because they are different lengths and this
        // button is the thing you just clicked — it must not move out from
        // under the pointer on the way to its new state.
        <Button
          reserve={["Preview", "Edit"]}
          onClick={() => setEditing((value) => !value)}
        >
          {editing ? "Preview" : "Edit"}
        </Button>
      }
      aside={
        isCompiled ? (
          <Text variant="small" tone="muted">
            {/* Where it came from is different per kind, and saying
                "conversations" on a story distilled from a published post is
                the notice being wrong about the one fact it exists to give. */}
            {page.kind === "story"
              ? "Quincy distilled this from something you published."
              : "Quincy wrote this from your conversations."}{" "}
            Edit it and it becomes yours: Heartbeat stops rewriting the page,
            and anything it wanted to add later waits for you.
          </Text>
        ) : null
      }
    >
      <div className="flex w-full flex-col gap-kit-tight">
        {editing ? (
          /* The kit Textarea: labelled by the page title, ⌘/Ctrl+Enter submits
             the form (so it saves), and at document size it grows with the
             text with no ceiling, so the page scrolls, not a box inside it.

             No .typeset here, deliberately — that is the preview's job.
             Typeset styles rendered markdown, and a textarea has no paragraphs
             or headings to style, only a value. */
          <Textarea
            value={form.value}
            onValueChange={form.setValue}
            aria-label={title}
            spellCheck
            rows={12}
            size="document"
          />
        ) : form.value.trim() ? (
          // The kit's page preset: no remark-breaks (these pages are
          // hard-wrapped markdown), in the kit's type and colour, so the page
          // reads like the Card around it. No text-* utility reaches inside
          // (AGENTS.md, "The two type systems").
          <Markdown preset="kit-page">
            {form.value}
          </Markdown>
        ) : (
          <Text tone="muted">Nothing here yet.</Text>
        )}

        {editing && cap !== undefined && near ? (
          <div className="flex justify-end">
            <span
              className={cn(
                "text-kit-small tabular-nums",
                over ? "text-kit-danger" : "text-kit-ink-muted"
              )}
            >
              {form.value.length.toLocaleString("en-US")} /{" "}
              {cap.toLocaleString("en-US")}
            </span>
          </div>
        ) : null}
      </div>
    </EditorShell>
  )
}
