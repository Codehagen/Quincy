"use client"

import * as React from "react"

/**
 * One field's value plus its validation *timing*.
 *
 * The rule is reward early, punish late:
 *
 * - Nothing is flagged while someone types their first attempt. Telling a
 *   person their email is invalid after one character is just wrong, and it
 *   trains them to ignore the message that eventually matters.
 * - Blur validates, but only a field they have actually typed in. Autofocus
 *   drops the cursor into the first field, so tabbing straight past it is not
 *   a mistake yet — it is someone who has not reached it. Scolding there
 *   punishes them for where *we* put the cursor.
 * - Submit validates everything, typed in or not.
 * - Once a field has shown an error, and only then, it validates on every
 *   keystroke — so the message disappears the instant it is fixed rather than
 *   waiting for another blur.
 *
 * `hasErrored` is what carries that last part. It never resets, because a field
 * that has been wrong once has earned the tighter feedback for the rest of the
 * form's life.
 */
export function useValidatedField(
  validate: (value: string) => string | null,
  /**
   * Starting value, for a field the server already knows — the address on an
   * invite, say. Untouched by the timing rules above: a prefilled field is not
   * dirty, so it is not scolded on blur for something the user never typed.
   */
  initialValue = ""
) {
  const [value, setValue] = React.useState(initialValue)
  const [error, setError] = React.useState<string | null>(null)
  const [hasErrored, setHasErrored] = React.useState(false)
  const [isDirty, setIsDirty] = React.useState(false)

  const record = React.useCallback((next: string | null) => {
    setError(next)
    if (next) {
      setHasErrored(true)
    }
  }, [])

  const onChange = (next: string) => {
    setValue(next)
    setIsDirty(true)

    if (hasErrored) {
      setError(validate(next))
    }
  }

  const onBlur = () => {
    // Typing once and clearing it back to empty still counts as dirty — that
    // person did try, and an empty required field is worth telling them about.
    if (!isDirty) {
      return
    }

    record(validate(value))
  }

  /** Returns true when the field is valid. Called for every field on submit. */
  const validateNow = () => {
    const next = validate(value)
    record(next)
    return next === null
  }

  return { value, error, onChange, onBlur, validateNow }
}

export type ValidatedField = ReturnType<typeof useValidatedField>
