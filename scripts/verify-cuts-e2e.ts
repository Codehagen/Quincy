import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

import ffmpegPath from "ffmpeg-static"

/**
 * The whole slice, against a running dev server: upload a file, get a project,
 * open the page, and check the page can actually render it.
 *
 * scripts/verify-ingest-e2e.ts stops at "the asset is ready". This carries on
 * into the part a person sees — a project row, a document with a clip on the
 * spine at the right canvas, media URLs that resolve, and HTML that contains
 * the editor rather than a redirect to login.
 *
 *   npx tsx --env-file=.env.local scripts/verify-cuts-e2e.ts --port 3001
 */

const run = promisify(execFile)

const portFlag = process.argv.indexOf("--port")
const PORT = portFlag > -1 ? process.argv[portFlag + 1] : "3001"
const BASE = `http://localhost:${PORT}`

const failures: string[] = []

function check(condition: boolean, message: string) {
  if (!condition) failures.push(message)
  console.log(`  ${condition ? "ok  " : "FAIL"} ${message}`)
}

async function main() {
  const dir = await mkdtemp(join(tmpdir(), "cuts-e2e-"))

  try {
    console.log(`── sign in (${BASE}) ──`)
    const cookie = await signIn()
    check(Boolean(cookie), "session cookie issued")

    console.log("\n── a wide fixture and a portrait one ──")
    const wide = await makeFixture(dir, "wide", 640, 360)
    const tall = await makeFixture(dir, "tall", 360, 640)
    console.log(`  wide ${wide.byteLength}b, tall ${tall.byteLength}b`)

    const wideProject = await uploadAndOpen(cookie, wide, "wide.mp4")
    const tallProject = await uploadAndOpen(cookie, tall, "tall.mp4")

    console.log("\n── the canvas follows the footage ──")
    const wideDoc = await readProject(cookie, wideProject)
    const tallDoc = await readProject(cookie, tallProject)

    console.log(
      `  wide → ${wideDoc.document.settings.canvas.width}x${wideDoc.document.settings.canvas.height}`
    )
    console.log(
      `  tall → ${tallDoc.document.settings.canvas.width}x${tallDoc.document.settings.canvas.height}`
    )

    check(
      wideDoc.document.settings.canvas.width >
        wideDoc.document.settings.canvas.height,
      "a wide recording opens in a wide canvas"
    )
    check(
      tallDoc.document.settings.canvas.height >
        tallDoc.document.settings.canvas.width,
      "a portrait recording opens in a vertical canvas"
    )

    console.log("\n── the document has something to play ──")
    const scene = wideDoc.document.scenes[0]
    const main = scene.tracks.find((track: { isMain?: boolean }) => track.isMain)
    const clip = main?.elements[0]

    check(Boolean(clip), "one clip on the spine")
    check(clip?.provenance?.createdBy === "user", "the import is credited to the user")
    check(clip?.startUs === 0 && clip?.trimStartUs === 0, "untrimmed")

    const captions = scene.tracks.find(
      (track: { kind: string }) => track.kind === "caption"
    )
    check(
      captions?.elements.length === 0,
      "the caption lane is present and empty"
    )

    console.log("\n── media resolves to URLs that work ──")
    const media = wideDoc.media[clip.mediaId]
    check(Boolean(media?.proxyUrl), "proxy URL resolved")
    check(Boolean(media?.seekIndexUrl), "seek index URL resolved")

    // A ranged GET, which is what a <video> element actually issues — and not
    // HEAD, which a URL signed for GetObject correctly refuses with a 403.
    // Range support is the thing worth proving anyway: without it the element
    // downloads the whole proxy before it will seek.
    const proxy = await fetch(media.proxyUrl, {
      headers: { Range: "bytes=0-1023" },
    })
    check(
      proxy.status === 206,
      `proxy serves a byte range, so seeking does not wait for the whole file (${proxy.status})`
    )
    check(
      proxy.headers.get("content-type") === "video/mp4",
      `proxy is served as video/mp4 (${proxy.headers.get("content-type")})`
    )

    const seek = await fetch(media.seekIndexUrl)
    const index = await seek.json()
    console.log(
      `  ${index.values.length} peaks, ${index.keyframesUs.length} keyframes`
    )
    check(index.keyframesUs.length > 0, "seek index has keyframes")

    console.log("\n── optimistic concurrency ──")
    const stale = await put(
      cookie,
      `${BASE}/api/editor/projects/${wideProject}`,
      { document: wideDoc.document, revision: wideDoc.revision }
    )
    check(stale.status === 200, `a save at the current revision lands (${stale.status})`)

    const conflict = await put(
      cookie,
      `${BASE}/api/editor/projects/${wideProject}`,
      { document: wideDoc.document, revision: wideDoc.revision }
    )
    check(
      conflict.status === 409,
      `the same revision twice is refused (${conflict.status})`
    )

    console.log("\n── the page renders ──")
    const page = await fetch(`${BASE}/cuts/${wideProject}`, {
      headers: { cookie },
      redirect: "manual",
    })
    const html = await page.text()

    check(page.status === 200, `/cuts/:id returns 200 (${page.status})`)
    check(!html.includes("/login"), "not a redirect to login")
    check(html.includes("<video") || html.includes("aspect-ratio"), "the preview is in the markup")

    const list = await fetch(`${BASE}/cuts`, { headers: { cookie } })
    check(list.status === 200, `/cuts returns 200 (${list.status})`)

    console.log(`\n  projects: ${wideProject}, ${tallProject}`)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }

  console.log("\n────────────────────────")
  if (failures.length === 0) {
    console.log("PASS — a dropped file becomes a project you can open.")
    return
  }

  console.log(`FAIL — ${failures.length} problem(s):`)
  for (const failure of failures) console.log(`  - ${failure}`)
  process.exitCode = 1
}

