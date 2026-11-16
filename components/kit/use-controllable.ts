import * as React from "react"

/**
 * Controlled when `value` is defined, uncontrolled (from `defaultValue`)
 * otherwise. The setter always calls `onChange`, and only writes internal
 * state when uncontrolled. Internal to the kit.
 */
export function useControllable<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (next: T) => void,
): [T, (next: T) => void] {
  const [inner, setInner] = React.useState(defaultValue)
  const controlled = value !== undefined
  const current = controlled ? value : inner
  const set = React.useCallback(
    (next: T) => {
      if (!controlled) setInner(next)
      onChange?.(next)
    },
    [controlled, onChange],
  )
  return [current, set]
}
