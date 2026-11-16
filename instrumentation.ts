/**
 * Runs once when a server instance boots. Next calls `register()` itself.
 *
 * Its only job is to say what this deployment can do, at the one moment
 * somebody is watching — the deploy log — rather than at the first request
 * that needed the missing key. `lib/env.ts` holds the list and the reasoning.
 *
 * **It does not run during `next build`.** `lib/db.ts` is lazy on purpose so a
 * build with no credentials still succeeds, which is what lets Vercel build
 * without production secrets in scope; throwing here would take that back by
 * another route. `NEXT_PHASE` is how the two are told apart.
 */
import { checkEnvironment, describeEnvironment } from "./lib/env"

export async function register() {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return
  }

  const report = checkEnvironment()
  const lines = describeEnvironment(report)

  if (report.missing.length === 0 && report.off.length === 0) {
    console.log("Quincy: every capability configured.")
    return
  }

  console.log(`Quincy: environment\n${lines.join("\n")}`)

  /**
   * Missing *required* variables stop the server, and only here — after the
   * report has printed, so the log says which ones and why rather than
   * stopping with a bare stack.
   *
   * In development it stays a warning. A contributor cloning the repo to read
   * the code should not be met with a crash, and `pnpm dev` has a person in
   * front of it who can see the lines above; a production boot does not.
   */
  if (report.missing.length > 0 && process.env.NODE_ENV === "production") {
    throw new Error(
      `Refusing to start: ${report.missing.map((m) => m.name).join(", ")} ` +
        `${report.missing.length === 1 ? "is" : "are"} not set.`
    )
  }
}
