"use client"

import * as React from "react"

import { SearchField } from "@/components/kit"

import type { MediaEntry } from "./studio"
import { formatClockTenths } from "./studio-parts"

/**
 * The library: what this project is cut from (plans/036, phase E).
 *
 * Open by default on Media, as its own card beside the rail. It lists this
 * project's recordings only. There is no "All assets" tab and no add button
 * yet: the app has no listing of every upload and no way to add a second
 * recording to a cut, and a tab or a button that does nothing reads as
 * broken. The search filters by file name, which earns its place once a
 * project holds more than one take.
 */
export function StudioLibrary({ media }: { media: readonly MediaEntry[] }) {
  const [query, setQuery] = React.useState("")
  const needle = query.trim().toLowerCase()
  const shown = needle
    ? media.filter((m) => m.filename.toLowerCase().includes(needle))
    : media

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-3 p-3 pb-2">
        <h2 className="px-1 text-kit-body font-kit-strong text-kit-ink">This project</h2>
        <SearchField
          size="sm"
          aria-label="Search this project's media"
          placeholder="Search media"
          value={query}
          onValueChange={setQuery}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {shown.length === 0 ? (
          <p className="px-1 pt-2 text-kit-small text-kit-ink-muted">
            {media.length === 0 ? "No recording in this project yet." : `Nothing named “${query.trim()}”.`}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-2 gap-y-3">
            {shown.map((m) => (
              <li key={m.id} className="flex min-w-0 flex-col gap-1.5">
                <MediaThumb entry={m} />
                <span className="truncate px-0.5 text-kit-small text-kit-ink" title={m.filename}>
                  {m.filename}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/**
 * One tile of the filmstrip sheet, at the footage's own shape, centred in a
 * 16:9 recess. The middle tile, so a take that opens on a black frame still
 * shows what it is of.
 */
function MediaThumb({ entry }: { entry: MediaEntry }) {
  const strip = entry.filmstrip
  const index = strip ? Math.floor((strip.tiles - 1) / 2) : 0

  return (
    <div className="relative grid aspect-video place-items-center overflow-hidden rounded-kit-chip bg-kit-well">
      {strip ? (
        <div
          aria-hidden="true"
          className="h-full"
          style={{
            aspectRatio: `${strip.tileWidth} / ${strip.tileHeight}`,
            backgroundImage: `url(${strip.url})`,
            backgroundSize: `${strip.tiles * 100}% 100%`,
            backgroundPosition: strip.tiles > 1 ? `${(index / (strip.tiles - 1)) * 100}% 0` : "0 0",
          }}
        />
      ) : null}
      {entry.durationUs ? (
        <span className="absolute right-1 bottom-1 rounded-[2px] bg-kit-primary/80 px-1 text-kit-mono leading-4 text-kit-primary-on tabular-nums">
          {formatClockTenths(entry.durationUs)}
        </span>
      ) : null}
    </div>
  )
}
