import { redirect } from "next/navigation"

import { getGithubSetup, getCirclebackSetup } from "@/app/(app)/sources/actions"
import { corpusSummary } from "@/lib/corpus-x"
import {
  firstNameOf,
  latestRiffScrap,
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
  const interview = await readInterview(userId, await latestRiffScrap(userId))

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
        const [state, corpus, circleback, github] = await Promise.all([
          readWiring(userId),
          corpusSummary(userId),
          getCirclebackSetup(),
          getGithubSetup(),
        ])

        return {
          wiring: state,
          corpusItems: corpus.items,
          circlebackConnected: circleback?.verified === true,
          // The row, not the fixture. `getSourceConnections` once merged demo
          // fixtures for an allowlist of addresses, and reading one here made
          // Install unreachable for exactly the accounts that would install
          // first. The fixtures are gone; reading the row is the habit.
          githubConnected: github?.connected === true,
          // Out to github.com, so it survives first run's redirect gate. Null
          // when the deployment has no App configured, which renders as a
          // description rather than a dead button.
          githubInstallUrl: github?.installUrl ?? null,
        }
      })()

  return (
    <FirstRun
      firstName={firstNameOf(session.user.name)}
      answered={interview.answered}
      next={interview.next}
      wiring={wiring}
    />
  )
}
