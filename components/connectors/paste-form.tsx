"use client"

import * as React from "react"

import { Button, Field, Input, Text, type ButtonProps, type InputProps } from "@/components/kit"

/**
 * One string pasted into a connector and handed to a server action: a signing
 * secret, an API key, a username. See plans/033.
 *
 * Compound, so each connector arranges its own words around the parts while
 * the root owns what every copy used to repeat: the value, the server's
 * refusal shown under the field, the pending state, Enter submitting, and the
 * field emptied on success.
 *
 *   <PasteForm action={(value) => connectKeySource(source, value)}>
 *     <PasteForm.Field label="Your Fathom API key" type="password" />
 *     <PasteForm.Hint>Find it in …</PasteForm.Hint>
 *     <PasteForm.Footer>
 *       <PasteForm.Submit variant={…} pendingLabel="Connecting…">Connect</PasteForm.Submit>
 *       <Text …>Connected as …</Text>
 *     </PasteForm.Footer>
 *   </PasteForm>
 *
 * The page decides the ink (`Submit`'s `variant`), never the form. Local to
 * /connectors; promote it to the kit only when a page outside it needs one.
 */

type ActionResult = { ok: true } | { ok: false; message: string }

type PasteFormContextValue = {
  value: string
  setValue: (value: string) => void
  error: string | undefined
  clearError: () => void
  pending: boolean
}

const PasteFormContext = React.createContext<PasteFormContextValue | null>(null)

function usePasteForm(part: string): PasteFormContextValue {
  const context = React.useContext(PasteFormContext)
  if (!context) throw new Error(`PasteForm.${part} must be inside a PasteForm.`)
  return context
}

export type PasteFormProps = {
  /** The server action. A refusal's `message` shows under the field. */
  action: (value: string) => Promise<ActionResult>
  /** After a success, once the field is empty again. */
  onSuccess?: () => void
  children: React.ReactNode
}

function PasteFormRoot({ action, onSuccess, children }: PasteFormProps) {
  const [value, setValue] = React.useState("")
  const [error, setError] = React.useState<string | undefined>()
  const [pending, startTransition] = React.useTransition()

  const submit = () => {
    if (!value.trim()) return
    setError(undefined)
    startTransition(async () => {
      const result = await action(value)
      if (!result.ok) {
        setError(result.message)
        return
      }
      setValue("")
      onSuccess?.()
    })
  }

  const context = React.useMemo<PasteFormContextValue>(
    () => ({ value, setValue, error, clearError: () => setError(undefined), pending }),
    [value, error, pending]
  )

  return (
    <PasteFormContext.Provider value={context}>
      {/* A real form, so Enter submits (forms.md). */}
      <form
        noValidate
        className="flex flex-col gap-kit-related"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        {children}
      </form>
    </PasteFormContext.Provider>
  )
}

export type PasteFormFieldProps = Omit<InputProps, "value" | "defaultValue" | "onValueChange"> & {
  label: string
}

/** The kit Field and Input. Mono, no autocomplete and no spellcheck unless told otherwise. */
function PasteFormField({ label, mono = true, autoComplete = "off", spellCheck = false, ...input }: PasteFormFieldProps) {
  const { value, setValue, error, clearError } = usePasteForm("Field")
  return (
    <Field label={label} error={error}>
      <Input
        {...input}
        value={value}
        onValueChange={(next: string) => {
          setValue(next)
          if (error) clearError()
        }}
        mono={mono}
        autoComplete={autoComplete}
        spellCheck={spellCheck}
      />
    </Field>
  )
}

/** One muted line under the field: where the string comes from. */
function PasteFormHint({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="small" tone="muted">
      {children}
    </Text>
  )
}

/** The submit button and whatever sits beside it, on one wrapping row. */
function PasteFormFooter({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-kit-related">{children}</div>
}

export type PasteFormSubmitProps = Omit<ButtonProps, "type" | "pending" | "onClick">

/** Disabled while the field is blank; pending while the action runs. */
function PasteFormSubmit({ disabled, ...props }: PasteFormSubmitProps) {
  const { value, pending } = usePasteForm("Submit")
  return <Button {...props} type="submit" disabled={disabled || !value.trim()} pending={pending} />
}

export const PasteForm = Object.assign(PasteFormRoot, {
  Field: PasteFormField,
  Hint: PasteFormHint,
  Footer: PasteFormFooter,
  Submit: PasteFormSubmit,
})
