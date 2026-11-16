"use client"

import * as React from "react"
import { Add01Icon, Cancel01Icon } from "@hugeicons/core-free-icons"

import type { EditablePage, PolicyData } from "@/lib/brain"
import {
  Button,
  DateInput,
  Field,
  IconButton,
  Input,
  Rule,
  Stepper,
  Text,
  Textarea,
} from "@/components/kit"
// Shared chrome, still under brain/: a channel's strategy is stored as a brain
// page and saved through the brain's write path. Only the surface moved. The
// caps and the pillar-weight invariant hold here exactly as they do at /brain.
import { EditorShell, useBrainForm } from "@/components/brain/editor-shell"
import { StringList } from "@/components/brain/string-list"
import { savePage } from "@/app/(app)/brain/actions"

const EMPTY: PolicyData = {
  platform: "x",
  goal: "",
  goalDate: "",
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
 * Rendering the page from fields and then letting somebody edit the rendered
 * prose is how "1 posts/day" ends up on screen, and how a reworded sentence can
 * quietly move a schedule. Here the fields are the
 * only representation and the prose is generated for the prompt.
 */
export function PolicyEditor({
  page,
  slug,
  title,
  save: saveOverride,
  actions,
}: {
  /**
   * `EditablePage`, not `BrainPage`: /brain holds its pages in a query cache
   * that has been through JSON, where a Date is a string. Nothing here reads a
   * timestamp, and the narrower type is what makes that true rather than
   * merely likely.
   */
  page: EditablePage | null
  slug: string
  title: string
  /**
   * The write path, when the caller owns one. /channels saves through
   * `savePage` — the default below — and /brain saves through the strategy
   * action, which balances the pillar weights on the way in rather than
   * refusing a split typed as 30/30/30.
   */
  save?: (data: PolicyData) => Promise<{ ok: boolean; error?: string }>
  /** Passed through to `EditorShell`, left of Save. See its own note. */
  actions?: React.ReactNode
}) {
  const save = React.useCallback(
    async (data: PolicyData) => {
      const cleaned = {
        ...data,
        pillars: data.pillars.filter((p) => p.name.trim()),
        windows: data.windows.map((w) => w.trim()).filter(Boolean),
        leanInto: data.leanInto.map((s) => s.trim()).filter(Boolean),
        avoid: data.avoid.map((s) => s.trim()).filter(Boolean),
      }

      return saveOverride
        ? saveOverride(cleaned)
        : savePage({ slug, kind: "policy", title, data: cleaned })
    },
    [saveOverride, slug, title]
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
      description="What I draft from every week. The weights and windows are read by the scheduler, not just by the model."
      dirty={form.dirty}
      state={form.state}
      error={form.error}
      onSave={form.onSave}
      actions={actions}
    >
      <div className="flex flex-col gap-kit-group">
        <Field label="Goal">
          <Input
            value={p.goal ?? ""}
            placeholder="Grow to 15,000 followers"
            onValueChange={(goal) => patch({ goal })}
          />
        </Field>

        {/* The date the goal is measured on. A goal with no date is a wish,
            and the weekly review has to know which week it is grading against. */}
        <div className="max-w-52">
          <Field label="By">
            <DateInput
              value={p.goalDate ?? ""}
              onValueChange={(goalDate) => patch({ goalDate })}
            />
          </Field>
        </div>

        <Field label="Positioning">
          <Textarea
            rows={2}
            value={p.positioning ?? ""}
            placeholder="The one line that says why someone follows you rather than anyone else."
            onValueChange={(positioning) => patch({ positioning })}
          />
        </Field>

        <Field label="Primary audience">
          <Textarea
            rows={2}
            value={p.audience?.primary ?? ""}
            onValueChange={(primary) =>
              patch({ audience: { ...p.audience, primary } })
            }
          />
        </Field>
      </div>

      <Rule />

      <Section
        legend="Topics"
        description="The split I draft to. Weights are a share of everything published, so they have to add up to 100."
      >
        <ul role="list" className="flex flex-col gap-kit-related">
          {p.pillars.map((pillar, index) => (
            <li key={index} className="flex flex-wrap items-center gap-kit-controls">
              <div className="min-w-40 flex-1">
                <Input
                  value={pillar.name}
                  placeholder="Product and building"
                  aria-label={`Topic ${index + 1} name`}
                  onValueChange={(name) =>
                    patch({
                      pillars: p.pillars.map((x, i) =>
                        i === index ? { ...x, name } : x
                      ),
                    })
                  }
                />
              </div>
              <Stepper
                label="Weight %"
                aria-label={`Weight % for ${pillar.name.trim() || `topic ${index + 1}`}`}
                min={0}
                max={100}
                step={5}
                largeStep={10}
                value={pillar.weight}
                onValueChange={(weight) => {
                  // Null only while the box is cleared mid-edit; it commits
                  // on blur, so the form keeps the last real number until then.
                  if (weight === null) return
                  patch({
                    pillars: p.pillars.map((x, i) =>
                      i === index ? { ...x, weight } : x
                    ),
                  })
                }}
              />
              <IconButton
                icon={Cancel01Icon}
                aria-label={`Remove topic ${index + 1}`}
                onClick={() =>
                  patch({ pillars: p.pillars.filter((_, i) => i !== index) })
                }
              />
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-kit-related">
          <Button
            icon={Add01Icon}
            onClick={() =>
              patch({ pillars: [...p.pillars, { name: "", weight: 0 }] })
            }
          >
            Add topic
          </Button>

          {/* Live, and stated as the thing to do rather than as a violation.
              The server rejects an unbalanced split, so being told at 60% beats
              being told after pressing Save. Ink only while it is off. */}
          <Text
            as="span"
            variant="small"
            tone={p.pillars.length > 0 && !balanced ? "ink" : "muted"}
          >
            <span className="tabular-nums">{total}%</span>
            {p.pillars.length > 0 && !balanced
              ? `, ${total > 100 ? "over" : "under"} by ${Math.abs(100 - total)}`
              : null}
          </Text>
        </div>
      </Section>

      <Rule />

      {/* Cadence, not Rhythm. /rhythm is the ritual scheduler — Heartbeat and
          the daily jobs — and this is how often a platform gets posted to.
          Two different things sharing one word, in an app where the word is
          also a top-level destination. The scheduler keeps it. */}
      <Section
        legend="Cadence"
        description="The scheduler reads the windows when it places a post."
      >
        <div className="flex flex-wrap gap-kit-controls">
          <Stepper
            label="Posts a day"
            min={0}
            max={20}
            value={p.cadence.postsPerDay}
            onValueChange={(postsPerDay) => {
              if (postsPerDay === null) return
              patch({ cadence: { ...p.cadence, postsPerDay } })
            }}
          />
          <Stepper
            label="Prepared a week"
            min={0}
            max={50}
            value={p.cadence.postsPerWeek}
            onValueChange={(postsPerWeek) => {
              if (postsPerWeek === null) return
              patch({ cadence: { ...p.cadence, postsPerWeek } })
            }}
          />
        </div>

        <ListField label="Posting windows">
          <StringList
            value={p.windows}
            onChange={(windows) => patch({ windows })}
            itemLabel="window"
            addLabel="Add window"
            placeholder="07:00"
          />
        </ListField>
      </Section>

      <Rule />

      <Section
        legend="Notes"
        description="Read by the model, not by the scheduler. Prose belongs here."
      >
        <ListField label="Lean into">
          <StringList
            value={p.leanInto}
            onChange={(leanInto) => patch({ leanInto })}
            itemLabel="note"
            addLabel="Add"
            placeholder="Story-first structure: open with a moment"
          />
        </ListField>
        <ListField label="Avoid">
          <StringList
            value={p.avoid}
            onChange={(avoid) => patch({ avoid })}
            itemLabel="note"
            addLabel="Add"
            placeholder="Generic advice that could come from anyone"
          />
        </ListField>
      </Section>
    </EditorShell>
  )
}

/**
 * A group of fields under one name. A real fieldset, so the legend names
 * the group for a screen reader; the legend is body at 560, because inside a
 * page hierarchy is weight and grey (docs/design/type.md).
 */
function Section({
  legend,
  description,
  children,
}: {
  legend: string
  description: string
  children: React.ReactNode
}) {
  const id = React.useId()
  return (
    <fieldset aria-describedby={id} className="m-0 flex min-w-0 flex-col gap-kit-related border-0 p-0">
      <legend className="float-left mb-kit-tight w-full p-0 text-kit-body font-kit-strong text-kit-ink">
        {legend}
      </legend>
      <Text id={id} tone="muted">
        {description}
      </Text>
      {children}
    </fieldset>
  )
}

/**
 * A label over a StringList. Not a kit Field: a Field labels one control,
 * and a StringList is several inputs, each named by its own row. So the
 * label is a group name (`role="group"`), as it was before.
 */
function ListField({ label, children }: { label: string; children: React.ReactNode }) {
  const id = React.useId()
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-1.5">
      <Text as="span" id={id} weight="strong">
        {label}
      </Text>
      {children}
    </div>
  )
}
