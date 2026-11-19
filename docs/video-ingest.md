# Video ingest

Everything that happens to a file between "the user picked it" and "the editor
can open it". The orchestration lives in `lib/editor/ingest.ts` and is written
against ports; this document covers the parts that touch the outside world.

## The path a file takes

```
browser                          server                      R2 / providers
───────                          ──────                      ──────────────
hash the file
  │
  ├─ POST /api/editor/uploads ──► find or create the row
  │   {filename, mimeType,        (video_asset, state=uploaded)
  │    sizeBytes, hash}         ◄─ presigned PUT url
  │                                 └─ or alreadyIngested: true, and stop
  │
  ├─ PUT the bytes ──────────────────────────────────────────► R2 assets/<hash>
  │
  └─ POST /api/editor/assets/:id/ingest
                                  claim the row (state=processing)
                                  download the original to /tmp
                                  probe ────────────────────► ffprobe
                                  proxy ────────────────────► ffmpeg → R2
                                  audio → peaks
                                  transcribe ───────────────► Deepgram
                                  keyframes → seek index ───► R2
                                  thumbnail ────────────────► R2
                                  state=ready
```

The bytes never pass through a function. A talking-head take is most of a
gigabyte and streaming that through a serverless function to hand it to storage
spends the whole budget being a pipe.

The hash arrives before the bytes do, which is what makes a re-upload free: a
file the user already has comes back as `alreadyIngested` with no URL at all.

## What is fatal and what is not

**Fatal:** probe and proxy. Without them there is nothing to edit, so the asset
goes `failed` with the reason on the row.

**Not fatal:** transcript, seek index, thumbnail, filmstrip, cleaned voice, vision. These come back in
`warnings` and the asset still goes `ready`. Deepgram being down should not stop
you scrubbing footage, and an asset with no speech has no transcript by
definition — making it fatal would mean music and b-roll could never be
ingested at all.

## The cleaned voice

With audio, ingest also writes `derived/voice/v1/<hash>.m4a`: the take's sound
through `highpass=f=80,afftdn=nf=-25,loudnorm=I=-16:TP=-1.5:LRA=11`
(`lib/editor/media.ts`, `voiceCleanArgs`). It is ffmpeg only, so nothing is
bought. A cut plays it when its spine clips say `voice: "clean"`; the
composition mutes the clip and plays the track over the same window, and
without a stored track the clip plays as recorded.

Takes uploaded before this, or whose step failed, are cleaned on the first
press of Clean sound: `POST /api/editor/assets/[id]/voice`. A stored track is
returned free; making one sits behind the entitlement and
`VOICE_COOLDOWN_MS` (one a minute) with a zero-cost `cuts:voice` row.

## What it may spend

AGENTS.md, "Money": a ceiling on what is bought, and a cooldown because a
person presses the button. The numbers are named constants in
`lib/editor/ingest-limits.ts`; the database half is `ingest-meter.ts`.

