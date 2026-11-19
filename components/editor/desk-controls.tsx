"use client"

import * as React from "react"
import {
  SearchAddIcon,
  ArrowDown01Icon,
  AspectRatioIcon,
  SearchMinusIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuPanel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
  Slider,
  Tooltip,
  type KbdKey,
} from "@/components/kit"
import { FOCUS_RING, HIT_44 } from "@/components/kit/control-styles"
import type { Scene } from "@/lib/editor/types"
import { cn } from "@/lib/utils"

import { MAX_ZOOM } from "./studio-zoom"

/**
 * The desk's small controls (plans/036, phase E).
 *
 * The desk's toolbars are dense rows of icons: a white kit IconButton (36px,
 * its own ring and fall) on a white object would be an object on an object,
 * so these are quiet squares that only show a fill on hover or when picked.
 * Picked is the well grey, never blue (AGENTS.md).
 */
export function DeskIconButton({
  icon,
  label,
  shortcut,
  onClick,
  disabled,
  pressed,
  side = "top",
}: {
  icon: IconSvgElement
  /** The button's name; the tooltip says it again with its shortcut. */
  label: string
  shortcut?: readonly KbdKey[]
  onClick: () => void
  disabled?: boolean
  /** A toggle's state. Leave undefined for a plain action. */
  pressed?: boolean
  side?: "top" | "bottom" | "left" | "right"
}) {
  return (
    <Tooltip content={label} shortcut={shortcut} side={side}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "relative grid size-8 shrink-0 place-items-center rounded-kit-control",
          "transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.96] motion-reduce:active:scale-100",
          "disabled:pointer-events-none disabled:text-kit-ink-disabled",
          pressed
            ? "bg-kit-selected text-kit-ink"
            : "text-kit-ink-muted hover:bg-kit-row-hover hover:text-kit-ink",
          FOCUS_RING,
          HIT_44
        )}
      >
        <HugeiconsIcon aria-hidden="true" icon={icon} size={17} />
      </button>
    </Tooltip>
  )
}

export type FrameShape = {
  key: string
  label: string
  hint: string
  canvas: { width: number; height: number }
}

/**
 * The frame, and how the picture meets it, as one compact menu.
 *
 * One decision and so one control: 9:16 and Fill is a vertical cut, 9:16 and
 * Fit is a wide take with bars. The trigger says both ("9:16 · Fit"), so the
 * top bar shows the state without five segments. Quincy's cursor presses it
 * for a reframe (`control:frame`).
 */
