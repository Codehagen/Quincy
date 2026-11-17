import * as React from "react"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"

import type { Connection, Source } from "@/lib/sources"
import { Button, Card, Rule, Text } from "@/components/kit"
import { SourceGlyph } from "@/components/sources/source-glyph"

/**
 * The rows of /sources, on the kit (plans/029).
 *
 * `SourceList` is the object, `SourceRowFrame` the row every source shares
 * (the live client rows build on it too), and `SourceRow` the register row
 * for a source with no connection model.
 *
 * The row is the landing's reads-and-posts row: a glyph tile, the name in
 * strong body, what it hands over in muted small, and its one control at the
 * end. The state sits in the text column, under the description, at every
 * width. The old row drew it twice (a desktop column and a phone copy); one
 * line in the column the eye already reads is enough, and it never drops at
 * 390px.
 *
 * Not a ListRow: a ListRow is a button that opens something, and these rows
 * hold their own controls (Connect, Manage, a form). So the object is a Card
 * with a list in it, as the landing's panel is.
 *
 * **Nothing here is live in the kit's sense.** A row says its state in
 * words; working is the friend beside the words while a read runs.
 */

export function SourceList({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <ul role="list" className="flex flex-col gap-kit-group">
        {children}
      </ul>
    </Card>
  )
}

/**
 * The id of a row's name, so a control whose visible label is the same on
 * every row ("Manage") can say which row through `aria-describedby` instead
 * of an aria-label that drops its visible words (buttons.md). Deterministic
 * rather than useId, so the server register row can use it too.
 */
export function sourceNameId(id: string) {
  return `source-${id}-name`
}

export function SourceRowFrame({
  id,
  name,
  description,
  status,
  action,
  quiet = false,
  children,
}: {
  /** A source or channel id, for the glyph. */
  id: string
  /** The name as the row says it: "GitHub", "X, @ada". */
  name: string
  /** What it hands over, in a short sentence. Wraps; never truncates. */
  description: React.ReactNode
  /** The state, as words: "Last merge yesterday". One muted line or a node. */
  status?: React.ReactNode
  /** The row's one control, at the end. */
  action?: React.ReactNode
  /** A source that cannot be connected yet: the quiet tile. */
  quiet?: boolean
  /** What opens under the row (a setup panel, a question, a receipt). */
  children?: React.ReactNode
}) {
  return (
    <li className="flex flex-col gap-kit-related">
      {/* A grid so the control moves under the text on a phone rather than
          squeezing the description into a column of four words (measured at
          390px). From 40rem it sits at the row's end. */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-kit-related sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <div className="self-start sm:self-center">
          <SourceGlyph id={id} label={name} quiet={quiet} />
        </div>

        <div className="flex min-w-0 flex-col gap-kit-tight">
          <Text id={sourceNameId(id)} weight="strong">
            {name}
          </Text>
          {/* Wraps rather than truncates. Measured at 390px on the old row,
              `truncate` clipped 7 of 11 of these, and this line is the only
              thing that says what a source hands over. */}
          <Text as="div" variant="small" tone="muted">
            {description}
          </Text>
          {status ? (
            <Text as="div" variant="small" tone="muted">
              {status}
            </Text>
          ) : null}
        </div>

        {action ? (
          <div className="col-start-2 flex items-center sm:col-start-3">
            {action}
          </div>
        ) : null}
      </div>

      {children ? (
        // Under the text column from 40rem (36px tile + 12px gap), so what
        // opens reads as the row's, not as the next row. Full width on a
        // phone, where 48px of indent is a quarter of the line.
        <div className="flex flex-col gap-kit-group sm:pl-[calc(2.25rem+var(--spacing-kit-related))]">
          {children}
        </div>
      ) : null}
    </li>
  )
}

/** A fold between the row and the panel it opens. */
export function SourcePanelRule() {
  return <Rule />
}

const STATE_LABEL: Record<Connection["state"], string> = {
  arriving: "Arriving",
  waiting: "Nothing yet",
  paused: "Paused",
  broken: "Needs reconnecting",
}

/**
 * One row of the register: a source with no connection model yet.
 *
 * A server component, and it stays one. In production every row renders
 * `connection: null`, because nothing can connect these yet. The connected
 * states exist so app/prototypes/sources can lay them out against this same
 * component before the database can produce them.
 *
 * `connection === null` renders no control. The old row drew a disabled
 * Connect on each; the kit does not ship a control that means "not yet"
 * (buttons.md), and the Stage above the list says why in words.
 *
 * `broken` is the one state that interrupts. It says so in ink rather than
 * the muted grey of the others, and its control changes to Reconnect, which
 * is what carries it. Not red: the kit's danger colour labels destructive
 * actions only (states.md), and reconnecting destroys nothing.
 */
export function SourceRow({
  source,
  connection,
}: {
  source: Source
  /** null = never connected. */
  connection: Connection | null
}) {
  const when =
    connection === null
      ? null
      : connection.state === "waiting"
        ? `connected ${connection.since}`
        : connection.lastAt

  return (
    <SourceRowFrame
      id={source.id}
      name={source.label}
      description={source.gives}
      quiet={connection === null}
      status={
        connection === null ? null : connection.state === "broken" ? (
          <span className="text-kit-ink">
            {STATE_LABEL.broken}. Last arrived {when}.
          </span>
        ) : (
          `${STATE_LABEL[connection.state]}, ${when}`
        )
      }
      action={
        connection === null ? null : connection.state === "broken" ? (
          <Button aria-describedby={sourceNameId(source.id)}>Reconnect</Button>
        ) : (
          <Button aria-describedby={sourceNameId(source.id)} iconEnd={ArrowRight01Icon}>
            Manage
          </Button>
        )
      }
    />
  )
}
