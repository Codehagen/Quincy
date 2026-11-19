"use client"

import * as React from "react"
import {
  Add01Icon,
  Image01Icon,
  MusicNote01Icon,
  Video01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Progress, SearchField, Text } from "@/components/kit"
import type { PlaceAs } from "@/lib/editor/placement"
import {
  UploadError,
  uploadToLibrary,
  type UploadProgress,
} from "@/lib/editor/upload-client"

import type { MediaEntry } from "./studio"
import { MEDIA_DRAG_TYPE } from "./studio-lanes"
import { formatClockTenths } from "./studio-parts"

/**
 * The library: what this project is cut from (plans/036 phase E, plan 042
 * phase A).
 *
 * Lists the project's media: its recordings, b-roll, pictures and music.
 * Add brings a file in (the same upload as a first recording, without making
 * a project of it). Each item can be dragged onto the lanes, where it lands
 * where it is dropped, or placed with its own buttons: a second take at the
 * end of the cut, b-roll or a picture over the cut at the playhead, a track
 * as music under the whole cut.
 *
 * `filter` narrows the list to one kind, for the Images and Sounds rail
 * buttons, which open this same card.
 */
export function StudioLibrary({
  media,
  filter,
  onAdded,
  onPlace,
  disabled = false,
}: {
  media: readonly MediaEntry[]
  filter?: "image" | "audio"
  /** A file finished uploading; the studio fetches its entry and lists it. */
  onAdded?: (assetId: string) => Promise<void> | void
  onPlace?: (entry: MediaEntry, as: PlaceAs) => void
  disabled?: boolean
}) {
  const [query, setQuery] = React.useState("")
  const needle = query.trim().toLowerCase()
  const ofKind = filter
    ? media.filter((entry) => (entry.kind ?? "video") === filter)
    : media
  const shown = needle
    ? ofKind.filter((m) => m.filename.toLowerCase().includes(needle))
    : ofKind

  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const [progress, setProgress] = React.useState<UploadProgress | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const busy = progress !== null && progress.phase !== "done"

  const add = React.useCallback(
    async (file: File) => {
      setError(null)
      try {
        const purpose = file.type.startsWith("audio/")
          ? "music"
          : file.type.startsWith("image/")
            ? "broll"
            : "take"
        const { assetId } = await uploadToLibrary(file, setProgress, {
          purpose,
        })
        await onAdded?.(assetId)
        setProgress(null)
      } catch (failure) {
        setProgress(null)
        setError(
          failure instanceof UploadError || failure instanceof Error
            ? failure.message
            : "The file could not be added."
        )
      }
    },
    [onAdded]
  )

  const accept =
    filter === "image"
      ? "image/png,image/jpeg,image/webp,image/gif"
      : filter === "audio"
        ? "audio/*"
        : "video/*,audio/*,image/png,image/jpeg,image/webp,image/gif"

  const heading =
    filter === "image" ? "Images" : filter === "audio" ? "Sounds" : "This project"

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      onDragOver={(event) => {
        if (onAdded && Array.from(event.dataTransfer.types).includes("Files"))
          event.preventDefault()
      }}
      onDrop={(event) => {
        const file = event.dataTransfer.files[0]
        if (!file || !onAdded || busy) return
        event.preventDefault()
        void add(file)
      }}
    >
      <div className="flex shrink-0 flex-col gap-3 p-3 pb-2">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="text-kit-body font-kit-strong text-kit-ink">{heading}</h2>
          {onAdded ? (
            <button
              type="button"
              disabled={busy || disabled}
              onClick={() => inputRef.current?.click()}
              className="inline-flex h-7 items-center gap-1 rounded-kit-control px-2 text-kit-small font-kit-strong text-kit-ink outline-hidden transition-[background-color] duration-150 ease-out hover:bg-kit-row-hover focus-visible:outline-2 focus-visible:outline-kit-focus focus-visible:outline-solid disabled:text-kit-ink-muted"
            >
              <HugeiconsIcon icon={Add01Icon} size={14} aria-hidden="true" />
              Add
            </button>
          ) : null}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void add(file)
            event.target.value = ""
          }}
        />
        {busy && progress ? (
          <Progress
            label={PHASE_LABEL[progress.phase]}
            value={
              progress.fraction === null
                ? null
                : Math.round(progress.fraction * 100)
            }
          />
        ) : null}
        {error ? (
          <Text variant="small" role="alert">
            {error}
          </Text>
        ) : null}
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
            {ofKind.length === 0
              ? filter === "image"
                ? "No pictures yet. Add a screenshot, a logo or a photo."
                : filter === "audio"
                  ? "No music yet. Add a track you have the rights to."
                  : "No media in this project yet."
              : `Nothing named “${query.trim()}”.`}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-2 gap-y-3">
            {shown.map((m) => (
              <li
                key={m.id}
                className="flex min-w-0 flex-col gap-1.5"
                draggable={!disabled}
                onDragStart={(event) => {
                  event.dataTransfer.setData(MEDIA_DRAG_TYPE, m.id)
                  event.dataTransfer.effectAllowed = "copy"
                }}
              >
                <MediaThumb entry={m} />
                <span className="truncate px-0.5 text-kit-small text-kit-ink" title={m.filename}>
                  {m.filename}
                </span>
                {onPlace ? (
                  <div className="flex flex-wrap gap-1">
                    {actionsFor(m).map((action) => (
                      <button
                        key={action.as}
                        type="button"
                        disabled={disabled}
                        onClick={() => onPlace(m, action.as)}
                        className="rounded-kit-chip border border-kit-hairline px-1.5 text-kit-mono leading-5 text-kit-ink outline-hidden transition-[background-color] duration-150 ease-out hover:bg-kit-row-hover focus-visible:outline-2 focus-visible:outline-kit-focus focus-visible:outline-solid disabled:text-kit-ink-muted"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

const PHASE_LABEL: Record<UploadProgress["phase"], string> = {
  hashing: "Reading the file",
  requesting: "Getting somewhere to put it",
  uploading: "Uploading",
  processing: "Preparing it for the cut",
  opening: "Adding it",
  done: "Added",
}

function actionsFor(entry: MediaEntry): { as: PlaceAs; label: string }[] {
  switch (entry.kind ?? "video") {
    case "image":
      return [{ as: "overlay", label: "Over the cut" }]
    case "audio":
      return [{ as: "music", label: "As music" }]
    case "video":
      return [
        { as: "spine", label: "At the end" },
        { as: "overlay", label: "As b-roll" },
        ...(entry.hasAudio ? [{ as: "music" as const, label: "As sound" }] : []),
      ]
  }
}

/**
 * One tile of the filmstrip sheet, at the footage's own shape, centred in a
 * 16:9 recess. The middle tile, so a take that opens on a black frame still
 * shows what it is of. A picture shows itself; music shows its note.
 */
function MediaThumb({ entry }: { entry: MediaEntry }) {
  const strip = entry.filmstrip
  const index = strip ? Math.floor((strip.tiles - 1) / 2) : 0
  const kind = entry.kind ?? "video"

  return (
    <div className="relative grid aspect-video place-items-center overflow-hidden rounded-kit-chip bg-kit-well">
      {kind === "image" && (entry.thumbnailUrl ?? entry.proxyUrl) ? (
        // eslint-disable-next-line @next/next/no-img-element -- a signed URL to the user's own file
        <img
          src={entry.thumbnailUrl ?? entry.proxyUrl ?? undefined}
          alt=""
          className="h-full w-full object-contain"
        />
      ) : strip ? (
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
      ) : (
        <HugeiconsIcon
          icon={kind === "audio" ? MusicNote01Icon : kind === "image" ? Image01Icon : Video01Icon}
          size={18}
          className="text-kit-ink-muted"
          aria-hidden="true"
        />
      )}
      {entry.durationUs ? (
        <span className="absolute right-1 bottom-1 rounded-[2px] bg-kit-primary/80 px-1 text-kit-mono leading-4 text-kit-primary-on tabular-nums">
          {formatClockTenths(entry.durationUs)}
        </span>
      ) : null}
    </div>
  )
}
