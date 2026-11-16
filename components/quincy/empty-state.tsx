"use client"

import * as React from "react"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import { Arrive, Card, Lead, ListRow, MarginNote, Text } from "@/components/kit"

export type EmptyStateProps = {
  /** One sentence, said by a person who has run out of work: "Nothing to send today." */
  bold: string
  /** What to do, in Quincy's voice: "Tell me about your week. I'll find the post in it." */
  rest?: string
  /**
   * The person's own baseline, so empty does not read as failing: "Your last
   * post went out Thursday, at 1.8× your median." Small and grey, under the
   * lead. Leave it out rather than invent one.
   */
  baseline?: string
  /**
   * The one way in: a ButtonLink ("Record a thought"), a Button, or
   * `EmptyStarters`. One, never two (states.md, "Empty").
   */
  children?: React.ReactNode
}

/**
 * Nothing here yet, and the one next step (plans/030 #10, lab 38). A Card
 * with a Lead in it. Put it in a Stage with no `lead` of its own: "This is
 * what came back." above "Nothing is waiting on you." says two things, and the
 * first is false (layout.md, "A Stage without a lead").
 *
 * The card is `with-margin`, so the starters' margin note has its column, and
 * so it lines up with the list it stands in for.
 */
export function EmptyState({ bold, rest, baseline, children }: EmptyStateProps) {
  return (
    <Card width="with-margin">
      <div className="flex flex-col gap-kit-related">
        <div className="flex flex-col gap-kit-tight">
          <Lead bold={bold} rest={rest} />
          {baseline ? (
            <Text variant="small" tone="muted">
              {baseline}
            </Text>
          ) : null}
        </div>
        {children ? <div>{children}</div> : null}
      </div>
    </Card>
  )
}

/** One way in, as an editor would ask it. */
export type Starter = {
  id: string
  /** What the person might say: "I shipped something". */
  label: string
  /** Hugeicon beside the label. Decorative. */
  icon: IconSvgElement
  /** Quincy's next question, once picked: "What was it, and who noticed first?" */
  ask: string
  /** The grey line under it: what to hand over and what Quincy does with it. */
  then: string
}

export type EmptyStartersProps = {
  starters: readonly Starter[]
  /** The margin note beside the starters, ≤ 6 words: "pick one. you don't have to write it up". */
  note?: string
  /** Told when one is picked (or un-picked, with null), so the composer can open on it. */
  onPick?: (starter: Starter | null) => void
}

/**
 * Three ways in, each a question an editor would ask next (lab 38). Rows, so
 * picking one is one press and its question arrives under them; picking it
 * again folds the question away. Nothing moves until the person picks.
 */
export function EmptyStarters({ starters, note, onPick }: EmptyStartersProps) {
  const [picked, setPicked] = React.useState<string | null>(null)
  // The last picked one stays rendered while Arrive closes, so the question
  // folds away with its words instead of emptying first.
  const [shown, setShown] = React.useState<Starter | undefined>(starters[0])

  const rows = (
    // -mx-3 cancels the row's own px-3 (list-row.tsx), so each row's label
    // lines up with the card's text above it. The group itself keeps the
    // content width, so a margin note around it lands at the right x.
    <div role="group" aria-label="Start with">
      <div className="-mx-3 flex flex-col">
      {starters.map((s) => (
        <ListRow
          key={s.id}
          selected={picked === s.id}
          leading={<HugeiconsIcon icon={s.icon} size={16} strokeWidth={1.8} aria-hidden />}
          onClick={() => {
            const next = picked === s.id ? null : s.id
            setShown(s)
            setPicked(next)
            onPick?.(next ? s : null)
          }}
        >
          {s.label}
        </ListRow>
      ))}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col">
      {note ? <MarginNote note={note}>{rows}</MarginNote> : rows}
      <Arrive show={picked !== null} from="below">
        {shown ? (
          <div aria-live="polite" className="flex flex-col gap-kit-tight pt-kit-related">
            <Text weight="strong">{shown.ask}</Text>
            <Text variant="small" tone="muted">
              {shown.then}
            </Text>
          </div>
        ) : null}
      </Arrive>
    </div>
  )
}
