/**
 * A control with no visible label of its own must be named one of two ways.
 * The type makes the name required and the two mutually exclusive.
 */
export type AccessibleName =
  | { "aria-label": string; "aria-labelledby"?: never }
  | { "aria-labelledby": string; "aria-label"?: never }
