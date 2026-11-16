import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { createWriteStream } from "node:fs"
import type { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"

import type { Storage } from "./ingest"

/**
 * Cloudflare R2, reached over the S3 API.
 *
 * The `@aws-sdk` import is not a choice of AWS. R2 is S3-compatible on purpose,
 * the endpoint is `<account>.r2.cloudflarestorage.com`, and no AWS account is
 * involved — this is the standard client for a standard protocol. Cloudflare's
 * native R2 bindings only exist inside Workers, and Quincy runs on Vercel.
 *
 * R2 over S3, rather than Vercel Blob, for one reason that matters at this
 * scale: egress is free. Editing pulls the same proxy on every session and
 * every collaborator, and metered egress on video turns "scrub around a bit"
 * into a line item.
 *
 * Two S3 behaviours R2 does not share, worth knowing before relying on them:
 * there are no storage classes, and object-level ACLs are absent — a bucket is
 * public or it is not. Nothing here uses either.
 */

export type R2Config = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  /** Legal boundary the bucket was created under. Changes the hostname. */
  jurisdiction: R2Jurisdiction
  /**
   * Optional public base URL — a custom domain or the r2.dev subdomain — used
   * for objects that can be served without a signature. Proxies and thumbnails
   * are read constantly by the editor, and signing every one of them adds a
   * round trip to a request that has no secret in it.
   */
  publicBaseUrl?: string
}

export class MissingR2ConfigError extends Error {
  constructor(missing: string[]) {
    super(
      `R2 is not configured. Missing: ${missing.join(", ")}. ` +
        `See .env.example — the values come from Cloudflare dashboard → R2.`
    )
    this.name = "MissingR2ConfigError"
  }
}

/** Loose on purpose, so a caller (or a test) can pass a plain object. */
type Env = Record<string, string | undefined>

/**
 * Read the config, or say precisely what is absent.
 *
 * Throwing with the missing names beats a 403 from S3 twenty minutes later,
 * which is what a half-filled env file produces otherwise.
 */
export function readR2Config(env: Env = process.env): R2Config {
  const values = {
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_BUCKET,
  }

  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([key]) => `R2_${key.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`)

  if (missing.length > 0) throw new MissingR2ConfigError(missing)

  return {
    accountId: values.accountId!,
    accessKeyId: values.accessKeyId!,
    secretAccessKey: values.secretAccessKey!,
    bucket: values.bucket!,
    jurisdiction: readJurisdiction(env.R2_JURISDICTION),
    publicBaseUrl: env.R2_PUBLIC_BASE_URL || undefined,
  }
}

/**
 * Unset means default, which is the common case. An unknown value throws rather
 * than falling back: silently treating "europe" as default would put an EU
 * bucket's traffic on the wrong hostname and fail with an unrelated message.
 */
function readJurisdiction(value: string | undefined): R2Jurisdiction {
  if (!value) return "default"
  if (value === "default" || value === "eu" || value === "fedramp") return value
  throw new Error(
    `R2_JURISDICTION must be default, eu or fedramp — got "${value}".`
  )
}

export function isR2Configured(env: Env = process.env): boolean {
  try {
    readR2Config(env)
    return true
  } catch {
    return false
  }
}

/**
 * Where the bucket physically lives, as Cloudflare models it.
 *
 * Not a region — R2 has no regions in the S3 sense. A jurisdiction is a legal
 * boundary: buckets created under `eu` are guaranteed to keep data in the EU,
 * and they answer on a *different hostname*. Signing a request for an EU bucket
 * against the default endpoint fails, and the error does not mention
 * jurisdiction, so this is worth getting right once rather than debugging.
 */
export type R2Jurisdiction = "default" | "eu" | "fedramp"

export function r2Endpoint(
  accountId: string,
  jurisdiction: R2Jurisdiction = "default"
): string {
  const segment = jurisdiction === "default" ? "" : `${jurisdiction}.`
  return `https://${accountId}.${segment}r2.cloudflarestorage.com`
}

let cached: { client: S3Client; config: R2Config } | null = null

export function r2Client(config = readR2Config()): S3Client {
  // Cached across invocations because Fluid Compute reuses instances, and a
  // fresh client per request rebuilds the credential and signing chain for no
  // reason. Keyed on the config so a test passing its own is not handed the
  // process-env one.
  if (cached && sameConfig(cached.config, config)) return cached.client

  const client = new S3Client({
    // R2 ignores the region but the SDK insists on one. "auto" is what
    // Cloudflare's own docs use.
    region: "auto",
    endpoint: r2Endpoint(config.accountId, config.jurisdiction),
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  })

  cached = { client, config }
  return client
}

