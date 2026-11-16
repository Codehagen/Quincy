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

**Not fatal:** transcript, seek index, thumbnail, vision. These come back in
`warnings` and the asset still goes `ready`. Deepgram being down should not stop
you scrubbing footage, and an asset with no speech has no transcript by
definition — making it fatal would mean music and b-roll could never be
ingested at all.

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
