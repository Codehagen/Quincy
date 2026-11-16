/**
 * Class strings shared by the step-2 controls (plans/029). Not exported from
 * the kit's index: they are how the controls agree with each other, not a
 * way for a page to restyle one.
 */

/** The white control surface: ring + short soft fall, after Stageshow's collage. */
export const CONTROL_SURFACE = "bg-kit-control shadow-kit-control"

/**
 * Keyboard focus. Ink, offset, on every control.
 *
 * Tailwind v4's `outline-none` AND `outline-hidden` both set
 * `--tw-outline-style: none`, and `outline-2` draws with
 * `outline-style: var(--tw-outline-style)`, so either one alone leaves the
 * ring at width 2 and style none: nothing draws. `focus-visible:outline-solid`
 * puts the style back. `outline-hidden` (not `-none`) at rest, so Windows
 * forced-colors mode still gets a transparent outline it can paint.
 * Never write a focus ring by hand: import this.
 */
export const FOCUS_RING =
  "outline-hidden focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-focus"

/**
 * A 44px-tall hit area on touch, vertical only so side-by-side neighbours
 * never overlap (the same rule as Button). The element needs `relative`.
 */
export const HIT_44 =
  "pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:top-1/2 pointer-coarse:after:h-11 pointer-coarse:after:-translate-y-1/2"

/**
 * HIT_44, plus 40px under a fine pointer: the desktop floor for a control
 * shorter than 40 (a 20px text link, a 36px pill). Vertical only, for the
 * same reason. Used by the marketing header and footer, where the controls
 * are text and a mouse is the common case.
 */
export const HIT_40_44 =
  "after:absolute after:inset-x-0 after:top-1/2 after:h-10 after:-translate-y-1/2 pointer-coarse:after:h-11"

/** Text inputs: 14px chrome, 16px under a coarse pointer so iOS never zooms. */
export const INPUT_TEXT =
  "text-kit-body text-kit-ink placeholder:text-kit-ink-muted pointer-coarse:text-base"

/**
 * Input's `mono`: the Mono face at 12px for a value read character by
 * character (a URL, a secret), and the same 16px floor under a coarse pointer.
 */
export const INPUT_TEXT_MONO =
  "font-kit-mono text-kit-mono text-kit-ink placeholder:text-kit-ink-muted pointer-coarse:text-base"

const FIELD_SURFACE_BASE =
  `w-full min-w-0 rounded-kit-control px-3 ${CONTROL_SURFACE} ${FOCUS_RING} ` +
  "data-invalid:shadow-kit-invalid data-disabled:opacity-50"

/** The field surface shared by Input and Textarea. Invalid is a danger ring, not a fill. */
export const FIELD_SURFACE = `${FIELD_SURFACE_BASE} ${INPUT_TEXT}`

/** The field surface with the mono value (Input `mono`). */
export const FIELD_SURFACE_MONO = `${FIELD_SURFACE_BASE} ${INPUT_TEXT_MONO}`

/**
 * The selected-segment look shared by Segmented and Tabs, after the
 * landing's reply chips (TextsPicture): muted until picked, then the ground
 * on the ink thumb, a pill inside a pill (inner = outer − padding holds
 * for pills by construction). Each component adds the picked text colour,
 * `text-kit-primary-on`, under its own data attribute.
 */
export const SEGMENT_ITEM =
  "relative z-[1] flex min-w-0 cursor-pointer items-center justify-center rounded-full px-3.5 font-kit-strong whitespace-nowrap select-none " +
  "text-kit-ink-muted transition-[color] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none " +
  "hover:text-kit-ink data-disabled:cursor-default data-disabled:opacity-50 data-disabled:hover:text-kit-ink-muted " +
  `${FOCUS_RING} focus-visible:outline-offset-0 ${HIT_44}`

/** The sliding ink pill behind the picked segment. Named-property transition. */
export const SEGMENT_THUMB =
  "pointer-events-none absolute rounded-full bg-kit-primary " +
  "transition-[translate,left,width] duration-(--kit-duration-enter) ease-kit-out motion-reduce:transition-none"

export const SEGMENT_TRACK = `relative isolate rounded-full p-1 text-kit-body ${CONTROL_SURFACE}`

/**
 * The white panel shared by Menu and Select: object radius 18 with 6px
 * padding (`kit-row-inset`), so the rows inside are 12 (= control), inner = outer − padding.
 * Lifted, like Popover and the command palette: every floating panel shares
 * one elevation, so a panel over a white object still reads as above it.
 * It scales in from where it was opened (Base UI's transform-origin) and
 * fades; under reduced motion it only fades.
 */
