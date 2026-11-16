/**
 * Builds a filmstrip sheet for every ready asset that has none.
 *
 * Ingest makes one for anything uploaded from now on. Everything already in the
 * library was ingested before the step existed, and without this those clips
 * would draw the hairline placeholder forever — which is the version of this
 * feature where it works for nobody who has already used the product.
 *
 * Reads the **proxy**, not the original. The proxy is conformed — upright,
 * constant frame rate, one codec — and a strip built from an original with a
 * rotation matrix comes out sideways, because ffmpeg's scale and crop filters
 * work on the decoded frame and the matrix is applied after them.
 *
 * Idempotent: an asset that already has a key is skipped, so a second run is a
 * no-op and an interrupted one resumes.
 *
 * Run with: npx tsx --env-file=.env.local scripts/backfill-filmstrips.ts
 */
import { and, eq, isNull, isNotNull } from "drizzle-orm"

import { db } from "../lib/db"
import { planFilmstrip, storageKeys } from "../lib/editor/media"
import { createR2Storage } from "../lib/editor/storage-r2"
import {
  createFfmpegTranscoder,
  withWorkspace,
} from "../lib/editor/transcoder-ffmpeg"
import { videoAsset } from "../lib/schema-app"

async function main() {
  // `--force` rebuilds sheets that already exist, for when the plan itself
  // changes — the tiles were 16:9 crops before they followed the footage, and
  // an asset with a key would otherwise keep the old shape forever.
  const force = process.argv.includes("--force")
  const storage = createR2Storage()

  const assets = await db
    .select({
      id: videoAsset.id,
      filename: videoAsset.filename,
      contentHash: videoAsset.contentHash,
      proxyKey: videoAsset.proxyKey,
      durationUs: videoAsset.durationUs,
    })
    .from(videoAsset)
    .where(
      and(
        eq(videoAsset.state, "ready"),
        force ? undefined : isNull(videoAsset.filmstripKey),
        isNotNull(videoAsset.proxyKey)
      )
    )

  console.log(
    `${assets.length} asset(s) ${force ? "to rebuild" : "without a filmstrip"}.\n`
  )

  let built = 0
  for (const asset of assets) {
    const label = `${asset.filename} (${asset.id})`

    try {
      const url = await storage.url(asset.proxyKey!)
      const response = await fetch(url)
      if (!response.ok) throw new Error(`proxy fetch ${response.status}`)

      const bytes = new Uint8Array(await response.arrayBuffer())
      const plan = planFilmstrip(asset.durationUs ?? 0)

      const strip = await withWorkspace((workdir) =>
        createFfmpegTranscoder({ workdir }).filmstrip(
          { kind: "bytes", bytes },
          plan
        )
      )

      const key = storageKeys.filmstrip(asset.contentHash)
      await storage.put(key, strip, "image/jpeg")

      await db
        .update(videoAsset)
        .set({
          filmstripKey: key,
          filmstripTiles: plan.count,
          filmstripIntervalUs: plan.intervalUs,
          filmstripTileWidth: plan.tileWidth,
          filmstripTileHeight: plan.tileHeight,
          updatedAt: new Date(),
        })
        .where(eq(videoAsset.id, asset.id))

      built++
      console.log(
        `  ok    ${label} — ${plan.count} tiles every ${(plan.intervalUs / 1_000_000).toFixed(2)}s`
      )
    } catch (error) {
      // One bad file does not stop the rest. A missing strip is the state this
      // asset was already in.
      console.log(`  skip  ${label} — ${(error as Error).message}`)
    }
  }

  console.log(`\nBuilt ${built} of ${assets.length}.`)
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error)
    process.exit(1)
  }
)
