/**
 * What this deployment can and cannot do, decided once at boot instead of at
 * the first request that needs it.
 *
 * Quincy already degrades honestly one variable at a time: `isGoogleEnabled`
 * hides a sign-in button, `isBillingConfigured` refuses to render Subscribe,
 * `lib/channels.ts` will not offer Connect for a platform with no app, and the
 * cron routes answer 503 rather than running unauthenticated. Each of those is
 * right, and none of them is visible to the person doing the deploying — a
 * missing key is a button that quietly is not there, on a page nobody has open.
 *
 * The failure that motivated this: `STRIPE_SECRET_KEY` absent means checkout is
 * off, and the way you find out is a customer who cannot pay. The variable was
 * missing for the whole life of the deploy; the symptom arrived at the first
 * charge. The gap between those two moments is what this file closes.
 *
 * **It is a report, not a gate.** Two rules follow from that, and both matter:
 *
 * - **Optional means optional.** Self-hosting is a documented use
 *   (`docs/self-hosting.md`: a database and two variables), so a missing X app
 *   or Stripe key must never stop the server. They print as switched-off
 *   capabilities and the app runs.
 * - **It must not break a build.** `lib/db.ts` is deliberately lazy so a build
 *   without credentials still succeeds, and that decision is load-bearing on
 *   Vercel. Nothing here may undo it — see `instrumentation.ts`, which is what
 *   decides when to throw.
 */

/** A variable the server cannot start without, and why. */
type Required = { name: string; why: string }

/** A capability that switches off when its variables are absent. */
type Capability = { name: string; vars: string[]; without: string }

/**
 * The three that have no honest fallback.
 *
 * `DATABASE_URL` is every read. `BETTER_AUTH_SECRET` signs sessions **and** is
 * the encryption key for stored X and LinkedIn tokens (`lib/channels.ts`), so
 * it is also the one variable that must never be rotated casually — doing so
 * invalidates every channel grant in the table. `BETTER_AUTH_URL` is what
 * every OAuth callback and every link in an email is built from; wrong or
 * missing, sign-in fails in a way that looks like the provider's fault.
 */
const REQUIRED: Required[] = [
  { name: "DATABASE_URL", why: "every read and write goes through it" },
  {
    name: "BETTER_AUTH_SECRET",
    why: "signs sessions and encrypts stored channel tokens — rotating it invalidates every X and LinkedIn grant",
  },
  {
    name: "BETTER_AUTH_URL",
    why: "every OAuth callback and every link in an email is built from it",
  },
]

/**
 * Everything else, expressed as the capability it buys rather than as a name.
 *
 * `without` is written to be read by someone who has just deployed and wants to
 * know what they have. It names the consequence, because the variable name
 * alone does not say that publishing stops.
 */
const CAPABILITIES: Capability[] = [
  {
    name: "Model calls",
    vars: ["AI_GATEWAY_API_KEY"],
    without: "chat, drafting, voice notes and every rhythm fail at the model call",
  },
  {
    name: "Scheduled work",
    vars: ["CRON_SECRET"],
    without:
      "all four crons answer 503 — nothing publishes, no rhythm runs, and a post more than two hours late is refused rather than delayed",
  },
  {
    name: "Email",
    vars: ["RESEND_API_KEY"],
    without:
      "no verification mail, so no new account can ever sign in; no invites, no reauth notices, and no cron alerts",
  },
  {
    name: "Billing",
    vars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    without: "checkout is hidden and nobody can subscribe",
  },
  {
    name: "Publishing to X",
    vars: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
    without: "X cannot be connected, so nothing publishes there",
  },
  {
    name: "Publishing to LinkedIn",
    vars: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
    without: "LinkedIn cannot be connected, so nothing publishes there",
  },
  {
    name: "Google sign-in",
    vars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    without: "the Google button is hidden; email and password still work",
  },
  {
    name: "Shipped work as riffs",
    vars: ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_WEBHOOK_SECRET"],
    without: "the GitHub webhook answers 503 and merged pull requests never arrive",
  },
  /**
   * The only capability here that still works without its variable, which is
   * why `without` describes a rate limit rather than a dead feature.
   *
   * GitHub's search API allows ten requests a minute per IP unauthenticated
   * and far more with a token. One self-hosted user never notices; a
   * deployment with several users behind shared serverless egress will, and
   * the symptom is Trend Alerts quietly reporting Hacker News alone — a
   * degradation with no error attached, which is exactly the kind this file
   * exists to name before somebody has to diagnose it.
   */
  {
    name: "GitHub in Trend Alerts",
    vars: ["GITHUB_TOKEN"],
    without:
      "the repository scan runs unauthenticated at ten searches a minute per IP, so on a shared address Trend Alerts falls back to Hacker News alone",
  },
  {
    name: "Waitlist IP cooldown",
    vars: ["WAITLIST_IP_SALT"],
    without:
      "the salt falls back to BETTER_AUTH_SECRET, which works but couples two unrelated rotations",
  },
]

export type EnvironmentReport = {
  missing: Required[]
  /** Capabilities that are fully configured. */
  on: string[]
  /** Capabilities that are off, with the consequence spelled out. */
  off: { name: string; missing: string[]; without: string }[]
}

function absent(name: string) {
  return !process.env[name]?.trim()
}

/**
 * Reads the environment and says what it found. Pure apart from the read, so it
 * is testable without a server.
 */
export function checkEnvironment(): EnvironmentReport {
  const missing = REQUIRED.filter((r) => absent(r.name))

  const on: string[] = []
  const off: EnvironmentReport["off"] = []

  for (const capability of CAPABILITIES) {
    const gone = capability.vars.filter(absent)
    if (gone.length === 0) {
      on.push(capability.name)
    } else {
      off.push({
        name: capability.name,
        missing: gone,
        without: capability.without,
      })
    }
  }

  return { missing, on, off }
}

/**
 * The report as lines, ready for the console.
 *
 * Split from the printing so a test can assert the text without capturing
 * stdout, and so the same lines could later be answered by a health endpoint
 * without a second copy of the wording.
 */
export function describeEnvironment(report: EnvironmentReport): string[] {
  const lines: string[] = []

  for (const item of report.missing) {
    lines.push(`  MISSING  ${item.name} — ${item.why}`)
  }

  for (const item of report.off) {
    lines.push(`  off      ${item.name}: ${item.without}`)
    lines.push(`           set ${item.missing.join(", ")}`)
  }

  if (report.on.length > 0) {
    lines.push(`  on       ${report.on.join(", ")}`)
  }

  return lines
}
