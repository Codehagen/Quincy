/**
 * Rebuilds the proxy for every ready asset that still has an old one.
 *
 * The proxy was 720 on its long edge and CRF 26, chosen when nothing had been
 * exported yet. Export renders the same React tree the player shows, so that
 * proxy was not just what you scrubbed — it was what you delivered. A 1080×1920
 * phone video became a 405×720 proxy, and every exported file was that picture
 * upscaled 2.67× and re-encoded.
 *
 * `DEFAULT_PROXY` is 1920/CRF 20 now, which is 1:1 with the canvas. Anything
 * already in the library keeps its old proxy until this has replaced it.
 *
 * Reads the **original**, not the existing proxy. Re-encoding a proxy would
 * bake its artefacts in and add a generation for nothing — the whole point is
 * to go back to the source pixels. That means the original must still be in
 * storage; assets whose upload is gone are skipped rather than downgraded.
 *
 * Selects on the key's version rather than a flag. `storageKeys.proxy` writes
 * `derived/proxy/v2/...`, so anything still on v1 is by definition unconverted
 * and a second run is a no-op — which also means an interrupted run resumes.
 *
 * The seek index is left alone on purpose. It holds keyframe offsets and audio
 * peaks, and neither moves: `-g` is still `fps * 2` against the same constant
 * frame rate, so keyframes land at the same instants, and the audio is encoded
 * with the same settings it was before. Only the picture changed.
 *
 * The filmstrip is left alone too, and only gets sharper if it is rebuilt —
 * `backfill-filmstrips.ts --force` reads the proxy, so running it after this
 * picks up the new pixels. Not required; the tiles are 156px wide.
 *
 * This spends real transcode time and real storage. A long library is worth
 * running overnight, and `--limit` exists to try a few first.
 *
 * Run with: npx tsx --env-file=.env.local scripts/backfill-proxies.ts
 */
import { and, eq, isNotNull, like, not } from "drizzle-orm"

import { db } from "../lib/db"
import { DEFAULT_PROXY, storageKeys } from "../lib/editor/media"
import { createR2Storage } from "../lib/editor/storage-r2"
import {
  createFfmpegTranscoder,
  withWorkspace,
} from "../lib/editor/transcoder-ffmpeg"
import { videoAsset } from "../lib/schema-app"

function argValue(name: string): string | undefined {
  const found = process.argv.find((arg) => arg.startsWith(`${name}=`))
  return found?.split("=")[1]
}

async function main() {
  const storage = createR2Storage()
  const limit = Number(argValue("--limit") ?? 0)
  // Rebuilds proxies that are already on the current version, for when the
  // settings change again rather than the path.
  const force = process.argv.includes("--force")

  const current = storageKeys.proxy("x").split("/").slice(0, 3).join("/")

  const rows = await db
    .select({
      id: videoAsset.id,
      filename: videoAsset.filename,
      contentHash: videoAsset.contentHash,
      storageKey: videoAsset.storageKey,
      proxyKey: videoAsset.proxyKey,
    })
    .from(videoAsset)
    .where(
      and(
        eq(videoAsset.state, "ready"),
        isNotNull(videoAsset.storageKey),
        force ? undefined : not(like(videoAsset.proxyKey, `${current}/%`))
      )
    )

  const assets = limit > 0 ? rows.slice(0, limit) : rows

  console.log(
    `${assets.length} asset(s) to rebuild at ${DEFAULT_PROXY.maxEdge}px / CRF ${DEFAULT_PROXY.crf}.\n`
  )

  let built = 0
  for (const asset of assets) {
    const label = `${asset.filename} (${asset.id})`

    try {
      const url = await storage.url(asset.storageKey)
      const response = await fetch(url)
      if (!response.ok) throw new Error(`original fetch ${response.status}`)

      const bytes = new Uint8Array(await response.arrayBuffer())

      const proxy = await withWorkspace((workdir) =>
        createFfmpegTranscoder({ workdir }).proxy(
          { kind: "bytes", bytes },
          DEFAULT_PROXY
        )
      )

      const key = storageKeys.proxy(asset.contentHash)
      await storage.put(key, proxy, "video/mp4")

      // The row moves to the new key only after the object is up. Interrupted
      // between the two, the asset still points at a proxy that exists.
      await db
        .update(videoAsset)
        .set({ proxyKey: key, updatedAt: new Date() })
        .where(eq(videoAsset.id, asset.id))

      built++
      const mb = (proxy.byteLength / 1_000_000).toFixed(1)
      console.log(`  ok    ${label} — ${mb} MB`)
    } catch (error) {
      // One bad file does not stop the rest, and a failure leaves the asset on
      // the proxy it already had rather than with none.
      console.log(`  skip  ${label} — ${(error as Error).message}`)
    }
  }

  console.log(`\nRebuilt ${built} of ${assets.length}.`)
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error)
    process.exit(1)
  }
)
