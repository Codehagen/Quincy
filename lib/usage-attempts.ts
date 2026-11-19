/**
 * Attempt rows that only shadow a metered run.
 *
 * A cooldown reads the attempt log in `usage_event` (lib/usage.ts,
 * `spendCooldown`), so some paths write a zero-cost row the moment a run
 * starts, before anything is spent. For the editor's agent and three-cuts
 * runs that row is a second record of the same press: the run itself writes
 * its own metered row (`project:{id}`, `three-cuts:{id}:{letter}`) under the
 * model's slug when it ends. On /credits the attempt would show as a second
 * charge of $0.00 beside the real one, and "Turns" would count every run
 * twice.
 *
 * So these labels stay in the table, where the cooldowns need them, and are
 * left out of what /credits and /settings count and list. `cuts:ingest` is
 * not one of them: it is the only row an ingest writes, so it is the record
 * of that ingest, not a shadow of one.
 */
export const EDITOR_AGENT_ATTEMPT = "editor:agent"
export const EDITOR_THREE_CUTS_ATTEMPT = "editor:three-cuts"

export const ATTEMPT_ONLY_LABELS = [EDITOR_AGENT_ATTEMPT, EDITOR_THREE_CUTS_ATTEMPT]

/** Whether a `usage_event.model` value is an attempt that shadows a metered run. */
export function isAttemptOnly(model: string): boolean {
  return ATTEMPT_ONLY_LABELS.includes(model)
}
