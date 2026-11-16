/**
 * Local stand-ins for app/(app)/ideas/actions.ts. Not server actions: nothing
 * here touches the database or spends. Each one waits about as long as the
 * real call does, so the pending states are visible.
 */

import type { Angle, Riff } from "./data"

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export type DraftResult =
  | { ok: true }
  | { ok: false; reason: "no-channel" | "entitlement"; message: string }

/** `draftAngle`: writes the draft, or says why it could not. */
export async function draftAngle(angle: Angle): Promise<DraftResult> {
  await wait(900)
  if (angle.refusal) return { ok: false, ...angle.refusal }
  return { ok: true }
}

/**
 * The voice pipeline after Stop: transcribe, then find angles. The real one
 * runs as a workflow and the page polls; here the promise is the poll.
 */
export async function readTake(
  take: Pick<Riff, "scrap" | "keyLine" | "angles">,
): Promise<Pick<Riff, "scrap" | "keyLine" | "angles">> {
  await wait(2400)
  return take
}
