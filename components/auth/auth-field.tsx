"use client"

import * as React from "react"

import type { ValidatedField } from "@/hooks/use-validated-field"
import { Field, Input, type InputType } from "@/components/kit"

/**
 * Binds a validated field to the kit's Field + Input, so the wiring is written
 * once instead of five times.
 *
 * The timing stays in `useValidatedField` rather than in the kit Field's own
 * `validate`, and reaches the Field as `error`. Two things the hook does that
 * the Field cannot: it skips the blur on a field nobody typed in (autofocus put
 * the cursor there, not the person), and `validateNow()` checks every field on
 * submit, typed in or not. The Field still owns the markup: label bound to the
 * control, the message under it, `aria-describedby` and `data-invalid`.
 */
export function AuthField({
  id,
  label,
  type,
  autoComplete,
  field,
  disabled,
  readOnly,
  inputRef,
  description,
}: {
  id: string
  label: string
  type: InputType
  autoComplete: string
  field: ValidatedField
  disabled?: boolean
  /** Shown, submitted, focusable — but not editable. Not the same as disabled. */
  readOnly?: boolean
  inputRef?: React.Ref<HTMLInputElement>
  description?: string
}) {
  return (
    <Field
      label={label}
      name={id}
      description={description}
      error={field.error ?? undefined}
      disabled={disabled}
    >
      <Input
        id={id}
        ref={inputRef}
        type={type}
        autoComplete={autoComplete}
        readOnly={readOnly}
        value={field.value}
        onValueChange={(value) => field.onChange(value)}
        onBlur={field.onBlur}
      />
    </Field>
  )
}
