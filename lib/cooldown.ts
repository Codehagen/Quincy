/**
 * The cooldown decision, without the clock or the database.
 *
 * Every cooldown in the product asks the same question — "when did this person
 * last start one, and is that long enough ago?" — and differs only in where
 * the last start is read from (`usage_event` for `spendCooldown`, a sample
 * asset's row for the Cuts sample). The arithmetic lives here once so the
 * rounding is the same everywhere and so it can be tested without a fake
 * database.
 */
export type CooldownDecision =
  | { ready: true }
  | { ready: false; secondsLeft: number }

export function cooldownDecision(
  lastAt: Date | null | undefined,
  cooldownMs: number,
  now: number = Date.now()
): CooldownDecision {
  if (!lastAt) return { ready: true }

  const elapsed = now - lastAt.getTime()
  if (elapsed >= cooldownMs) return { ready: true }

  // Rounded up, and never below one: "try again in 0 seconds" is a refusal
  // that reads like an invitation, and the second press would be refused too.
  return {
    ready: false,
    secondsLeft: Math.max(1, Math.ceil((cooldownMs - elapsed) / 1000)),
  }
}
