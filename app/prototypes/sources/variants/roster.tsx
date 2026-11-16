import { KitPage } from "@/components/kit"
import { SourcesStages } from "@/components/sources/sources-stages"

import {
  MOCK_CONNECTIONS,
  MOCK_GITHUB_FRESH,
  MOCK_GITHUB_SETUP,
  MOCK_QUESTION,
} from "../data"

/**
 * Roster, with connections.
 *
 * Mounts the **production** body (`SourcesStages`), not a copy of it, against
 * mock states, so what gets reviewed here is the component that ships. The
 * title is the page's own KitPage; only the data is fixture.
 *
 * `Roster` is the filled page: every live source connected, the register
 * showing each connection state, GitHub asking its one question, and the X
 * read-back. `FirstVisit` is the page before anything is connected, which is
 * what a new account sees.
 */
export function Roster() {
  return (
    <KitPage
      title="Sources"
      summary="Where your material comes in. Quincy reads nothing you have not connected."
    >
      <SourcesStages
        connections={{
          ...MOCK_CONNECTIONS,
          circleback: { state: "arriving", lastAt: "2 hours ago" },
          github: { state: "arriving", lastAt: "yesterday" },
        }}
        circlebackSetup={{
          url: "https://quincy.example/api/webhooks/circleback/c_9f2a1d",
          verified: true,
        }}
        githubSetup={MOCK_GITHUB_SETUP}
        question={MOCK_QUESTION}
        x={{ handle: "christerhagen", items: 214 }}
      />
    </KitPage>
  )
}

export function FirstVisit() {
  return (
    <KitPage
      title="Sources"
      summary="Where your material comes in. Quincy reads nothing you have not connected."
    >
      <SourcesStages
        connections={{}}
        circlebackSetup={null}
        githubSetup={MOCK_GITHUB_FRESH}
        question={null}
        x={null}
      />
    </KitPage>
  )
}