| Limit | Value | Where it is checked |
| --- | --- | --- |
| Entitlement | trialing or active | both routes, first, before any row or URL |
| `INGEST_COOLDOWN_MS` | one ingest start a minute | uploads (read-only) and ingest |
| `MAX_RECORDING_SECONDS` | 20 minutes | uploads (browser's duration, a courtesy), then after the probe, then on the PCM length |
| `DAILY_TRANSCRIBE_SECONDS` | 60 minutes of Deepgram audio, rolling 24h | uploads (anything left?), ingest (anything left?), after the probe (this file × passes) |

Order on the ingest route: entitlement → cooldown → day exhausted? → write the
`cuts:ingest` attempt row → claim → download → probe → **admit** (length, and
day + this file × the transcriber's `maxPasses`) → transcode → audio →
**admitTranscription** (the same checks on the PCM length, for containers whose
probe had no duration) → Deepgram.

A refusal at admit is fatal: the asset goes `failed` with the sentence on the
row, the route answers 413 (too long) or 429 (the day), and the asset can be
retried once the limit allows. A refusal at admitTranscription is a warning,
like a Deepgram outage: the asset opens without captions.

**Metering.** Every ingest start writes `cuts:ingest` (zero cost; it is the
cooldown's attempt log, so a silent screen recording still counts). Every
Deepgram request — the first pass and each language retry — writes
`deepgram:transcribe` *before* it is sent, with the seconds of audio in
`input_tokens` and `DEEPGRAM_COST_MICROS_PER_SECOND` × seconds in
`cost_micros`. The daily ceiling sums those seconds, so it counts what was
bought, not what was kept. /credits shows the row as "1m 05s of audio".

Vision does not spend today: the ingest route passes no vision port. When one
is added it meters as `vision:<provider>` through the same table.

Not bounded yet: R2 storage. The 5GB per-file cap and the cooldown bound how
fast it grows, but there is no per-user total.

## The sample recording

/cuts offers "Try it with a sample recording" to someone with no projects. It
makes a project from files prepared once and committed, so pressing it never
transcodes and never calls Deepgram (`lib/editor/sample.ts`). The prepared
files are copied into the bucket under content-addressed `sample-cuts:` keys
the first time anyone uses the sample, which makes the sample asset an
ordinary row that every reader signs like any other. One sample project per
person at a time (pressing again opens it), and 30 seconds between new ones.

The button renders only when `public/samples/cuts/manifest.json` exists and
validates, so nothing changes until a sample is committed. To add one:

1. Record a 10–20 second clip with speech in it that you own.
2. `npx tsx --env-file=.env.local scripts/prepare-cuts-sample.ts <clip> --yes`
   — this is the one Deepgram call the sample ever makes, a few cents.
3. Commit `public/samples/cuts/`.

`next.config.ts` traces `public/samples/cuts/**` into the `/cuts` function,
because the page and its server action read the files from disk.

## Bucket CORS

Required, because the browser PUTs to R2 directly. Without it the upload fails
in the browser with a CORS error and nothing reaches the server, so the asset
sits at `uploaded` forever with no clue why.

Has to be done in the dashboard. The R2 token in `.env.local` is scoped to
Object Read & Write, which is enough to put and read objects and not enough to
read or set bucket configuration — `GetBucketCors` with it returns 403. Setting
this from code would mean a Cloudflare API token with Admin Read & Write on R2,
which is a much larger credential to hold for a one-time change.

Cloudflare dashboard → R2 → `quincy-media` → Settings → CORS policy → Edit:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://hirequincy.com"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3600
  }
]
```

Three things to get right:

- **`PUT` and `GET` both.** `PUT` is the upload. `GET` is the editor reading the
  proxy back through a signed URL, which is a cross-origin read of the same
  bucket and fails the same way.
- **`content-type` in `AllowedHeaders`.** The presigned URL is signed *with* a
  content type, so the browser must send it, so the preflight must allow it. A
  policy that allows the method but not the header passes preflight and fails
  the PUT with a signature mismatch.
- **Preview deployments are a different origin.** Every `*.vercel.app` preview
  URL is its own origin and none of them match a production entry, so uploads on
  a preview fail while the same build works on production. Left out of the
  policy above deliberately: R2's handling of a wildcard origin is worth
  confirming against the bucket rather than assuming, and the alternative —
  pasting each preview URL as it appears — is not a policy anyone maintains. Add
  it when a preview actually needs to upload, and check it works.

`localhost:3001` is in there because the dev server has been running on 3001
(3000 was taken). Drop it once that stops being true.

## The transcode host

Vercel functions, for now. `maxDuration` is 300s and the package limit is 5GB,
which is enough for ffmpeg-static plus a proxy transcode of anything short.

The thing that forces a move to a durable worker is not complexity, it is that
ceiling: a 4K take long enough to exceed 300s of transcoding cannot finish here,
and the failure is a platform kill with no error worth reading. When that
happens, `lib/editor/ingest.ts` does not change — only the ports do.

Two `next.config.ts` entries keep the binaries reachable, and both were found
the hard way.

`serverExternalPackages` leaves `ffmpeg-static` and `ffprobe-static` out of the
bundle. Both resolve their binary with `__dirname`, and a bundler rewrites that
— bundled, the path comes out as `/ROOT/node_modules/…` and the spawn fails with
ENOENT on a path that never existed, which reads as a broken install rather than
a build setting.

`outputFileTracingIncludes` carries the binary files themselves into the
function. Nothing in the module graph points at them, so the tracer leaves both
out and the route deploys cleanly, then throws ENOENT on the first real upload.

`ffmpeg-static` downloads its binary in a postinstall script, so it is listed
under `allowBuilds` in `pnpm-workspace.yaml`. An install with build scripts
blocked produces a package with no binary in it. Note that pnpm 11 ignores the
`pnpm` field in `package.json` entirely — the setting only counts in
`pnpm-workspace.yaml`.

## The tables

`video_asset` and `video_project` are created by

```
npx tsx --env-file=.env.local scripts/apply-video.ts
```

Hand-applied SQL rather than `db:push`, matching `apply-channels.ts` and the
rest: `drizzle/` has no baseline, so a generated migration carries `CREATE
TABLE` for every table in the app. Idempotent, and it reads the result back —
"the CREATE did not error" and "the table is what the application expects" are
different claims, and only the second one matters.

## Verifying it

Two scripts, and they answer different questions.

```
npx tsx --env-file=.env.local scripts/verify-ingest.ts
```

Does the **pipeline** work. Synthesises a short clip with real speech in it
(macOS `say`), runs it against the real binaries and the real Deepgram key, and
does a put/exists/read/delete round trip against the bucket. No database, no
user, no server.

It checks the things that only fail in contact with the world: that the binaries
are on disk, that ffmpeg accepts the argument lists as written, that Deepgram
takes headerless PCM at the rate we claim, and that the timestamps come back on
the right scale.

```
npx tsx --env-file=.env.local scripts/verify-ingest-e2e.ts --port 3001
```

Does the **product** work. Signs in as the `@quincy.test` dev account, walks all
three routes as a browser would, and checks what a browser would care about: a
session is required, validation refuses a PDF and a path-shaped hash, the
bucket's CORS policy admits the dev origin, the PUT lands, ingest claims and
completes, a re-upload of the same file comes back `alreadyIngested` without
re-transcoding, and the URLs handed to the editor actually download.

Two things about running it. `BETTER_AUTH_URL` has to match the port the dev
server is on — it is the trusted origin, and Better Auth rejects a sign-in from
anywhere else as CSRF. And the origin the CORS preflight is checked against
defaults to that same port, so `--origin` exists for the case where the dev port
and the allowed origin have drifted apart.

Last full run: cold ingest of a 3.1s clip in 16.8s, the same upload deduped in
0.2s, 156 peaks, keyframes at 0.00s and 2.00s, nine transcribed words, no
warnings.
