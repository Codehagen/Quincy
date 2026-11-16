/**
 * Class strings shared by the kit's overlays (Dialog, AlertDialog, Sheet,
 * Popover, Tooltip, Toast). Not exported from the kit's index, like
 * control-styles: they are how the overlays agree with each other.
 */
import { kitHand, kitSans } from "./fonts"

/**
 * Portalled content renders into <body>, outside KitRoot, so it would lose
 * the two font variables KitRoot sets and fall back to the app's Geist. Every
 * portalled kit surface carries this on its outermost element, so a panel
 * reads Inter 14/20 at 460 in ink like the page under it.
 */
export const PORTAL_TYPE =
  `${kitSans.variable} ${kitHand.variable} font-kit-sans text-kit-body text-kit-ink antialiased [font-feature-settings:"cv11","ss01"]`

/**
 * The dimmed ground behind a modal (Dialog, AlertDialog, Sheet). Fades with
 * the state duration; reduced motion keeps the fade, which moves nothing.
 */
export const SCRIM =
  "fixed inset-0 z-50 bg-kit-scrim transition-[opacity] duration-(--kit-duration-state) ease-kit-out " +
  "data-starting-style:opacity-0 data-ending-style:opacity-0"

/**
 * The white object a modal is: the biggest object in the kit, so the stage
 * radius (24) and the lifted elevation — it is in the hand, over a scrim.
 * Padding is the landing's held draft from 40rem (28 × 24), 18 on a phone.
 */
export const MODAL_OBJECT =
  "relative flex flex-col overflow-hidden rounded-kit-stage bg-kit-object text-kit-ink shadow-kit-lifted outline-hidden"

/** Side padding inside a modal, and the floor under its last part, phone first. */
export const MODAL_PAD_X = "px-kit-pad sm:px-kit-pad-x"
export const MODAL_PAD_BOTTOM = "pb-kit-pad sm:pb-kit-pad-y"

/**
 * Enter and exit for a centred modal: a short rise and a fade, 200ms. Under
 * reduced motion only the fade remains.
 */
export const MODAL_MOTION =
  "transition-[opacity,scale,translate] duration-(--kit-duration-state) ease-kit-out " +
  "data-starting-style:opacity-0 data-starting-style:scale-97 data-starting-style:translate-y-2 " +
  "data-ending-style:opacity-0 data-ending-style:scale-97 data-ending-style:translate-y-1 " +
  "motion-reduce:data-starting-style:scale-100 motion-reduce:data-starting-style:translate-y-0 " +
  "motion-reduce:data-ending-style:scale-100 motion-reduce:data-ending-style:translate-y-0"

/**
 * The one elevation every floating panel shares: Popover, the Menu panel and
 * the Select panel. They all float over live content with no scrim, so they
 * take the "in the hand" stack, not the resting one a Card has. One value
 * also keeps them apart from the Card under them in dark mode, where every
 * stack is a single ring and only the ring's strength (0.14 against the
 * object's 0.08) separates the two. A modal (Dialog, Sheet) and a Toast
 * are lifted too; a Tooltip is an ink chip and has none.
 *
 * control-styles' PANEL (Menu, Select) should read this constant rather
 * than naming a shadow of its own, so the three cannot drift apart again.
 */
export const FLOATING_ELEVATION = "shadow-kit-lifted"

/**
 * How a floating panel opens: it scales from its trigger and fades, 200ms.
 * Under reduced motion only the fade remains.
 */
export const FLOATING_MOTION =
  "origin-(--transform-origin) transition-[opacity,scale] duration-(--kit-duration-state) ease-kit-out " +
  "data-starting-style:scale-96 data-starting-style:opacity-0 data-ending-style:scale-96 data-ending-style:opacity-0 " +
  "motion-reduce:data-starting-style:scale-100 motion-reduce:data-ending-style:scale-100"

/**
 * Buttons at the foot of a modal. Side by side at the end from 40rem; on a
 * phone they stack full width, the action on top and the way out under it,
 * nearest the thumb (source order is quiet first, action last).
 */
export const MODAL_FOOTER =
  "flex flex-col-reverse gap-kit-controls sm:flex-row sm:items-center sm:justify-end " +
  "max-sm:[&>button]:w-full"
