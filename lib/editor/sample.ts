import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { createIdGenerator } from "ai"
import { and, desc, eq, sql } from "drizzle-orm"

import { cooldownDecision } from "../cooldown"
import { db } from "../db"
import { videoAsset, videoProject } from "../schema-app"
import { storageKeys } from "./media"
import { createProjectFromAsset } from "./projects"
import {
  parseSampleManifest,
  SAMPLE_DIR_SEGMENTS,
  SAMPLE_MANIFEST_FILE,
  type SampleManifest,
} from "./sample-manifest"
import { createR2Storage, isR2Configured } from "./storage-r2"

/**
 * "Try it with a sample recording": a project made from a recording that was
 * prepared once, by `scripts/prepare-cuts-sample.ts`, and committed under
 * `public/samples/cuts/`.
 *
 * **Nothing here spends.** No transcode and no Deepgram call: the editing copy,
 * the seek index, the poster, the filmstrip and the transcript were all made
 * by the script, once, on the owner's machine. What this does is write rows.
 *
 * **The files are copied into the bucket, not served from `public/`.** Every
 * reader of an asset — the editor page, the project and asset routes, export —
 * turns a storage key into a URL through `createR2Storage().url`. Pointing a
 * sample asset at a public path instead would mean a second kind of key that
 * each of those readers has to recognise, and the first one that forgets
 * renders a black rectangle. Copied under content-addressed keys
 * (`derived/proxy/v2/sample-cuts:<hash>.mp4`, …), the sample asset is a row
 * like any other, and the copy happens once for everybody: every later sample
 * finds the objects already there.
 *
 * **Limits, though it costs nothing.** At most one sample project per person at
 * a time — pressing again opens the one they have — and a short cooldown on
 * making a new one, so a loop cannot fill the project table.
 */

/** Thirty seconds between sample projects. The cap does most of the work. */
export const SAMPLE_COOLDOWN_MS = 30 * 1000

const newAssetId = createIdGenerator({ prefix: "va", size: 16 })

function sampleDir(): string {
  return join(process.cwd(), ...SAMPLE_DIR_SEGMENTS)
}

/**
 * The manifest, or null when there is no sample on this deployment. Null on
 * any failure, so a missing or broken manifest hides the button instead of
 * breaking the page.
 */
export async function readSampleManifest(): Promise<SampleManifest | null> {
  try {
    const raw = await readFile(join(sampleDir(), SAMPLE_MANIFEST_FILE), "utf8")
    return parseSampleManifest(JSON.parse(raw))
  } catch {
    return null
  }
}

/** Whether the sample button should render at all. */
export async function sampleAvailable(): Promise<boolean> {
  if (!isR2Configured()) return false
  return (await readSampleManifest()) !== null
}

export type SampleOutcome =
  | { ok: true; projectId: string }
  | { ok: false; error: string }

