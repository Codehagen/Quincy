import { Suspense } from "react"

import { getSession } from "@/lib/session"

import { loadRealNumbers } from "./load-real"
import { NumbersLab } from "./numbers-lab"

/**
 * Prototype surface: three directions for Numbers "more like a dashboard"
 * (owner's brief, 2026-11-16), on fixtures, at true size in the app shell.
 * When signed in, the "yours" data reads the account's own rows (read-only,
 * load-real.ts) through the same arithmetic. Outside app/(app);
 * app/prototypes/layout.tsx hides it in production. The decision goes in
 * DECISION.md; then this folder is deleted.
 */
export const metadata = {
  title: "Prototype · Numbers lab",
  robots: { index: false, follow: false },
}

async function Lab() {
  const session = await getSession()
  const real = session ? await loadRealNumbers(session.user.id).catch(() => null) : null
  return <NumbersLab real={real} />
}

export default function NumbersLabPage() {
  return (
    <Suspense>
      <Lab />
    </Suspense>
  )
}