export function FrameMenu({
  shapes,
  canvas,
  onChange,
  fit,
  onFitChange,
  disabled,
}: {
  shapes: readonly FrameShape[]
  canvas: { width: number; height: number }
  onChange: (canvas: { width: number; height: number }) => void
  fit: "cover" | "contain"
  onFitChange: (fit: "cover" | "contain") => void
  disabled?: boolean
}) {
  const current = shapes.find(
    (s) => s.canvas.width === canvas.width && s.canvas.height === canvas.height
  )

  return (
    <Menu>
      <MenuTrigger
        data-target="control:frame"
        aria-label={`Frame: ${current?.label ?? "custom"}, ${fit === "cover" ? "Fill" : "Fit"}`}
        disabled={disabled}
      >
        <HugeiconsIcon aria-hidden="true" icon={AspectRatioIcon} size={16} />
        {/* As wide as the longest label ("16:9 · Fill"), so changing the
            shape never moves Undo and Redo beside it. */}
        <span className="min-w-16 whitespace-nowrap tabular-nums">
          {current?.label ?? "Custom"}
          <span className="text-kit-ink-muted">
            {" "}
            · {fit === "cover" ? "Fill" : "Fit"}
          </span>
        </span>
        <HugeiconsIcon
          aria-hidden="true"
          icon={ArrowDown01Icon}
          size={14}
          className="text-kit-ink-muted"
        />
      </MenuTrigger>
      <MenuPanel align="center">
        <MenuGroup>
          <MenuGroupLabel>Frame</MenuGroupLabel>
          <MenuRadioGroup
            value={current?.key ?? ""}
            onValueChange={(key: string) => {
              const shape = shapes.find((s) => s.key === key)
              if (shape) onChange(shape.canvas)
            }}
          >
            {shapes.map((s) => (
              <MenuRadioItem
                key={s.key}
                value={s.key}
              >{`${s.label}  ${s.hint}`}</MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
        <MenuSeparator />
        <MenuGroup>
          <MenuGroupLabel>Picture</MenuGroupLabel>
          <MenuRadioGroup
            value={fit}
            onValueChange={(v: "cover" | "contain") => onFitChange(v)}
          >
            <MenuRadioItem value="contain">Fit, show all of it</MenuRadioItem>
            <MenuRadioItem value="cover">Fill, crop to the frame</MenuRadioItem>
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPanel>
    </Menu>
  )
}

/**
 * Which cut the lanes show, once a project has more than one (phase D).
 * A menu in the timeline's toolbar ("The take ▾") instead of a row of
 * toggles over the lanes: the lanes keep their height either way.
 */
export function SceneMenu({
  scenes,
  currentId,
  cutsLabel,
  onPick,
  onShowCuts,
  disabled,
}: {
  scenes: readonly Scene[]
  /** The scene in the full lanes; null while the spines are shown. */
  currentId: string | null
  /** "All 3 cuts", when the spines can be shown. */
  cutsLabel: string | null
  onPick: (sceneId: string) => void
  onShowCuts: () => void
  disabled?: boolean
}) {
  const name = (s: Scene) => (s.isMain ? "The take" : s.name)
  const current = scenes.find((s) => s.id === currentId)
  const label = current ? name(current) : (cutsLabel ?? "Cuts")

  return (
    <Menu>
      <MenuTrigger
        aria-label={`Cuts in this project: ${label}`}
        disabled={disabled}
      >
        <span className="max-w-32 truncate">{label}</span>
        <HugeiconsIcon
          aria-hidden="true"
          icon={ArrowDown01Icon}
          size={14}
          className="text-kit-ink-muted"
        />
      </MenuTrigger>
      <MenuPanel>
        <MenuRadioGroup
          value={currentId ?? "all"}
          onValueChange={(id: string) =>
            id === "all" ? onShowCuts() : onPick(id)
          }
        >
          {cutsLabel ? (
            <MenuRadioItem value="all">{cutsLabel}</MenuRadioItem>
          ) : null}
          {scenes.map((s) => (
            <MenuRadioItem key={s.id} value={s.id}>
              {name(s)}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPanel>
    </Menu>
  )
}

/**
 * Timeline zoom as a slider between two magnifiers.
 *
 * The slider runs on log2 of the zoom, so each equal stretch of track is a
 * doubling: linear, the whole useful range (1× to 4×) would sit in the first
 * tenth of the track.
 *
 * Magnifiers rather than − and +, behind a rule: the zoom *effect* has its own
 * − and + for its amount, and two pairs of bare signs side by side read as
 * one control that did two unrelated things.
 */
export function TimelineZoom({
  zoom,
  onZoom,
  onZoomIn,
  onZoomOut,
  canZoomIn,
  canZoomOut,
}: {
  zoom: number
  onZoom: (zoom: number) => void
  onZoomIn: () => void
  onZoomOut: () => void
  canZoomIn: boolean
  canZoomOut: boolean
}) {
  return (
    <div
      role="group"
      aria-label="Timeline zoom"
      className="flex items-center gap-1 border-l border-kit-hairline pl-2"
    >
      <DeskIconButton
        icon={SearchMinusIcon}
        label="Zoom the timeline out"
        shortcut={["−"]}
        onClick={onZoomOut}
        disabled={!canZoomOut}
      />
      {/* Dropped when the timeline is narrow (its section is the size
          container): − and + still zoom, and the toolbar keeps its room. */}
      <div className="w-24 @max-3xl:hidden">
        <Slider
          aria-label="Timeline zoom"
          min={0}
          max={Math.log2(MAX_ZOOM)}
          step={0.05}
          value={Math.log2(zoom)}
          onValueChange={(v) => onZoom(2 ** v)}
          getAriaValueText={(v) => `${(2 ** v).toFixed(1)}×`}
        />
      </div>
      <DeskIconButton
        icon={SearchAddIcon}
        label="Zoom the timeline in"
        shortcut={["="]}
        onClick={onZoomIn}
        disabled={!canZoomIn}
      />
    </div>
  )
}
