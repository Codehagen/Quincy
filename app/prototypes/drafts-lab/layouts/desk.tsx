"use client"

import * as React from "react"
import { ArrowDown01Icon, ArrowUp01Icon } from "@hugeicons/core-free-icons"

import { Button, EmptyRegion, LiveDot, PanelBody, Tag, WorkspacePage } from "@/components/kit"
import { FOCUS_RING } from "@/components/kit/control-styles"

import { FromGlyph, NextCell, fromName } from "../parts/cells"
import { AllDecided, DraftsFilters, DraftsFoot, DraftsToolbar, FilteredEmpty, NothingYet } from "../parts/chrome"
import { DraftSheet } from "../parts/draft-sheet"
import { useDraftKeys } from "../parts/keys"
import type { LabOptions } from "../lab-options"
import type { DraftsStore } from "../use-drafts"

/**
 * 2 · Desk: one draft at a time, large, in the middle, the way an editor
 * reads a proof. The beats stand in a wide margin, the saved post sits
 * above it, and the verbs are keys: A approves and the next one is already
 * there, j skips, E edits. The list is reduced to its position ("4 of 27")
 * and the next few openings under the draft. It bets that Drafts is read,
 * not scanned, and that 109 waiting is worked through, not browsed.
 */

export function DeskLayout({ store, opts }: { store: DraftsStore; opts: LabOptions }) {
  return (
    <WorkspacePage>
      <DeskSurface store={store} opts={opts} />
    </WorkspacePage>
  )
}

const UP_NEXT = 4

function DeskSurface({ store, opts }: { store: DraftsStore; opts: LabOptions }) {
  const searchRef = React.useRef<HTMLInputElement>(null)
  const { move } = useDraftKeys(store, searchRef)
  const open = store.selected
  const i = open ? store.shown.findIndex((r) => r.id === open.id) : -1
  const next = store.shown.slice(i + 1, i + 1 + UP_NEXT)

  const position = (
    <span className="flex items-center gap-1">
      <span className="me-1 font-kit-mono text-kit-mono-sm whitespace-nowrap text-kit-ink-muted tabular-nums">
        {i >= 0 ? `${i + 1} of ${store.shown.length}` : `– of ${store.shown.length}`}
      </span>
      <Button size="xs" variant="ghost" icon={ArrowUp01Icon} shortcut="k" aria-label="Previous draft" onClick={() => move(-1)}>
        <span className="sr-only">Previous</span>
      </Button>
      <Button size="xs" variant="ghost" icon={ArrowDown01Icon} shortcut="j" aria-label="Next draft" onClick={() => move(1)}>
        <span className="sr-only">Next</span>
      </Button>
    </span>
  )

  return (
    <>
      <DraftsToolbar store={store} searchRef={searchRef} />
      {store.phase === "empty" ? (
        <NothingYet />
      ) : (
        <>
          <DraftsFilters store={store} count={false} end={position} />
          {store.phase !== "loading" && !open ? (
            // Nothing on the desk: the empty state stands in its middle.
            <PanelBody>
              <EmptyRegion>{store.shown.length === 0 ? <FilteredEmpty store={store} /> : <AllDecided />}</EmptyRegion>
            </PanelBody>
          ) : (
            <PanelBody label="The open draft" scrollKey={open?.id ?? null}>
              <div className="dl-desk mx-auto flex w-full max-w-[46rem] flex-col gap-kit-group px-kit-group pt-8 pb-12" data-type={opts.deskType}>
                {store.phase === "loading" ? (
                  <p role="status" className="text-kit-dense text-kit-ink-muted">
                    <LiveDot pulse>Getting your drafts.</LiveDot>
                  </p>
                ) : !open ? null : (
                  <>
                    <div className="flex min-w-0 items-center gap-2 text-kit-meta text-kit-ink-muted">
                      <FromGlyph row={open} />
                      <span className="truncate">{open.draft.from.adaptedFrom ? `Adapted from ${fromName(open)}` : `From your ${open.draft.from.sourceLabel}`}</span>
                      <span aria-hidden>·</span>
                      <span className="font-kit-mono text-kit-mono-sm">{open.draft.from.at}</span>
                      {open.draft.kind ? (
                        <span className="ms-auto">
                          <Tag look="text">{open.draft.kind}</Tag>
                        </span>
                      ) : null}
                    </div>
                    <DraftSheet row={open} store={store} />
                    {next.length > 0 ? <UpNext rows={next} use={opts.title} onPick={store.select} /> : null}
                  </>
                )}
              </div>
            </PanelBody>
          )}
        </>
      )}
      {store.phase === "empty" ? null : <DraftsFoot store={store} onUndo={store.undo} />}
    </>
  )
}

/** The next few in the view, as their opening lines: where j goes, without a list to scan. */
function UpNext({ rows, use, onPick }: { rows: DraftsStore["shown"]; use: "opening" | "idea"; onPick: (id: string) => void }) {
  return (
    <section aria-label="Up next" className="flex flex-col gap-px border-t border-kit-hairline pt-kit-related">
      <h2 className="px-3 pb-1 text-kit-meta font-kit-strong text-kit-ink-muted">Up next</h2>
      <ul className="flex flex-col gap-px">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              data-kit-row={r.id}
              onClick={() => onPick(r.id)}
              className={`grid w-full grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-kit-control px-3 py-1.5 text-left pointer-coarse:min-h-11 ${FOCUS_RING} transition-[background-color] duration-(--kit-duration-state) ease-kit-out hover:bg-kit-row-hover motion-reduce:transition-none`}
            >
              <FromGlyph row={r} />
              <span className="truncate text-kit-dense text-kit-ink-muted">{use === "idea" ? r.draft.idea : r.opening}</span>
              <span className="flex items-center gap-2">
                <NextCell row={r} />
                <span className="font-kit-mono text-kit-mono-sm text-kit-ink-muted tabular-nums">{r.draft.from.at}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
