import { join } from "node:path"

import { getAsset } from "@/lib/editor/assets"
import { cooldownMessage } from "@/lib/editor/ingest-limits"
import { recordVoiceStart, voiceCooldown } from "@/lib/editor/ingest-meter"
import { storageKeys } from "@/lib/editor/media"
import { createR2Storage, downloadObject } from "@/lib/editor/storage-r2"
import {
  createFfmpegTranscoder,
  withWorkspace,
} from "@/lib/editor/transcoder-ffmpeg"
import {
  isEntitled,
  paywallResponse,
  resolveEntitlementForRequest,
} from "@/lib/entitlement"
import { getSession } from "@/lib/session"

/**
 * The cleaned voice of a take (media.ts `voiceCleanArgs`).
 *
 * Ingest makes it; this is for takes uploaded before it did, or whose step
 * failed. A track already stored is free and needs no gate. Making one is an
 * ffmpeg pass on the original — function time, nothing bought — so it sits
 * behind the entitlement and a per-person cooldown with its zero-cost row
 * (AGENTS.md, "Money"), the same as an ingest.
 */

export const maxDuration = 300

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session)
    return Response.json({ error: "Not signed in." }, { status: 401 })

  const { id } = await params
  const userId = session.user.id
  const asset = await getAsset(id, userId)
  if (!asset || asset.state !== "ready") {
    return Response.json({ error: "No such recording." }, { status: 404 })
  }
  if (!asset.hasAudio) {
    return Response.json(
      { error: "This recording has no sound." },
      { status: 422 }
    )
  }

  const storage = createR2Storage()
  const key = storageKeys.voice(asset.contentHash)
  if (await storage.exists(key)) {
    return Response.json({ url: await storage.url(key) })
  }

  const entitlement = await resolveEntitlementForRequest(session.user)
  if (!isEntitled(entitlement)) return paywallResponse(entitlement)

  const cooldown = await voiceCooldown(userId)
  if (!cooldown.ready) {
    return Response.json(
      {
        error: cooldownMessage(cooldown.secondsLeft),
        state: "cooldown",
        secondsLeft: cooldown.secondsLeft,
      },
      { status: 429 }
    )
  }
  await recordVoiceStart(userId)

  try {
    await withWorkspace(async (workdir) => {
      const source = join(workdir, "original")
      await downloadObject(asset.storageKey, source)
      const voice = await createFfmpegTranscoder({ workdir }).voice!({
        kind: "path",
        path: source,
      })
      await storage.put(key, voice, "audio/mp4")
    })
  } catch {
    return Response.json(
      {
        error:
          "The sound could not be cleaned. The take still plays as recorded.",
      },
      { status: 500 }
    )
  }

  return Response.json({ url: await storage.url(key) })
}