export const PANEL =
  "min-w-44 max-h-(--available-height) overflow-y-auto rounded-kit-object bg-kit-object p-kit-row-inset text-kit-body text-kit-ink shadow-kit-lifted outline-none " +
  "origin-(--transform-origin) transition-[opacity,scale] duration-(--kit-duration-state) ease-kit-out " +
  "data-starting-style:scale-96 data-starting-style:opacity-0 data-ending-style:scale-96 data-ending-style:opacity-0 " +
  "motion-reduce:data-starting-style:scale-100 motion-reduce:data-ending-style:scale-100"

/**
 * A panel row: the selected grey when highlighted (pointer or arrow keys),
 * never blue. 16px side inset, as the landing's idea rows.
 */
export const PANEL_ROW =
  "relative flex min-h-10 cursor-default items-center gap-2.5 rounded-kit-control px-4 outline-none select-none pointer-coarse:min-h-11 " +
  "data-highlighted:bg-kit-selected data-disabled:opacity-50"

export type ControlSize = "md" | "lg"

/** Outer height per size; items inside a 4px-padded track are 8px shorter. */
export const SEGMENT_HEIGHT: Record<ControlSize, string> = {
  md: "h-kit-control-md",
  lg: "h-kit-control-lg",
}

/** `md` (36px) is the app default; `lg` (44px) is a hero action. */
export type ButtonSize = "md" | "lg"

/**
 * The Button look, shared by Button, ButtonLink and HoldButton so a link and
 * a button that sit side by side are the same object. A pill, as the
 * landing's call to action and reply chips (MarketingButton, TextsPicture).
 * Transition durations pair with the property list in order: scale is a
 * press (140ms), colours are state (200ms).
 */
export const BUTTON_BASE =
  "relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full text-kit-body font-kit-strong whitespace-nowrap select-none " +
  "transition-[scale,background-color,color] duration-[var(--kit-duration-press),var(--kit-duration-state),var(--kit-duration-state)] ease-kit-out " +
  "not-data-disabled:active:scale-(--kit-press-scale) motion-reduce:transition-none motion-reduce:not-data-disabled:active:scale-100 " +
  `${FOCUS_RING} data-disabled:cursor-default ${HIT_44}`

/** The landing's pill padding: 16 at md, 22 at lg (MarketingButton). */
export const BUTTON_SIZE: Record<ButtonSize, string> = {
  md: "h-kit-control-md px-kit-cta-md",
  lg: "h-kit-control-lg px-kit-cta-lg",
}

/**
 * With a leading icon the icon side is 2px tighter, so the pill looks even:
 * the glyph's side bearing reads as extra space.
 */
export const BUTTON_ICON_SIZE: Record<ButtonSize, string> = {
  md: "pl-kit-cta-md-icon",
  lg: "pl-kit-cta-lg-icon",
}

/** A trailing icon tightens the trailing side by the same 2px. */
export const BUTTON_ICON_END_SIZE: Record<ButtonSize, string> = {
  md: "pr-kit-cta-md-icon",
  lg: "pr-kit-cta-lg-icon",
}

/**
 * `auto` (default) sizes to the label. `full` spans its container: the one
 * column of an auth card, a phone sheet's footer. Never a fixed width; to
 * keep a toggle from moving, reserve its other label instead (`reserve`).
 */
export type ButtonWidth = "auto" | "full"

export const BUTTON_WIDTH: Record<ButtonWidth, string> = {
  auto: "",
  // Still inline-flex, so `align-top` keeps a line box from adding the
  // descender gap under it when it sits alone in a block.
  full: "w-full align-top",
}

const BUTTON_CONTROL =
  "bg-kit-control shadow-kit-control hover:not-data-disabled:bg-kit-control-hover data-disabled:opacity-50"

export const BUTTON_VARIANT = {
  // Ink, as the landing's call to action. Hover and disabled mix toward
  // the ground, never an alpha, so both self-correct in dark mode.
  action:
    "bg-kit-primary text-kit-primary-on hover:not-data-disabled:bg-kit-primary-hover data-disabled:bg-kit-primary-disabled",
  quiet: `${BUTTON_CONTROL} text-kit-ink`,
  danger: `${BUTTON_CONTROL} text-kit-danger`,
} as const
