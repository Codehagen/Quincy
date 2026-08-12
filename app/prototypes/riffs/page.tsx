import { Shell } from "../shell"
import { Faults } from "./variants/faults"

/**
 * Every way /riffs can fail, on one screen.
 *
 * What is left of a three-round prototype. The design questions are closed —
 * Desk shipped on 2026-08-08 (see `components/riffs/instrument.tsx`) and the
 * channel-gap control shipped with it (see `components/riffs/channel-gap.tsx`)
 * — so the picker and the layout variants are gone. This is not a variant and
 * there is nothing to compare it against: it is a **test surface**, kept
 * because the states on it are otherwise reachable only by revoking a
 * microphone permission, running out of entitlement, killing a workflow
 * mid-run, or waiting out a timeout.
 *
 * Outside the `(app)` route group so it needs no session, and nothing in
 * `app/(app)` or `components/` imports from here.
 */
export const metadata = {
  title: "Faults — Riffs",
  robots: { index: false, follow: false },
}

export default function RiffFaultsPage() {
  return (
    <Shell>
      <Faults />
    </Shell>
  )
}
