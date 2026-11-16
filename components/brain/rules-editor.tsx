"use client"

import * as React from "react"

import { RULE_CAP, type EditablePage } from "@/lib/brain"
import type { BrainKind } from "@/lib/schema-app"
import { EditorShell, useBrainForm } from "@/components/brain/editor-shell"
import { StringList } from "@/components/brain/string-list"
import { VoicePreview } from "@/components/brain/voice-preview"
import { savePage } from "@/app/(app)/brain/actions"

/**
 * Voice and hard rules. A list, not a document.
 *
 * The cap is the feature. Fifteen is enough to say what matters and few enough
 * that the sixteenth rule has to displace a weaker one rather than joining it,
 * which is what stops a rule list from decaying into an essay nobody obeys.
 * The counter is shown in the control and the server rejects the overflow, so
 * the limit is visible before it is hit and real when it is.
 */
export function RulesEditor({
  page,
  slug,
  kind,
  title,
  description,
}: {
  page: EditablePage | null
  slug: string
  kind: Extract<BrainKind, "voice" | "instruction">
  title: string
  description: string
}) {
  const save = React.useCallback(
    async (rules: string[]) =>
      savePage({
        slug,
        kind,
        title,
        // Blank rows are how a half-finished thought looks, not a rule. Dropped
        // on save rather than on blur, so the row does not vanish mid-typing.
        data: { rules: rules.map((r) => r.trim()).filter(Boolean) },
      }),
    [kind, slug, title]
  )

  const initial = React.useMemo(
    () => ((page?.data as { rules?: string[] })?.rules ?? []) as string[],
    [page]
  )
  const form = useBrainForm(initial, save)

  return (
    <EditorShell
      title={title}
      description={description}
      dirty={form.dirty}
      state={form.state}
      error={form.error}
      onSave={form.onSave}
    >
      <StringList
        value={form.value}
        onChange={form.setValue}
        max={RULE_CAP}
        itemLabel="rule"
        addLabel="Add rule"
        placeholder={
          kind === "voice"
            ? "Never imitate another writer"
            : "Never invent numbers or client names"
        }
      />

      {/* Voice only. Hard rules are constraints the writer may not break, and
          "here is the same post with and without your constraints" is not a
          question anybody has — the interesting comparison is the one about
          how you sound. See components/brain/voice-preview.tsx. */}
      {kind === "voice" ? <VoicePreview /> : null}
    </EditorShell>
  )
}
