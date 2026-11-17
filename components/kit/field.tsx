"use client"

import * as React from "react"
import { Field as FieldPrimitive } from "@base-ui/react/field"

type ValidateResult = string | string[] | null

export type FieldProps = Omit<
  FieldPrimitive.Root.Props,
  | "className"
  | "style"
  | "render"
  | "children"
  | "validate"
  | "validationMode"
  | "invalid"
> & {
  /** Visible, always. A placeholder is not a label. */
  label: string
  /** One muted line under the control. It is read with the control. */
  description?: string
  /**
   * A short fact at the end of the label row, beside the label: a count
   * ("14/80"), the current time in a zone. Usually a `Mono`. It is not the
   * label and not read as part of it.
   */
  meta?: React.ReactNode
  /**
   * Return the message to show, or null. Runs on blur until it has once
   * failed, then on every change, so the message leaves the moment it is
   * fixed ("reward early, punish late").
   */
  validate?: (
    value: unknown,
  ) => ValidateResult | Promise<ValidateResult>
  /**
   * An error from outside the field (the server said no). Shown in the same
   * place as a validation error. Clear it when the value changes.
   */
  error?: string
  /** One kit Input, Textarea, Select, Switch or Stepper. */
  children: React.ReactNode
}

function failed(r: ValidateResult) {
  return Array.isArray(r) ? r.length > 0 : Boolean(r)
}

/**
 * Label (with an optional `meta` fact at the end of its row), control,
 * description, error: in that order, in one column, and the
 * error renders next to its field — never in a summary. On Base UI's Field,
 * so the label is bound to the control (`htmlFor`), the description and error
 * are wired into `aria-describedby`, and the control gets `data-invalid`.
 *
 * Wrap Fields in a real `<form>` so Enter submits; stack them with a
 * `flex flex-col gap-kit-group` group (20px, spacing.md).
 */
export function Field({
  label,
  description,
  meta,
  validate,
  error,
  children,
  ...props
}: FieldProps) {
  // "onBlur" until the first failure, then "onChange" for good.
  const [punished, setPunished] = React.useState(false)

  const check = validate
    ? (value: unknown) => {
        const r = validate(value)
        if (r instanceof Promise) {
          return r.then((v) => {
            if (failed(v)) setPunished(true)
            return v
          })
        }
        if (failed(r)) setPunished(true)
        return r
      }
    : undefined

  const labelEl = (
    <FieldPrimitive.Label className="min-w-0 text-kit-body font-kit-strong text-kit-ink select-none data-disabled:opacity-50">
      {label}
    </FieldPrimitive.Label>
  )

  return (
    <FieldPrimitive.Root
      {...props}
      validate={check}
      validationMode={punished ? "onChange" : "onBlur"}
      invalid={error ? true : undefined}
      data-slot="kit-field"
      className="flex w-full min-w-0 flex-col gap-1.5"
    >
      {meta != null ? (
        <div data-slot="kit-field-head" className="flex min-w-0 items-baseline justify-between gap-kit-related">
          {labelEl}
          <span data-slot="kit-field-meta" className="shrink-0">
            {meta}
          </span>
        </div>
      ) : (
        labelEl
      )}
      {children}
      {description ? (
        <FieldPrimitive.Description className="text-kit-small text-kit-ink-muted">
          {description}
        </FieldPrimitive.Description>
      ) : null}
      {error ? (
        <FieldPrimitive.Error match className="text-kit-small text-kit-danger">
          {error}
        </FieldPrimitive.Error>
      ) : (
        <FieldPrimitive.Error className="text-kit-small text-kit-danger" />
      )}
    </FieldPrimitive.Root>
  )
}
