"use client"

import * as React from "react"
import { Add01Icon, Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@/lib/utils"
import type { BrainPage, PolicyData } from "@/lib/brain"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
// Shared chrome, still under brain/: a channel's strategy is stored as a brain
// page and saved through the brain's write path. Only the surface moved. The
// caps and the pillar-weight invariant hold here exactly as they do at /brain.
import { EditorShell, useBrainForm } from "@/components/brain/editor-shell"
import { StringList } from "@/components/brain/string-list"
import { savePage } from "@/app/(app)/brain/actions"

const EMPTY: PolicyData = {
  platform: "x",
  goal: "",
  positioning: "",
  audience: { primary: "", secondary: "" },
  pillars: [],
  cadence: { postsPerDay: 1, postsPerWeek: 7 },
  windows: [],
  leanInto: [],
  avoid: [],
}

/**
 * Strategy is configuration, not a document.
 *
 * The pillar weights and posting windows drive queue slots and the weekly draft
 * run, so they get real controls rather than a paragraph a model has to parse.
 * The reference implementation renders this page from fields and then lets you
 * edit the rendered prose, which is how "1 posts/day" ends up on screen and how
 * a reworded sentence can quietly move your schedule. Here the fields are the
 * only representation and the prose is generated for the prompt.
 */
export function PolicyEditor({
  page,
  slug,
  title,
}: {
  page: BrainPage | null
  slug: string
  title: string
}) {
  const save = React.useCallback(
    async (data: PolicyData) =>
      savePage({
        slug,
        kind: "policy",
        title,
        data: {
          ...data,
          pillars: data.pillars.filter((p) => p.name.trim()),
          windows: data.windows.map((w) => w.trim()).filter(Boolean),
          leanInto: data.leanInto.map((s) => s.trim()).filter(Boolean),
          avoid: data.avoid.map((s) => s.trim()).filter(Boolean),
        },
      }),
    [slug, title]
  )

  const initial = React.useMemo(
    () => ({ ...EMPTY, ...((page?.data as PolicyData | undefined) ?? {}) }),
    [page]
  )
  const form = useBrainForm(initial, save)
  const p = form.value

  function patch(next: Partial<PolicyData>) {
    form.setValue({ ...p, ...next })
  }

  const total = p.pillars.reduce((sum, pillar) => sum + (pillar.weight || 0), 0)
  const balanced = total === 100

  return (
    <EditorShell
      title={title}
      description="What Quincy drafts from every week. The weights and windows are read by the scheduler, not just by the model."
      dirty={form.dirty}
      state={form.state}
      error={form.error}
      onSave={form.onSave}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="policy-goal">Goal</FieldLabel>
          <Input
            id="policy-goal"
            value={p.goal ?? ""}
            placeholder="Grow to 15,000 followers"
            onChange={(e) => patch({ goal: e.target.value })}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="policy-positioning">Positioning</FieldLabel>
          <Textarea
            id="policy-positioning"
            rows={2}
            value={p.positioning ?? ""}
            placeholder="The one line that says why someone follows you rather than anyone else."
            onChange={(e) => patch({ positioning: e.target.value })}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="policy-audience">Primary audience</FieldLabel>
          <Textarea
            id="policy-audience"
            rows={2}
            value={p.audience?.primary ?? ""}
            onChange={(e) =>
              patch({ audience: { ...p.audience, primary: e.target.value } })
            }
          />
        </Field>
      </FieldGroup>

      <FieldSet>
        <FieldLegend>Content pillars</FieldLegend>
        <FieldDescription>
          The split Quincy drafts to. Weights are a percentage of everything
          published, so they have to add up.
        </FieldDescription>

        <ul role="list" className="flex flex-col gap-2">
          {p.pillars.map((pillar, index) => (
            <li key={index} className="flex items-center gap-2">
              <Input
                value={pillar.name}
                placeholder="Product and building"
                aria-label={`Pillar ${index + 1} name`}
                onChange={(e) =>
                  patch({
                    pillars: p.pillars.map((x, i) =>
                      i === index ? { ...x, name: e.target.value } : x
                    ),
                  })
                }
              />
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                value={pillar.weight}
                aria-label={`Pillar ${index + 1} weight, percent`}
                className="tabular w-20"
                onChange={(e) =>
                  patch({
                    pillars: p.pillars.map((x, i) =>
                      i === index
                        ? { ...x, weight: Number(e.target.value) || 0 }
                        : x
                    ),
                  })
                }
              />
              <span className="w-3 text-caption text-muted-foreground">%</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove pillar ${index + 1}`}
                onClick={() =>
                  patch({ pillars: p.pillars.filter((_, i) => i !== index) })
                }
              >
                <HugeiconsIcon icon={Cancel01Icon} />
              </Button>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              patch({ pillars: [...p.pillars, { name: "", weight: 0 }] })
            }
          >
            <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
            Add pillar
          </Button>

          {/* Live, and stated as the thing to do rather than as a violation.
              The server rejects an unbalanced split, so being told at 60% beats
              being told after pressing Save. */}
          <span
            className={cn(
              "tabular text-caption",
              p.pillars.length === 0
                ? "text-muted-foreground"
                : balanced
                  ? "text-muted-foreground"
                  : "text-foreground"
            )}
          >
            {total}%
            {p.pillars.length > 0 && !balanced
              ? ` — ${total > 100 ? "over" : "under"} by ${Math.abs(100 - total)}`
              : null}
          </span>
        </div>
      </FieldSet>

      <FieldSet>
        {/* Cadence, not Rhythm. /rhythm is the ritual scheduler — Heartbeat and
            the daily jobs — and this is how often a platform gets posted to.
            Two different things sharing one word, in an app where the word is
            also a top-level destination. The scheduler keeps it. */}
        <FieldLegend>Cadence</FieldLegend>
        <FieldDescription>
          Windows are read by the scheduler when it places a post.
        </FieldDescription>

        <FieldGroup>
          <div className="flex gap-4">
            <Field className="max-w-40">
              <FieldLabel htmlFor="policy-per-day">Posts per day</FieldLabel>
              <Input
                id="policy-per-day"
                type="number"
                inputMode="numeric"
                min={0}
                className="tabular"
                value={p.cadence.postsPerDay}
                onChange={(e) =>
                  patch({
                    cadence: {
                      ...p.cadence,
                      postsPerDay: Number(e.target.value) || 0,
                    },
                  })
                }
              />
            </Field>
            <Field className="max-w-40">
              <FieldLabel htmlFor="policy-per-week">Prepared weekly</FieldLabel>
              <Input
                id="policy-per-week"
                type="number"
                inputMode="numeric"
                min={0}
                className="tabular"
                value={p.cadence.postsPerWeek}
                onChange={(e) =>
                  patch({
                    cadence: {
                      ...p.cadence,
                      postsPerWeek: Number(e.target.value) || 0,
                    },
                  })
                }
              />
            </Field>
          </div>

          <Field>
            <FieldLabel>Posting windows</FieldLabel>
            <StringList
              value={p.windows}
              onChange={(windows) => patch({ windows })}
              itemLabel="window"
              addLabel="Add window"
              placeholder="07:00"
            />
          </Field>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Notes</FieldLegend>
        <FieldDescription>
          Read by the model, not by the scheduler. Prose belongs here.
        </FieldDescription>

        <FieldGroup>
          <Field>
            <FieldLabel>Lean into</FieldLabel>
            <StringList
              value={p.leanInto}
              onChange={(leanInto) => patch({ leanInto })}
              itemLabel="note"
              addLabel="Add"
              placeholder="Story-first structure: open with a moment"
            />
          </Field>
          <Field>
            <FieldLabel>Avoid</FieldLabel>
            <StringList
              value={p.avoid}
              onChange={(avoid) => patch({ avoid })}
              itemLabel="note"
              addLabel="Add"
              placeholder="Generic advice that could come from anyone"
            />
          </Field>
        </FieldGroup>
      </FieldSet>
    </EditorShell>
  )
}
