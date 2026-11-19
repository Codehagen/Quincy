"use client"

import * as React from "react"
import { Delete02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Slider, Switch, Text } from "@/components/kit"
import { SPEED_PRESETS } from "@/lib/editor/edits"
import { LAYOUTS, type LayoutKey } from "@/lib/editor/layout"
import { CAPTION_PRESETS, LOOK_PRESETS, type CaptionPreset, type LookPreset } from "@/lib/editor/presets"
import {
  DEFAULT_TEXT_MOTION,
  TEXT_MOVE_HINT,
  TEXT_MOVE_LABEL,
  TEXT_MOVES,
  type TextFeel,
  type TextMotion,
  type TextMove,
} from "@/lib/editor/motion"
import { TEXT_PRESETS, MAX_TEXT_LENGTH, type TextRole } from "@/lib/editor/titles"
import {
  DEFAULT_TRANSITION_US,
  MAX_TRANSITION_US,
  MIN_TRANSITION_US,
  TRANSITION_KINDS,
} from "@/lib/editor/transitions"
import type { TimelineElement, TransitionKind } from "@/lib/editor/types"
import { cn } from "@/lib/utils"

import { FeelSwitch, MotionGrid } from "./motion-grid"
import { formatClockTenths } from "./studio-parts"

/**
 * The side panels the rail opens besides media and effects (plan 042): text,
 * transitions, settings, and the selected thing's own properties.
 *
 * Each panel is a plain list of decisions at the panel's 260px, in the same
 * dense rows the effects panel uses. Every control commits on release, never
 * per pointer move, so a drag on a slider is one undo.
 */

const CHIP =
  "inline-flex min-h-7 items-center rounded-kit-chip border border-kit-hairline px-2 text-kit-small text-kit-ink outline-hidden transition-[background-color,border-color] duration-150 ease-out hover:bg-kit-row-hover focus-visible:outline-2 focus-visible:outline-kit-focus focus-visible:outline-solid disabled:text-kit-ink-muted disabled:hover:bg-transparent aria-pressed:border-kit-ink aria-pressed:bg-kit-row-hover"

const ROW_BUTTON =
  "flex min-h-11 w-full flex-col items-start justify-center rounded-kit-control px-2 text-left outline-hidden transition-[background-color] duration-150 ease-out hover:bg-kit-row-hover focus-visible:outline-2 focus-visible:outline-kit-focus focus-visible:outline-solid disabled:opacity-50 disabled:hover:bg-transparent"

const SELECT =
  "h-7 min-w-0 flex-1 rounded-kit-control border border-kit-hairline bg-kit-object px-1.5 text-kit-meta text-kit-ink outline-hidden focus-visible:outline-2 focus-visible:outline-kit-focus focus-visible:outline-solid disabled:opacity-50"

const FIELD =
  "h-9 w-full min-w-0 rounded-kit-control border border-kit-hairline bg-kit-object px-2 text-kit-dense text-kit-ink outline-hidden placeholder:text-kit-ink-muted focus-visible:outline-2 focus-visible:outline-kit-focus focus-visible:outline-solid disabled:opacity-50"

