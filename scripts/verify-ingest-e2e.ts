import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

import ffmpegPath from "ffmpeg-static"

/**
 * The three routes, against a running dev server, as a browser would call them.
 *
 * scripts/verify-ingest.ts proves the pipeline works. This proves the *product*
 * works: that a session is required, that a presigned URL comes back, that the
 * browser's PUT survives the bucket's CORS policy, that ingest claims and
 * completes, and that the URLs handed to the editor actually read back.
 *
 *   npx tsx --env-file=.env.local scripts/verify-ingest-e2e.ts
 *   npx tsx --env-file=.env.local scripts/verify-ingest-e2e.ts --port 3001
 *
 * Signs in as the @quincy.test dev account — the same guard scripts/dev-account.ts
 * enforces, for the same reason. Run that first if sign-in fails.
 *
 * The uploaded asset is left in place. It is a three second clip and it is the
 * first real thing in the library; deleting it would throw away the only footage
 * anyone can open the editor against.
 */

const run = promisify(execFile)

const portFlag = process.argv.indexOf("--port")
const PORT = portFlag > -1 ? process.argv[portFlag + 1] : "3001"
const BASE = `http://localhost:${PORT}`

/**
 * The Origin the bucket's CORS policy is checked against.
 *
 * Defaults to the dev server's own origin, because that is what a real browser
 * sends and a policy missing it should fail here rather than in someone's face.
 * `--origin` overrides it, which is how the rest of the chain stays verifiable
 * on a machine where the dev port and the allowed origin have drifted apart.
 */
const originFlag = process.argv.indexOf("--origin")
const ORIGIN = originFlag > -1 ? process.argv[originFlag + 1] : BASE

const SCRIPT = "Quincy turns one recording into a week of posts."

const failures: string[] = []

function check(condition: boolean, message: string) {
  if (!condition) failures.push(message)
  console.log(`  ${condition ? "ok  " : "FAIL"} ${message}`)
}

