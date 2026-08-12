"use client"

import * as React from "react"

import type { ValidatedField } from "@/hooks/use-validated-field"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

/**
 * Binds a validated field to the markup, so the invalid wiring is written once
 * instead of five times. data-invalid goes on the Field and aria-invalid on the
 * control — that pairing is what field.tsx and assistive tech each read.
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
  type: React.HTMLInputTypeAttribute
  autoComplete: string
  field: ValidatedField
  disabled?: boolean
  /** Shown, submitted, focusable — but not editable. Not the same as disabled. */
  readOnly?: boolean
  inputRef?: React.Ref<HTMLInputElement>
  description?: string
}) {
  const errorId = `${id}-error`

  return (
    <Field data-invalid={field.error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        ref={inputRef}
        type={type}
        autoComplete={autoComplete}
        disabled={disabled}
        readOnly={readOnly}
        value={field.value}
        aria-invalid={field.error ? true : undefined}
        aria-describedby={field.error ? errorId : undefined}
        onChange={(event) => field.onChange(event.target.value)}
        onBlur={field.onBlur}
      />
      {field.error ? (
        <FieldError id={errorId}>{field.error}</FieldError>
      ) : description ? (
        <p className="text-caption text-muted-foreground">{description}</p>
      ) : null}
    </Field>
  )
}