function Section({
  title,
  children,
  aside,
}: {
  title: string
  children: React.ReactNode
  aside?: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2 px-3 py-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-kit-small font-kit-strong text-kit-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

/* ── Text ───────────────────────────────────────────────────────────────── */

export type TextRow = {
  id: string
  trackId: string
  role?: TextRole
  content: string
  subtitle?: string
  motion: TextMotion
  startUs: number
}

type TextPatch = { content?: string; subtitle?: string; motion?: TextMotion }

const MOVE_OPTIONS = TEXT_MOVES.map((key) => ({
  key,
  label: TEXT_MOVE_LABEL[key],
  hint: TEXT_MOVE_HINT[key],
}))

export function StudioTextPanel({
  texts,
  onAdd,
  onEdit,
  onRemove,
  onSeek,
  disabled,
}: {
  texts: TextRow[]
  onAdd: (
    role: TextRole,
    content: string,
    subtitle: string | undefined,
    motion: TextMotion
  ) => void
  onEdit: (id: string, patch: TextPatch) => void
  onRemove: (trackId: string, id: string) => void
  onSeek: (atUs: number) => void
  disabled?: boolean
}) {
  const [role, setRole] = React.useState<TextRole>("title")
  // Kept between adds: the second title in a cut usually moves like the first.
  const [motion, setMotion] = React.useState<TextMotion>(DEFAULT_TEXT_MOTION)
  const [content, setContent] = React.useState("")
  const [subtitle, setSubtitle] = React.useState("")

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!content.trim()) return
    onAdd(role, content, role === "lower_third" ? subtitle : undefined, motion)
    setContent("")
    setSubtitle("")
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <Section title="Text">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Kind of text">
          {(Object.keys(TEXT_PRESETS) as TextRole[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={role === key}
              onClick={() => setRole(key)}
              className={CHIP}
            >
              {TEXT_PRESETS[key].label}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="flex flex-col gap-2">
          <input
            className={FIELD}
            aria-label={role === "lower_third" ? "Name" : "Text"}
            placeholder={role === "lower_third" ? "Name" : role === "end_card" ? "Thanks for watching" : role === "hook" ? "Wait until you see this" : "Title"}
            value={content}
            maxLength={MAX_TEXT_LENGTH}
            onChange={(event) => setContent(event.target.value)}
            disabled={disabled}
          />
          {role === "lower_third" ? (
            <input
              className={FIELD}
              aria-label="Role"
              placeholder="Role or company"
              value={subtitle}
              maxLength={MAX_TEXT_LENGTH}
              onChange={(event) => setSubtitle(event.target.value)}
              disabled={disabled}
            />
          ) : null}
          <span className="mt-1 px-1 text-kit-meta text-kit-ink-muted">
            How it enters and leaves
          </span>
          <MotionGrid
            label="How it enters"
            kind="text"
            options={MOVE_OPTIONS}
            value={motion.move}
            feel={motion.feel}
            onPick={(move) => setMotion((current) => ({ ...current, move }))}
            disabled={disabled}
          />
          <FeelSwitch
            value={motion.feel}
            onChange={(feel) => setMotion((current) => ({ ...current, feel }))}
            disabled={disabled || motion.move === "none"}
          />
          <button
            type="submit"
            disabled={disabled || !content.trim()}
            className={cn(CHIP, "self-start")}
          >
            {role === "lower_third"
              ? "Add at the playhead"
              : role === "end_card"
                ? "Add at the end"
                : "Add at the start"}
          </button>
        </form>
      </Section>

      <Section title="In this cut">
        {texts.length === 0 ? (
          <p className="px-1 text-kit-small text-kit-ink-muted">No text yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {texts.map((text) => (
              <TextItem
                key={text.id}
                text={text}
                onEdit={onEdit}
                onRemove={onRemove}
                onSeek={onSeek}
                disabled={disabled}
              />
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

function TextItem({
  text,
  onEdit,
  onRemove,
  onSeek,
  disabled,
}: {
  text: TextRow
  onEdit: (id: string, patch: TextPatch) => void
  onRemove: (trackId: string, id: string) => void
  onSeek: (atUs: number) => void
  disabled?: boolean
}) {
  // Local while typing, committed on blur or Enter: one edit, one undo.
  const [contentDraft, setContent] = React.useState<string | null>(null)
  const [subtitleDraft, setSubtitle] = React.useState<string | null>(null)
  const content = contentDraft ?? text.content
  const subtitle = subtitleDraft ?? text.subtitle ?? ""

  return (
    <li className="flex flex-col gap-1 rounded-kit-control border border-kit-hairline p-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onSeek(text.startUs)}
          className="text-kit-mono text-kit-ink-muted tabular-nums outline-hidden hover:text-kit-ink focus-visible:outline-2 focus-visible:outline-kit-focus focus-visible:outline-solid"
          aria-label={`Go to ${formatClockTenths(text.startUs)}`}
        >
          {TEXT_PRESETS[text.role ?? "title"].label} · {formatClockTenths(text.startUs)}
        </button>
        <button
          type="button"
          aria-label="Remove this text"
          disabled={disabled}
          onClick={() => onRemove(text.trackId, text.id)}
          className="relative grid size-7 place-items-center rounded-kit-control text-kit-ink-muted outline-hidden before:absolute before:-inset-2 hover:bg-kit-row-hover hover:text-kit-ink focus-visible:outline-2 focus-visible:outline-kit-focus focus-visible:outline-solid"
        >
          <HugeiconsIcon icon={Delete02Icon} size={14} aria-hidden="true" />
        </button>
      </div>
      <input
        className={FIELD}
        aria-label="Text"
        value={content}
        maxLength={MAX_TEXT_LENGTH}
        disabled={disabled}
        onChange={(event) => setContent(event.target.value)}
        onBlur={() => {
          if (content !== text.content) onEdit(text.id, { content })
          setContent(null)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
          if (event.key === "Escape") {
            setContent(text.content)
            event.currentTarget.blur()
          }
        }}
      />
      {text.role === "lower_third" ? (
        <input
          className={FIELD}
          aria-label="Role"
          placeholder="Role or company"
          value={subtitle}
          maxLength={MAX_TEXT_LENGTH}
          disabled={disabled}
          onChange={(event) => setSubtitle(event.target.value)}
          onBlur={() => {
            if (subtitle !== (text.subtitle ?? "")) onEdit(text.id, { subtitle })
            setSubtitle(null)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur()
          }}
        />
      ) : null}
      <div className="flex items-center gap-1.5">
        <select
          aria-label="How it enters"
          value={text.motion.move}
          disabled={disabled}
          onChange={(event) =>
            onEdit(text.id, {
              motion: { ...text.motion, move: event.target.value as TextMove },
            })
          }
          className={SELECT}
        >
          {TEXT_MOVES.map((move) => (
            <option key={move} value={move}>
              {TEXT_MOVE_LABEL[move]}
            </option>
          ))}
        </select>
        <select
          aria-label="Feel"
          value={text.motion.feel}
          disabled={disabled || text.motion.move === "none"}
          onChange={(event) =>
            onEdit(text.id, {
              motion: { ...text.motion, feel: event.target.value as TextFeel },
            })
          }
          className={SELECT}
        >
          <option value="smooth">Smooth</option>
          <option value="snappy">Snappy</option>
        </select>
      </div>
    </li>
  )
}

/* ── Transitions ────────────────────────────────────────────────────────── */

export type JoinRow = {
  trackId: string
  /** The clip after the join, which carries the transition. */
  elementId: string
  atUs: number
  kind: TransitionKind | null
  durationUs: number
}

export function StudioTransitionsPanel({
  joins,
  onSet,
  onSeek,
  disabled,
}: {
  joins: JoinRow[]
  /** Returns why it could not, or null. */
  onSet: (
    join: JoinRow,
    kind: TransitionKind | null,
    durationUs: number
  ) => string | null
  onSeek: (atUs: number) => void
  disabled?: boolean
}) {
  const [reason, setReason] = React.useState<{ id: string; text: string } | null>(null)

  const set = (join: JoinRow, kind: TransitionKind | null, durationUs: number) => {
    const why = onSet(join, kind, durationUs)
    setReason(why ? { id: join.elementId, text: why } : null)
  }

  const all = (kind: TransitionKind | null) => {
    let last: string | null = null
    for (const join of joins) last = onSet(join, kind, DEFAULT_TRANSITION_US) ?? last
    setReason(last ? { id: "all", text: last } : null)
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <Section title="Transitions">
        <p className="px-1 text-kit-small text-kit-ink-muted">
          Where two clips meet. Most cuts want none: a straight cut reads as
          confident. Use a dip for a change of subject.
        </p>
        {joins.length === 0 ? (
          <p className="px-1 text-kit-small text-kit-ink-muted">
            The cut is one clip, so there is nowhere to put one. Split it first.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1">
              <button type="button" className={CHIP} disabled={disabled} onClick={() => all("dip_black")}>
                Dip every join
              </button>
              <button type="button" className={CHIP} disabled={disabled} onClick={() => all(null)}>
                Clear all
              </button>
            </div>
            {reason?.id === "all" ? (
              <Text variant="small" role="status">
                {reason.text}
              </Text>
            ) : null}
            <ul className="flex flex-col gap-2">
              {joins.map((join, index) => (
                <li
                  key={join.elementId}
                  className="flex flex-col gap-1.5 rounded-kit-control border border-kit-hairline p-2"
                >
                  <button
                    type="button"
                    onClick={() => onSeek(Math.max(0, join.atUs - 1_000_000))}
                    className="self-start text-kit-mono text-kit-ink-muted tabular-nums outline-hidden hover:text-kit-ink focus-visible:outline-2 focus-visible:outline-kit-focus focus-visible:outline-solid"
                  >
                    Join {index + 1} · {formatClockTenths(join.atUs)}
                  </button>
                  <div className="flex flex-wrap gap-1" role="group" aria-label={`Transition at join ${index + 1}`}>
                    <button
                      type="button"
                      aria-pressed={join.kind === null}
                      disabled={disabled}
                      onClick={() => set(join, null, join.durationUs)}
                      className={CHIP}
                    >
                      Cut
                    </button>
                    {TRANSITION_KINDS.map((option) => (
                      <button
                        key={option.kind}
                        type="button"
                        aria-pressed={join.kind === option.kind}
                        disabled={disabled}
                        onClick={() => set(join, option.kind, join.durationUs)}
                        className={CHIP}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {join.kind ? (
                    <DurationSlider
                      valueUs={join.durationUs}
                      disabled={disabled}
                      onCommit={(durationUs) => set(join, join.kind, durationUs)}
                    />
                  ) : null}
                  {reason?.id === join.elementId ? (
                    <Text variant="small" role="status">
                      {reason.text}
                    </Text>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>
    </div>
  )
}

function DurationSlider({
  valueUs,
  onCommit,
  disabled,
}: {
  valueUs: number
  onCommit: (durationUs: number) => void
  disabled?: boolean
}) {
  const [drag, setValue] = React.useState<number | null>(null)
  const value = drag ?? valueUs / 1000
  return (
    <div className="flex items-center gap-2">
      <Slider
        aria-label="Length"
        min={MIN_TRANSITION_US / 1000}
        max={MAX_TRANSITION_US / 1000}
        step={50}
        value={value}
        disabled={disabled}
        onValueChange={(next) => setValue(next as number)}
        onValueCommitted={(next) => {
          setValue(null)
          onCommit((next as number) * 1000)
        }}
        getAriaValueText={(next) => `${((next as number) / 1000).toFixed(2)} seconds`}
      />
      <span className="w-10 shrink-0 text-right text-kit-mono text-kit-ink-muted tabular-nums">
        {(value / 1000).toFixed(2)}s
      </span>
    </div>
  )
}

/* ── Settings ───────────────────────────────────────────────────────────── */

export type SpeakerRow = { speaker: number; name: string; placeholder: string }

export function StudioSettingsPanel({
  hasCaptions,
  captionPreset,
  onCaptionPreset,
  look,
  onLook,
  speakers,
  onNameSpeaker,
  onCutSpeaker,
  background,
  onBackground,
  onImportSubtitles,
  importNote,
  disabled,
}: {
  hasCaptions: boolean
  captionPreset: CaptionPreset["key"] | null
  onCaptionPreset: (key: CaptionPreset["key"]) => void
  look: LookPreset["key"] | null
  onLook: (key: LookPreset["key"]) => void
  speakers: SpeakerRow[]
  onNameSpeaker: (speaker: number, name: string) => void
  /** Cut everything one speaker says (speakers.ts `cutSpeaker`). */
  onCutSpeaker?: (speaker: number) => void
  background: string
  onBackground: (color: string) => void
  onImportSubtitles: (file: File) => void
  importNote?: string | null
  disabled?: boolean
}) {
  const fileRef = React.useRef<HTMLInputElement | null>(null)
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <Section title="Captions">
        {hasCaptions ? (
          <ul className="flex flex-col">
            {CAPTION_PRESETS.map((preset) => (
              <li key={preset.key}>
                <button
                  type="button"
                  aria-pressed={captionPreset === preset.key}
                  disabled={disabled}
                  onClick={() => onCaptionPreset(preset.key)}
                  className={cn(ROW_BUTTON, "aria-pressed:bg-kit-row-hover")}
                >
                  <span className="text-kit-small text-kit-ink">{preset.label}</span>
                  <span className="text-kit-small text-kit-ink-muted">{preset.hint}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-1 text-kit-small text-kit-ink-muted">
            Add captions from the transcript first, or bring in a subtitle file.
          </p>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".srt,.vtt,text/vtt,application/x-subrip"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onImportSubtitles(file)
            event.target.value = ""
          }}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
          className={cn(CHIP, "self-start")}
        >
          Captions from a subtitle file
        </button>
        {importNote ? (
          <Text variant="small" role="status">
            {importNote}
          </Text>
        ) : null}
      </Section>

      <Section title="Look">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Look">
          {LOOK_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              title={preset.hint}
              aria-pressed={look === preset.key}
              disabled={disabled}
              onClick={() => onLook(preset.key)}
              className={CHIP}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </Section>

      {speakers.length > 0 ? (
        <Section title="Speakers">
          <ul className="flex flex-col gap-2">
            {speakers.map((row) => (
              <SpeakerItem
                key={row.speaker}
                row={row}
                onName={onNameSpeaker}
                // Cutting the only voice would cut the whole recording.
                onCut={speakers.length > 1 ? onCutSpeaker : undefined}
                disabled={disabled}
              />
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Background">
        <label className="flex min-h-11 items-center justify-between gap-3 px-1 text-kit-small text-kit-ink">
          Behind the picture
          <input
            type="color"
            value={toHex(background)}
            disabled={disabled}
            onChange={(event) => onBackground(event.target.value)}
            className="h-8 w-12 cursor-pointer rounded-kit-control border border-kit-hairline bg-transparent"
          />
        </label>
      </Section>
    </div>
  )
}

function toHex(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#000000"
}

function SpeakerItem({
  row,
  onName,
  onCut,
  disabled,
}: {
  row: SpeakerRow
  onName: (speaker: number, name: string) => void
  onCut?: (speaker: number) => void
  disabled?: boolean
}) {
  const [draft, setName] = React.useState<string | null>(null)
  const name = draft ?? row.name
  return (
    <li className="flex items-center gap-2">
      <input
        className={FIELD}
        aria-label={`Name for ${row.placeholder}`}
        placeholder={row.placeholder}
        value={name}
        disabled={disabled}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => {
          if (name !== row.name) onName(row.speaker, name)
          setName(null)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
      />
      {onCut ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onCut(row.speaker)}
          className={CHIP}
          aria-label={`Cut everything ${row.name || row.placeholder} says`}
          title="Cut everything this speaker says. Undo brings it back."
        >
          Cut out
        </button>
      ) : null}
    </li>
  )
}

/* ── The selected thing ─────────────────────────────────────────────────── */

export function StudioInspector({
  element,
  onSpeed,
  onVolume,
  onDucking,
  onLayout,
  onOpacity,
  onDetachSound,
  disabled,
}: {
  element: TimelineElement
  onSpeed?: (speed: number) => void
  /** Take the clip's sound onto a lane of its own (detach-sound.ts). */
  onDetachSound?: () => void
  onVolume?: (volume: number) => void
  onDucking?: (enabled: boolean) => void
  onLayout?: (key: LayoutKey) => void
  onOpacity?: (opacity: number) => void
  disabled?: boolean
}) {
  const kind = element.kind
  if (kind === "caption" || kind === "text") return null

  return (
    <div className="border-b border-kit-hairline">
      <Section title={element.name || "Selected"}>
        {kind === "video" && element.frozen ? (
          <span className="px-1 text-kit-small text-kit-ink-muted">
            A held frame. Drag its end to hold it longer.
          </span>
        ) : null}

        {kind === "video" && !element.frozen && onSpeed ? (
          <div className="flex flex-col gap-1">
            <span className="px-1 text-kit-small text-kit-ink-muted">Speed</span>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Speed">
              {SPEED_PRESETS.map((speed) => (
                <button
                  key={speed}
                  type="button"
                  aria-pressed={(element.speed ?? 1) === speed}
                  disabled={disabled}
                  onClick={() => onSpeed(speed)}
                  className={CHIP}
                >
                  {speed}×
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {(kind === "audio" || (kind === "video" && !element.frozen)) && onVolume ? (
          <VolumeSlider volume={element.volume} muted={element.muted} onCommit={onVolume} disabled={disabled} />
        ) : null}

        {kind === "video" &&
        !element.frozen &&
        !element.muted &&
        (element.speed ?? 1) === 1 &&
        onDetachSound ? (
          <button type="button" disabled={disabled} onClick={onDetachSound} className={CHIP}>
            Detach the sound
          </button>
        ) : null}

        {kind === "audio" && onDucking ? (
          <Switch
            label="Lower under the voice"
            checked={Boolean(element.ducking?.enabled)}
            disabled={disabled}
            onCheckedChange={(checked) => onDucking(checked)}
          />
        ) : null}

        {(kind === "video" || kind === "image") && onLayout ? (
          <div className="flex flex-col gap-1">
            <span className="px-1 text-kit-small text-kit-ink-muted">On the frame</span>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Layout">
              {LAYOUTS.map((layout) => (
                <button
                  key={layout.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => onLayout(layout.key)}
                  className={CHIP}
                >
                  {layout.label}
                </button>
              ))}
            </div>
            <span className="px-1 text-kit-small text-kit-ink-muted">
              Or drag it on the preview. Shift turns snapping off.
            </span>
          </div>
        ) : null}

        {kind === "image" && onOpacity ? (
          <OpacitySlider opacity={element.opacity} onCommit={onOpacity} disabled={disabled} />
        ) : null}
      </Section>
    </div>
  )
}

function VolumeSlider({
  volume,
  muted,
  onCommit,
  disabled,
}: {
  volume: number
  muted: boolean
  onCommit: (volume: number) => void
  disabled?: boolean
}) {
  const [drag, setValue] = React.useState<number | null>(null)
  const value = drag ?? Math.round(volume * 100)
  return (
    <div className="flex flex-col">
      <span className="px-1 text-kit-small text-kit-ink-muted">
        Volume{muted ? " (muted)" : ""}
      </span>
      <div className="flex items-center gap-2">
        <Slider
          aria-label="Volume"
          min={0}
          max={200}
          step={5}
          value={value}
          disabled={disabled}
          onValueChange={(next) => setValue(next as number)}
          onValueCommitted={(next) => {
            setValue(null)
            onCommit((next as number) / 100)
          }}
          getAriaValueText={(next) => `${next}%`}
        />
        <span className="w-10 shrink-0 text-right text-kit-mono text-kit-ink-muted tabular-nums">
          {value}%
        </span>
      </div>
    </div>
  )
}

function OpacitySlider({
  opacity,
  onCommit,
  disabled,
}: {
  opacity: number
  onCommit: (opacity: number) => void
  disabled?: boolean
}) {
  const [drag, setValue] = React.useState<number | null>(null)
  const value = drag ?? Math.round(opacity * 100)
  return (
    <div className="flex flex-col">
      <span className="px-1 text-kit-small text-kit-ink-muted">Opacity</span>
      <div className="flex items-center gap-2">
        <Slider
          aria-label="Opacity"
          min={10}
          max={100}
          step={5}
          value={value}
          disabled={disabled}
          onValueChange={(next) => setValue(next as number)}
          onValueCommitted={(next) => {
            setValue(null)
            onCommit((next as number) / 100)
          }}
          getAriaValueText={(next) => `${next}%`}
        />
        <span className="w-10 shrink-0 text-right text-kit-mono text-kit-ink-muted tabular-nums">
          {value}%
        </span>
      </div>
    </div>
  )
}
