import { redirect } from "next/navigation"

import { getCirclebackSetup, getGithubSetup } from "@/app/(app)/sources/actions"
import { corpusSummary } from "@/lib/corpus-x"
import {
  corpusReceipt,
  firstNameOf,
  firstRiffSuggestions,
  humanAddition,
  latestRiffId,
  materialAsk,
  readInterview,
  readWiring,
} from "@/lib/onboarding"
import { getSession } from "@/lib/session"
import { constructMetadata } from "@/lib/metadata"
import { FirstRun } from "@/components/welcome/first-run"

/**
 * First run. See plans/022 — including its decision record, which absorbed the
 * two rounds of prototype exploration that chose this shape over five others
 * before that directory was deleted.
 *
 * Four questions in the Studio's own chat components, then one wiring screen:
 * channels above sources, in that order, with the corpus read hanging off the
 * X grant rather than sitting among the sources — one consent buys both, and
 * `lib/sources.ts` refuses to list channels as sources for exactly that
 * reason.
 *
 * Everything is read server-side on each render, and none of it is held in the
 * client. Connecting a channel leaves the site entirely, so component state
 * would be gone by the time the person comes back from the consent screen.
 */
export const metadata = constructMetadata({
  title: "Welcome",
  noIndex: true,
})

// The interview's progress is derived from rows written moments ago by a
// server action on this same page, so this page must never render from a
// cache. `force-dynamic` used to say that; with cacheComponents the session
// read below makes the page dynamic on its own, and the segment config is no
// longer allowed to say it twice.
//
// **`?connected=1` is deliberately not read here.** The flag is read in the
// client, in the one effect that acts on it, which is also the only place that
// can strip it from the URL afterwards.
//
// This route logs the cacheComponents "uncached data" error on every request,
// because `getSession` is uncached data outside a `<Suspense>` and has to stay
// that way. All three offered fixes cost something real — `"use cache"` on
// per-account reads that must never be cached, a `<Suspense>` whose fallback is
// the whole screen, or `instant = false` — and the error is noise rather than a
// fault: the page renders correctly in a real browser with it present. Left
// alone rather than silenced with a config nobody has watched a real first run
// through.

export default async function WelcomePage() {
  const session = await getSession()
  if (!session) {
    redirect("/login?next=/welcome")
  }

  /**
   * Somebody who has finished should not be able to walk back into first run
   * by typing the URL — the interview would re-ask questions whose answers are
   * already on their brain pages and overwrite them.
   *
   * The layout cannot do this one: it redirects *to* here, so the guard for
   * the opposite case has to live on the page itself.
   */
  if (session.user.onboardedAt) {
    redirect("/studio")
  }

  const userId = session.user.id
  const interview = await readInterview(userId)

  /**
   * The wiring is resolved only once the talking is done, and is handed to the
   * same component that owns the conversation rather than replacing it. Four
   * queries, concurrent — the two source setups are the server actions
   * /sources uses, reused rather than reimplemented, so the two pages cannot
   * disagree about what is connected.
   */
  const wiring = interview.next
    ? null
    : await (async () => {
        const [state, corpus, github, circleback, receipt, suggestions, riffId] =
          await Promise.all([
            readWiring(userId),
            corpusSummary(userId),
            getGithubSetup(),
            getCirclebackSetup(),
            /**
             * What a previous read learned, so a return visit shows the portrait
             * instead of offering to read a timeline it has already paid for.
             * Null on a first arrival, and null for a corpus too thin to compile.
             */
            corpusReceipt(userId),
            // The angles the material ask paid for, read back rather than asked
            // for again.
            firstRiffSuggestions(userId),
            // Whether the material has been given. A riff is the only thing
            // that answer writes, so its existence is the state.
            latestRiffId(userId),
          ])

        return {
          wiring: state,
          corpusItems: corpus.items,
          receipt,
          suggestions,
          hasMaterial: riffId !== null,
          /**
           * Named by the read where there is one, plain where there is not.
           * Computed here because it reads the receipt, and the client bundle
           * must not import the module that produces it.
           */
          materialAsk: materialAsk(receipt),
          // Computed here, not in the client component: `humanAddition` lives
          // in a module that imports `db`.
          addition: humanAddition(receipt),
          // The row, not the fixture. `getSourceConnections` once merged demo
          // fixtures for an allowlist of addresses, and reading one here made
          // Install unreachable for exactly the accounts that would install
          // first. The fixtures are gone; reading the row is the habit.
          githubConnected: github?.connected === true,
          // Out to github.com, so it survives first run's redirect gate. Null
          // when the deployment has no App configured, which renders as a
          // description rather than a dead button.
          githubInstallUrl: github?.installUrl ?? null,
          // Described rather than offered in first run, but the row still has
          // to tell the truth about whether it is already set up.
          circlebackConnected: circleback?.verified === true,
        }
      })()

  return (
    <FirstRun
      firstName={firstNameOf(session.user.name)}
      answered={interview.answered}
      next={interview.next}
      // The rail reads the receipt out of this, so it grows when the read
      // lands rather than needing a prop of its own.
      wiring={wiring}
    />
  )
}