async function main() {
  const dir = await mkdtemp(join(tmpdir(), "e2e-ingest-"))

  try {
    console.log(`── sign in (${BASE}) ──`)
    const cookie = await signIn()
    check(Boolean(cookie), "session cookie issued")
    if (!cookie) throw new Error("cannot continue without a session")

    console.log("\n── auth is required ──")
    const anonymous = await fetch(`${BASE}/api/editor/uploads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      redirect: "manual",
    })
    check(
      anonymous.status === 401 || anonymous.status === 307,
      `unauthenticated upload refused (${anonymous.status})`
    )

    console.log("\n── fixture ──")
    const file = await makeFixture(dir)
    const bytes = await readFile(file)
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 32)
    console.log(`  ${bytes.byteLength} bytes, digest ${hash}`)

    console.log("\n── POST /api/editor/uploads ──")
    const upload = await post(`${BASE}/api/editor/uploads`, cookie, {
      filename: "e2e-fixture.mp4",
      mimeType: "video/mp4",
      sizeBytes: bytes.byteLength,
      hash,
    })
    console.log(
      `  ${upload.status} ${JSON.stringify(upload.body).slice(0, 160)}`
    )
    check(upload.status === 200, "upload URL issued")

    const { assetId, uploadUrl, alreadyIngested } = upload.body as {
      assetId: string
      uploadUrl?: string
      alreadyIngested: boolean
    }
    check(Boolean(assetId), "asset id returned")

    console.log("\n── validation ──")
    const badType = await post(`${BASE}/api/editor/uploads`, cookie, {
      filename: "notes.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
      hash,
    })
    check(badType.status === 400, `non-media type refused (${badType.status})`)

    const badHash = await post(`${BASE}/api/editor/uploads`, cookie, {
      filename: "x.mp4",
      mimeType: "video/mp4",
      sizeBytes: 10,
      hash: "../../etc/passwd",
    })
    check(
      badHash.status === 400,
      `path-shaped hash refused (${badHash.status})`
    )

    if (!alreadyIngested && uploadUrl) {
      console.log("\n── CORS preflight, as the browser sends it ──")
      const preflight = await fetch(uploadUrl, {
        method: "OPTIONS",
        headers: {
          Origin: ORIGIN,
          "Access-Control-Request-Method": "PUT",
          "Access-Control-Request-Headers": "content-type",
        },
      })
      const allowed = preflight.headers.get("access-control-allow-origin")
      console.log(`  ${preflight.status} allow-origin=${allowed}`)
      check(
        allowed === ORIGIN,
        `bucket allows ${ORIGIN} — add it to the R2 CORS policy if this fails`
      )

      console.log("\n── PUT the bytes straight to R2 ──")
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { Origin: ORIGIN, "Content-Type": "video/mp4" },
        body: new Uint8Array(bytes) as unknown as BodyInit,
      })
      console.log(`  ${put.status} etag=${put.headers.get("etag")}`)
      check(put.ok, "bytes uploaded")
    } else {
      console.log("\n  (already ingested — skipping upload)")
    }

    console.log("\n── POST /api/editor/assets/:id/ingest ──")
    const started = Date.now()
    const ingest = await post(
      `${BASE}/api/editor/assets/${assetId}/ingest`,
      cookie,
      {}
    )
    const elapsed = ((Date.now() - started) / 1000).toFixed(1)
    console.log(`  ${ingest.status} in ${elapsed}s`)
    console.log(`  ${JSON.stringify(ingest.body)}`)
    check(ingest.status === 200, "ingest completed")

    const ingested = ingest.body as {
      state?: string
      warnings?: string[]
      hasTranscript?: boolean
    }
    check(ingested.state === "ready", "asset reached ready")
    check(ingested.hasTranscript === true, "transcript was stored")
    check(
      (ingested.warnings ?? []).length === 0,
      `no warnings (${(ingested.warnings ?? []).join("; ") || "none"})`
    )

    console.log("\n── a second ingest is refused, not duplicated ──")
    const again = await post(
      `${BASE}/api/editor/assets/${assetId}/ingest`,
      cookie,
      {}
    )
    check(
      again.status === 200,
      `re-ingesting a ready asset is idempotent (${again.status})`
    )

    console.log("\n── GET /api/editor/assets/:id ──")
    const view = await fetch(`${BASE}/api/editor/assets/${assetId}`, {
      headers: { cookie },
    })
    const asset = (await view.json()) as Record<string, string | number | null>
    console.log(
      `  ${asset.width}x${asset.height} @ ${asset.fps}fps, ` +
        `${(Number(asset.durationUs) / 1_000_000).toFixed(2)}s, audio=${asset.hasAudio}`
    )
    check(view.status === 200, "asset readable")
    check(Boolean(asset.proxyUrl), "proxy URL issued")
    check(Boolean(asset.seekIndexUrl), "seek index URL issued")
    check(Boolean(asset.thumbnailUrl), "thumbnail URL issued")

    console.log("\n── the editor reads what it was handed ──")
    const proxy = await fetch(String(asset.proxyUrl))
    const proxyBytes = (await proxy.arrayBuffer()).byteLength
    console.log(
      `  proxy: ${proxy.status}, ${proxyBytes} bytes, ${proxy.headers.get("content-type")}`
    )
    check(proxy.ok && proxyBytes > 1000, "proxy downloads and is plausible")

    const seek = await fetch(String(asset.seekIndexUrl))
    const index = (await seek.json()) as {
      values: number[]
      keyframesUs: number[]
      intervalUs: number
    }
    console.log(
      `  seek index: ${index.values.length} peaks, ${index.keyframesUs.length} keyframes at ${index.keyframesUs.map((k) => (k / 1e6).toFixed(2)).join("s, ")}s`
    )
    check(index.values.length > 0, "peaks present")
    check(index.keyframesUs.length > 0, "keyframes present")

    const thumb = await fetch(String(asset.thumbnailUrl))
    check(thumb.ok, `thumbnail downloads (${thumb.status})`)

    console.log("\n── someone else's asset is not found ──")
    const foreign = await fetch(`${BASE}/api/editor/assets/va_notarealid`, {
      headers: { cookie },
    })
    check(foreign.status === 404, `unknown id is a 404 (${foreign.status})`)

    console.log(`\n  asset id: ${assetId}`)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }

  console.log("\n────────────────────────")
  if (failures.length === 0) {
    console.log("PASS — upload to editable asset, through the real routes.")
    return
  }

  console.log(`FAIL — ${failures.length} problem(s):`)
  for (const failure of failures) console.log(`  - ${failure}`)
  process.exitCode = 1
}

async function signIn(): Promise<string> {
  const email = process.env.DEV_ACCOUNT_EMAIL ?? "dev@quincy.test"
  const password = process.env.DEV_ACCOUNT_PASSWORD

  if (!password) {
    throw new Error(
      "DEV_ACCOUNT_PASSWORD is not set. See scripts/dev-account.ts."
    )
  }

  let response = await signInOnce(email, password)

  // Better Auth rate-limits sign-in, and a script meant to be run repeatedly
  // hits that ceiling honestly — it is the auth surface working, not a failure
  // to report. Waiting it out beats telling someone their password is wrong.
  for (let attempt = 0; response.status === 429 && attempt < 6; attempt++) {
    const wait = 15_000
    console.log(`  rate limited, waiting ${wait / 1000}s`)
    await new Promise((resolve) => setTimeout(resolve, wait))
    response = await signInOnce(email, password)
  }

  if (!response.ok) {
    throw new Error(
      `sign-in failed (${response.status}): ${await response.text()}. ` +
        `Run: npx tsx --env-file=.env.local scripts/dev-account.ts`
    )
  }

  return (response.headers.getSetCookie?.() ?? [])
    .map((entry) => entry.split(";")[0])
    .join("; ")
}

function signInOnce(email: string, password: string) {
  // Origin is not optional here. Better Auth rejects a state-changing request
  // without one as CSRF, and node's fetch does not add it the way a browser
  // does — so a script that omits it fails with MISSING_OR_NULL_ORIGIN and
  // looks like bad credentials. It must also match the configured baseURL:
  // BETTER_AUTH_URL is the trusted origin, so a dev server on another port
  // needs that variable moved with it.
  return fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, password }),
  })
}

async function post(url: string, cookie: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie, Origin: BASE },
    body: JSON.stringify(body),
    redirect: "manual",
  })

  const text = await response.text()
  let parsed: unknown = text
  try {
    parsed = JSON.parse(text)
  } catch {
    // A redirect or an HTML error page. Kept as text so the caller can print it.
  }

  return { status: response.status, body: parsed }
}

/** Same fixture as verify-ingest.ts: a short clip with real speech in it. */
async function makeFixture(dir: string): Promise<string> {
  const speech = join(dir, "speech.aiff")
  const output = join(dir, "fixture.mp4")

  await run("say", ["-o", speech, SCRIPT])
  await run(ffmpegPath!, [
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=640x360:rate=30:duration=6",
    "-i",
    speech,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    "-y",
    output,
  ])

  await stat(output)
  return output
}

main().catch((error) => {
  console.error(`\n${error.message ?? error}`)
  process.exitCode = 1
})
