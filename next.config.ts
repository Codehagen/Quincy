import { createRequire } from "node:module"

import type { NextConfig } from "next"
import { withWorkflow } from "workflow/next"

/**
 * Whether the Lapse inspector is installed on this machine.
 *
 * Lapse is an optional dependency served from a private registry, so it is
 * present for whoever has the token in their `~/.npmrc` and absent for CI, for
 * anyone who cloned the public repository, and for the production build. That
 * is deliberate — it is a development tool and nothing in the product needs it
 * — but "absent" has to mean *nothing refers to it*, because a bundler resolves
 * a dynamic import at build time and a missing target is a build error, not a
 * caught exception.
 *
 * So the answer is computed here, once, and handed to the client as a literal.
 * `components/lapse-panel.tsx` reads it in a condition; Next inlines
 * `NEXT_PUBLIC_*` at build time, the condition folds to `false`, and the whole
 * branch — the `import()` with it — is dropped before resolution is attempted.
 * That is the same mechanism the `NODE_ENV` guard in that file already relies
 * on, and the comment there records how it was verified.
 *
 * Detected rather than configured. A `NEXT_PUBLIC_LAPSE=1` in `.env.local`
 * would work identically and would be one more thing to remember on a machine
 * that already answers the question by having the package or not.
 */
const require_ = createRequire(import.meta.url)

function hasLapse(): boolean {
  try {
    require_.resolve("@aiforui/lapse")
    return true
  } catch {
    return false
  }
}

/**
 * Renamed surfaces keep their old paths working. Deliberately temporary (307)
 * rather than permanent (308): the vocabulary is still moving, and a browser
 * that has cached a 308 never asks again — so if any of these paths is ever
 * reused for something else, every machine that visited the old one is stuck
 * with the redirect. Flip to permanent once the naming settles and ships.
 */
const RENAMED_ROUTES: Array<[from: string, to: string]> = [
  ["/rituals", "/rhythm"],
  // /rhythm-grid was a second hardcoded exploration and is gone; the old
  // path lands on the one real page rather than on a 404.
  ["/rituals-grid", "/rhythm"],
  ["/rhythm-grid", "/rhythm"],
  ["/ideate", "/riffs"],
  // /wiki was the Brain's first name. This pointed at /voice, which was itself
  // deleted as a placeholder (see components/app-sidebar.tsx) — so the one
  // entry in this list whose job is to prevent a 404 was answering with one.
  ["/wiki", "/brain"],
]

/**
 * The catalogue rhythms `/rhythm` no longer renders. Each lands on `/rhythm`.
 *
 * `LIVE_RHYTHMS` is derived from `runsToday`, so a card with no code behind it
 * is off the grid and `/rhythm/{id}` answers 404 for it. Every one of these ids
 * was a real, linkable page before that, which makes this the same job the
 * table above does — a path somebody has open keeps working.
 *
 * **Written out rather than imported, and the import is the reason.**
 * `lib/rhythms.ts` reaches `lib/rhythm-handlers.ts`, which opens a database
 * connection; pulling that into the config would make `next.config.ts` need
 * `DATABASE_URL` to be read at all. The source of truth is still one place:
 * this is `RHYTHMS` minus `LIVE_RHYTHMS` in `lib/rhythms.ts`, and a rhythm that
 * gains a handler should lose its line here.
 */
const RETIRED_RHYTHMS: string[] = [
  "atomize",
  "auto-cta",
  "comment-mining",
  "evening-report",
  "every-comment",
  "five-hooks",
  "morning-brief",
  "native-recut",
  "notes-ladder",
  "opportunity-watch",
  "outliers",
  "people-radar",
  "photo-carousels",
  "post-momentum",
  "receipt-watch",
  "reply-ideas",
  "repurpose-winners",
  "second-wave",
  "weekly-analytics",
]

const nextConfig: NextConfig = {
  // Read by components/lapse-panel.tsx and nothing else. Empty rather than
  // "0" so the branch folds on a falsy literal either way.
  env: { NEXT_PUBLIC_LAPSE: hasLapse() ? "1" : "" },

  /**
   * Partial prerendering. The marketing surfaces are static pages wearing a
   * dynamic header: the only per-request read on them is the session that
   * decides between "Log in" and "Open Studio". With this on, everything
   * outside that Suspense boundary prerenders into a static shell served from
   * the CDN, and only the header hole streams. The condition it imposes —
   * every cookies()/headers()/searchParams read must sit under a Suspense
   * boundary — is met by the boundaries in each route group's layout.
   */
  cacheComponents: true,
  /**
   * ffmpeg-static and ffprobe-static resolve their binary with `__dirname`, and
   * a bundler rewrites that. Bundled, the path comes out as
   * `/ROOT/node_modules/...` and the spawn fails with ENOENT on a path that
   * never existed — which reads as a broken install rather than a build
   * setting. Left external, the packages are required at runtime and compute
   * the real path.
   */
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static"],
  /**
   * /why renders docs/vision.md, which lives outside the app directory and so
   * is not traced into the serverless bundle on its own. One source of truth
   * beats a second copy of 1,500 words in a TypeScript string.
   */
  outputFileTracingIncludes: {
    "/why": ["./docs/vision.md"],
    /**
     * ffmpeg and ffprobe are binaries resolved through a path string at
     * runtime, so nothing in the module graph points at them and the tracer
     * leaves both out. The route then deploys cleanly and throws ENOENT on the
     * first real upload, which is the worst moment to find out.
     *
     * ffprobe-static ships every platform's build in the package; only the
     * Linux one is worth carrying into a Linux function. ffmpeg-static
     * downloads exactly one binary at install, and on Vercel that install runs
     * on Linux, so its single file is already the right one.
     */
    "/api/editor/assets/[id]/ingest": [
      "./node_modules/.pnpm/ffmpeg-static@*/node_modules/ffmpeg-static/ffmpeg",
      "./node_modules/.pnpm/ffprobe-static@*/node_modules/ffprobe-static/bin/linux/x64/ffprobe",
    ],
  },
  async redirects() {
    const retired: Array<[string, string]> = RETIRED_RHYTHMS.map((id) => [
      `/rhythm/${id}`,
      "/rhythm",
    ])

    return [...RENAMED_ROUTES, ...retired].map(([source, destination]) => ({
      source,
      destination,
      permanent: false,
    }))
  },
}

/**
 * `withWorkflow` enables the `"use workflow"` and `"use step"` directives.
 *
 * Quincy's first background infrastructure. The Vercel crons in `vercel.json`
 * were the whole of it until now, and a cron is the wrong shape for a voice
 * note: it fires on a clock rather than on a person pressing record, and it
 * has no per-run state to show while the work is in flight.
 *
 * `after()` was the cheaper alternative and does not survive the comparison.
 * It is not durable — a crashed function loses the work with nothing to
 * inspect, no retry, and no row that knows it was ever running — and the
 * stuck-state story /riffs needs (`startedAt`, a failed state, a retry) is
 * exactly the machinery Workflow already ships. Writing it by hand to avoid a
 * dependency would be writing this dependency.
 *
 * NOTE: `proxy.ts`'s matcher excludes `.well-known/workflow` for this to work
 * at all. See the comment there.
 */
export default withWorkflow(nextConfig)
