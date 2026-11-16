/**
 * The showcase — faux product UI for Quincy's landing page and docs, after
 * Stageshow (MIT; see NOTICE.md). The parts below are the ones Quincy's demos
 * need, not the whole Stageshow kit. Everything is restyled through the
 * --kit-* tokens (theme.css), so a demo and the app it shows share one look.
 *
 * Render demos inside <KitRoot> (components/kit) so Inter and Caveat resolve.
 */

// The stage: canvas, script, cursor, measuring, playback
export { Stage } from "./stage"
export type { StageProps, Play } from "./stage"
export type { Act, Script } from "./act"
export { inset, box, between, contains } from "./measure"
export type { Point, Rect, Target } from "./measure"
export type { CursorKind, CursorStyle } from "./cursor"
export type { Layout } from "./looks"
export { useLook } from "./looks"
export { useReducedMotion } from "./reduced-motion"
export { EASE, bezier, css as easeCss } from "./ease"

// Frames
export { Window, Bar, Text } from "./window"
export type { WindowProps, BarProps, TextProps } from "./window"
export { Phone, LockScreen, Notification } from "./phone"
export type { PhoneProps } from "./phone"

// Motion
export { Collapse } from "./motion/collapse"
export { Connector } from "./motion/connector"
export type { ConnectorProps } from "./motion/connector"
export { Count } from "./motion/count"
export { Fly } from "./motion/fly"
export { Roll } from "./motion/roll"
export { States } from "./motion/states"
export { Stream } from "./motion/stream"

// Parts and layouts
export { Button } from "./button"
export { Icon, type IconName } from "./icon"
export { Note, BeatMark } from "./annotation"
export { Bento, Tile, usePictureWidth } from "./bento"
export { FeatureCard } from "./feature-card"
