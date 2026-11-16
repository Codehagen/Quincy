import { Suspense } from "react"

import { STATES, type HarnessState } from "./data"
import { Harness } from "./harness"

/**
 * First run, every state, on fixtures (harness.tsx says which). The real
 * /welcome cannot show them to an account that has already finished first
 * run, and walking it on a real account writes brain pages, reads X and pays
 * for the angles. Nothing here touches the server.
 */
export const metadata = {
  title: "Prototype — First run",
  robots: { index: false, follow: false },
}

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default function WelcomePrototypePage({ searchParams }: Props) {
  return (
    <Suspense fallback={null}>
      <Screen searchParams={searchParams} />
    </Suspense>
  )
}

async function Screen({ searchParams }: Props) {
  const raw = (await searchParams).state
  const value = Array.isArray(raw) ? raw[0] : raw
  const state: HarnessState = STATES.includes(value as HarnessState)
    ? (value as HarnessState)
    : "intro"
  // Keyed, so changing ?state= starts the flow over rather than carrying
  // the last one's typing and pending turns into it.
  return <Harness key={state} state={state} />
}