async function uploadAndOpen(
  cookie: string,
  bytes: Buffer,
  filename: string
): Promise<string> {
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 32)

  const upload = await post(cookie, `${BASE}/api/editor/uploads`, {
    filename,
    mimeType: "video/mp4",
    sizeBytes: bytes.byteLength,
    hash,
  })

  const { assetId, uploadUrl, alreadyIngested } = upload.body as {
    assetId: string
    uploadUrl?: string
    alreadyIngested: boolean
  }

  if (!alreadyIngested && uploadUrl) {
    await fetch(uploadUrl, {
      method: "PUT",
      headers: { Origin: BASE, "Content-Type": "video/mp4" },
      body: new Uint8Array(bytes) as unknown as BodyInit,
    })
    await post(cookie, `${BASE}/api/editor/assets/${assetId}/ingest`, {})
  }

  const project = await post(cookie, `${BASE}/api/editor/projects`, { assetId })
  return (project.body as { id: string }).id
}

async function readProject(cookie: string, id: string) {
  const response = await fetch(`${BASE}/api/editor/projects/${id}`, {
    headers: { cookie },
  })
  return response.json()
}

/** A clip of the requested shape, so the canvas decision has something to read. */
async function makeFixture(
  dir: string,
  name: string,
  width: number,
  height: number
): Promise<Buffer> {
  const speech = join(dir, `${name}.aiff`)
  const output = join(dir, `${name}.mp4`)

  await run("say", ["-o", speech, `This is the ${name} take.`])
  await run(ffmpegPath!, [
    "-f",
    "lavfi",
    "-i",
    `testsrc=size=${width}x${height}:rate=30:duration=6`,
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

  return readFile(output)
}

async function signIn(): Promise<string> {
  const email = process.env.DEV_ACCOUNT_EMAIL ?? "dev@quincy.test"
  const password = process.env.DEV_ACCOUNT_PASSWORD

  if (!password) throw new Error("DEV_ACCOUNT_PASSWORD is not set.")

  let response = await attempt()
  for (let i = 0; response.status === 429 && i < 6; i++) {
    console.log("  rate limited, waiting 15s")
    await new Promise((resolve) => setTimeout(resolve, 15_000))
    response = await attempt()
  }

  if (!response.ok) {
    throw new Error(`sign-in failed (${response.status}): ${await response.text()}`)
  }

  return (response.headers.getSetCookie?.() ?? [])
    .map((entry) => entry.split(";")[0])
    .join("; ")

  function attempt() {
    return fetch(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: BASE },
      body: JSON.stringify({ email, password }),
    })
  }
}

async function post(cookie: string, url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie, Origin: BASE },
    body: JSON.stringify(body),
    redirect: "manual",
  })

  return { status: response.status, body: await response.json().catch(() => null) }
}

async function put(cookie: string, url: string, body: unknown) {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", cookie, Origin: BASE },
    body: JSON.stringify(body),
    redirect: "manual",
  })

  return { status: response.status, body: await response.json().catch(() => null) }
}

main().catch((error) => {
  console.error(`\n${error.message ?? error}`)
  process.exitCode = 1
})
