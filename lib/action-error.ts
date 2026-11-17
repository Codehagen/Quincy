/**
 * What a form says when its server action throws instead of answering: a
 * network drop or a 5xx. A refusal comes back as a result with its own
 * message; this is only for the call that never returned one.
 */
export const COULD_NOT_REACH = "Could not reach Quincy. Check your connection and try again."
