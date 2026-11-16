/**
 * Local stand-ins for the server actions in app/(app)/ideas/actions.ts.
 * Same result shapes, no database, no model call, no spend. The delays stand
 * in for the round trip so the pending states are visible.
 */
import { CHANNELS_FOR_SHAPE, CONNECTED, type Angle } from "./data"

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export type DraftResult =
  | { ok: true }
  | { ok: false; reason: "no-channel"; message: string; fix: string; channel: string }

/** `draftAngle`: refuses a shape that lands nowhere this account publishes. */
export async function draftAngle(angle: Angle): Promise<DraftResult> {
  await wait(900)
  const lands = CHANNELS_FOR_SHAPE[angle.shape]
  const reachable = lands.some((c) => (CONNECTED as readonly string[]).includes(c.id))
  if (!reachable) {
    const channel = lands[0]?.label ?? "a channel"
    return {
      ok: false,
      reason: "no-channel",
      channel,
      message: `I can't draft ${angle.shape === "Essay" ? "an essay" : "this"} yet.`,
      fix: `Connect ${channel} and I'll write this one first.`,
    }
  }
  return { ok: true }
}

/** `archiveRiff`: the riff leaves the page and stays in the table. */
export async function archiveRiff(): Promise<{ ok: true }> {
  await wait(150)
  return { ok: true }
}

/** Uploading a take, or `captureToRiff` for written words. */
export async function sendToQuincy(): Promise<{ ok: true }> {
  await wait(700)
  return { ok: true }
}

/** How long the reading takes in this prototype (the real one is under a minute). */
export const READING_MS = 2600