export async function createSampleProject(
  userId: string
): Promise<SampleOutcome> {
  const manifest = await readSampleManifest()
  if (!manifest || !isR2Configured()) {
    return { ok: false, error: "There is no sample recording on this deployment." }
  }

  const [existing] = await db
    .select()
    .from(videoAsset)
    .where(
      and(
        eq(videoAsset.userId, userId),
        eq(videoAsset.contentHash, manifest.contentHash)
      )
    )
    .limit(1)

  if (existing) {
    // The cap: one sample project at a time. The asset id is in the
    // document (as a clip's `mediaId`) and nowhere else on the project row,
    // and asset ids are random, so a text match on it is exact enough.
    const [project] = await db
      .select({ id: videoProject.id })
      .from(videoProject)
      .where(
        and(
          eq(videoProject.userId, userId),
          sql`${videoProject.document}::text like ${`%${existing.id}%`}`
        )
      )
      .orderBy(desc(videoProject.updatedAt))
      .limit(1)

    if (project) return { ok: true, projectId: project.id }

    const cooldown = cooldownDecision(existing.updatedAt, SAMPLE_COOLDOWN_MS)
    if (!cooldown.ready) {
      return {
        ok: false,
        error: `Try again in ${cooldown.secondsLeft} ${cooldown.secondsLeft === 1 ? "second" : "seconds"}.`,
      }
    }

    await db
      .update(videoAsset)
      .set({ updatedAt: new Date() })
      .where(eq(videoAsset.id, existing.id))

    const created = await createProjectFromAsset(userId, existing)
    return { ok: true, projectId: created.id }
  }

  const keys = await copySampleToStorage(manifest)

  const transcript = manifest.files.transcript
    ? (JSON.parse(
        await readFile(join(sampleDir(), manifest.files.transcript), "utf8")
      ) as Record<string, unknown>)
    : null

  const inserted = await db
    .insert(videoAsset)
    .values({
      id: newAssetId(),
      userId,
      state: "ready",
      filename: manifest.filename,
      mimeType: manifest.mimeType,
      contentHash: manifest.contentHash,
      sizeBytes: manifest.sizeBytes,
      // The original is not shipped — the editor and export both read the
      // proxy — so this key names an object that does not exist. Nothing
      // reads it for a `ready` asset; re-ingest is the one reader, and a
      // ready asset is never re-ingested.
      storageKey: storageKeys.original(manifest.contentHash),
      proxyKey: keys.proxy,
      seekIndexKey: keys.seekIndex,
      thumbnailKey: keys.thumbnail,
      filmstripKey: keys.filmstrip,
      filmstripTiles: manifest.filmstrip?.count ?? null,
      filmstripIntervalUs: manifest.filmstrip?.intervalUs ?? null,
      filmstripTileWidth: manifest.filmstrip?.tileWidth ?? null,
      filmstripTileHeight: manifest.filmstrip?.tileHeight ?? null,
      durationUs: manifest.probe.durationUs,
      width: manifest.probe.width,
      height: manifest.probe.height,
      fps: Math.round(manifest.probe.fps),
      rotation: manifest.probe.rotation,
      hasAudio: manifest.probe.hasAudio,
      transcript,
      transcriptProvider: transcript ? manifest.transcriptProvider : null,
      transcribedAt: transcript ? new Date() : null,
    })
    // Two presses racing: the unique (user, content hash) index refuses the
    // second insert, and the second press is told to try again rather than
    // making a second project.
    .onConflictDoNothing({
      target: [videoAsset.userId, videoAsset.contentHash],
    })
    .returning()

  const asset = inserted[0]
  if (!asset) return { ok: false, error: "Try again in a moment." }

  const project = await createProjectFromAsset(userId, asset)
  return { ok: true, projectId: project.id }
}

/**
 * Put the prepared files in the bucket under the sample's content-addressed
 * keys, skipping any already there. After the first sample on a deployment,
 * this is four HEAD requests and nothing else.
 */
async function copySampleToStorage(manifest: SampleManifest) {
  const storage = createR2Storage()
  const hash = manifest.contentHash
  const dir = sampleDir()

  const plan: Array<{ key: string; file: string; type: string }> = [
    { key: storageKeys.proxy(hash), file: manifest.files.proxy, type: "video/mp4" },
    {
      key: storageKeys.seekIndex(hash),
      file: manifest.files.seekIndex,
      type: "application/json",
    },
  ]
  if (manifest.files.thumbnail) {
    plan.push({
      key: storageKeys.thumbnail(hash),
      file: manifest.files.thumbnail,
      type: "image/jpeg",
    })
  }
  if (manifest.files.filmstrip) {
    plan.push({
      key: storageKeys.filmstrip(hash),
      file: manifest.files.filmstrip,
      type: "image/jpeg",
    })
  }

  await Promise.all(
    plan.map(async ({ key, file, type }) => {
      if (await storage.exists(key)) return
      const bytes = new Uint8Array(await readFile(join(dir, file)))
      await storage.put(key, bytes, type)
    })
  )

  return {
    proxy: storageKeys.proxy(hash),
    seekIndex: storageKeys.seekIndex(hash),
    thumbnail: manifest.files.thumbnail ? storageKeys.thumbnail(hash) : null,
    filmstrip: manifest.files.filmstrip ? storageKeys.filmstrip(hash) : null,
  }
}
