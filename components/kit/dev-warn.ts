const warned = new Set<string>()

/**
 * A kit rule the types cannot see (one Highlight per object, a note needs
 * the margin column), said once per rule in development and never shipped.
 * Internal to the kit.
 */
export function devWarn(rule: string, message: string) {
  if (process.env.NODE_ENV === "production") return
  if (warned.has(rule)) return
  warned.add(rule)
  console.warn(`kit: ${message}`)
}

/** The Card or Window an element sits in, if any. */
export function objectOf(el: Element | null) {
  return el?.closest('[data-slot="kit-card"]') ?? null
}
