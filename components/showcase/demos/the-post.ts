/*
 * The onboarding post, said once: the landing hero shows it, and the
 * three-beats and held-draft pictures import it, so the words cannot drift.
 *
 * A plain module on purpose. desk-and-pocket.tsx is "use client", and a
 * const imported from a client module into a server component (parts.tsx)
 * arrives as a reference proxy: every field reads empty.
 */
export const POST = {
  did: "We cut our onboarding from nine screens to three.",
  happened: "People who finished signup, the week before and since:",
  figure: "41% → 68%",
  meant: "Every screen we removed was a question we never needed to ask.",
} as const