function sameConfig(a: R2Config, b: R2Config): boolean {
  return (
    a.accountId === b.accountId &&
    a.accessKeyId === b.accessKeyId &&
    a.bucket === b.bucket &&
    a.jurisdiction === b.jurisdiction
  )
}

/** Seconds. Long enough for a slow connection, short enough to not be a key. */
const READ_URL_TTL = 60 * 60
const UPLOAD_URL_TTL = 60 * 60 * 2

export function createR2Storage(config = readR2Config()): Storage {
  const client = r2Client(config)

  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          // The SDK wants a Uint8Array or a stream; both satisfy it.
          Body: body as Uint8Array,
          ContentType: contentType,
        })
      )
    },

    async url(key, expiresInSeconds = READ_URL_TTL) {
      // A public base URL means the object is already reachable and signing it
      // would add a round trip to a request carrying no secret.
      if (config.publicBaseUrl) {
        return `${config.publicBaseUrl.replace(/\/$/, "")}/${key}`
      }

      return getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: config.bucket, Key: key }),
        { expiresIn: expiresInSeconds }
      )
    },

    async exists(key) {
      try {
        await client.send(
          new HeadObjectCommand({ Bucket: config.bucket, Key: key })
        )
        return true
      } catch (error) {
        // A missing object is a 404 answer, not a failure. Anything else is a
        // real problem — swallowing it would make a bad key look like a cache
        // miss and quietly re-transcode the library.
        if (isNotFound(error)) return false
        throw error
      }
    },
  }
}

function isNotFound(error: unknown): boolean {
  const status = (error as { $metadata?: { httpStatusCode?: number } })
    ?.$metadata?.httpStatusCode
  const name = (error as { name?: string })?.name
  return status === 404 || name === "NotFound" || name === "NoSuchKey"
}

/**
 * A URL the browser can PUT straight to.
 *
 * Uploads do not pass through the server. A talking-head take is most of a
 * gigabyte, and streaming that through a function to hand it to R2 spends the
 * function's whole budget being a pipe. The client uploads directly and tells
 * us the key when it is done.
 *
 * Single PUT, which R2 accepts up to 5GB. Above that, or on connections where a
 * failed 800MB upload is a real cost, this becomes multipart — the S3 client
 * already has `@aws-sdk/lib-storage` for it, and the shape of this function
 * does not change.
 *
 * **The bucket needs a CORS policy for any of this to work**, because the PUT
 * comes from a browser on another origin. The signature travels in the URL and
 * is valid either way, so a missing policy fails in the browser before the
 * request is made and nothing reaches a log anywhere. `content-type` has to be
 * an allowed header specifically: it is signed into the URL, so the browser
 * sends it, so the preflight has to permit it — a policy that allows the method
 * and not the header passes preflight and then fails on a signature mismatch.
 * The policy to paste is in docs/video-ingest.md.
 */
export async function createUploadUrl(
  key: string,
  contentType: string,
  config = readR2Config()
): Promise<{ url: string; key: string; expiresInSeconds: number }> {
  const url = await getSignedUrl(
    r2Client(config),
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: UPLOAD_URL_TTL }
  )

  return { url, key, expiresInSeconds: UPLOAD_URL_TTL }
}

/**
 * Stream an object to a local path.
 *
 * Ingest needs the original on disk — ffmpeg seeks, and a seek needs a file —
 * but a talking-head take is most of a gigabyte and a function that buffers
 * that before writing it has spent its memory ceiling on a copy it throws away.
 * `pipeline` moves it through in chunks and, unlike a manual pipe, tears the
 * write stream down when the read side fails instead of leaving a truncated
 * file that ffmpeg then reports as a corrupt container.
 */
export async function downloadObject(
  key: string,
  destination: string,
  config = readR2Config()
): Promise<void> {
  const response = await r2Client(config).send(
    new GetObjectCommand({ Bucket: config.bucket, Key: key })
  )

  if (!response.Body) {
    throw new Error(`R2 returned no body for ${key}`)
  }

  await pipeline(response.Body as Readable, createWriteStream(destination))
}

export async function deleteObject(key: string, config = readR2Config()) {
  await r2Client(config).send(
    new DeleteObjectCommand({ Bucket: config.bucket, Key: key })
  )
}
