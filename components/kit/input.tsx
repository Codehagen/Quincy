import { Input as InputPrimitive } from "@base-ui/react/input"

import { FIELD_SURFACE, FIELD_SURFACE_MONO } from "./control-styles"

/**
 * The text kinds, plus the browser's own `time` ("HH:MM") and `date`
 * ("YYYY-MM-DD") controls: the native picker on a phone, typed digits and
 * arrow keys on a desktop. Search is SearchField; a number with min/max is
 * Stepper; a date and a posting time together is DateTimePicker. The type
 * picks the mobile keyboard and autofill, so it is never "text" by default
 * when the value is an email or a URL.
 */
export type InputType = "text" | "email" | "password" | "url" | "tel" | "time" | "date"

export type InputProps = Omit<
  InputPrimitive.Props,
  "className" | "style" | "render" | "type" | "size"
> & {
  type?: InputType
  /**
   * Set the value in the kit's mono face (12px, as `Mono`), for a value read
   * character by character rather than as words: a webhook URL, a signing
   * secret, a token. Never for prose. The 16px floor under a coarse pointer
   * still applies, so iOS never zooms.
   */
  mono?: boolean
}

const NUMERIC: ReadonlySet<InputType> = new Set(["time", "date"])

/**
 * A one-line input on Base UI's Input, so inside a kit `Field` it is
 * labelled, described and validated by the field. Controlled with `value` +
 * `onValueChange` (or `onChange`), uncontrolled with `defaultValue`.
 * `time` and `date` are tabular, so the digits hold their place while a
 * value is typed over.
 */
export function Input({ type = "text", mono = false, ...props }: InputProps) {
  return (
    <InputPrimitive
      {...props}
      type={type}
      data-slot="kit-input"
      data-type={type}
      className={`h-kit-control-md ${mono ? FIELD_SURFACE_MONO : FIELD_SURFACE}${NUMERIC.has(type) ? " tabular-nums" : ""}`}
    />
  )
}
