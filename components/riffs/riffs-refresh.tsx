"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

/**
 * Re-read the page while anything on it is still working.
 *
 * Without this the feature does not close its loop. /riffs is a server
 * component, a voice riff is written `working` and filled in by a workflow
 * minutes later, and nothing in the browser would ever learn that it finished
 * — somebody would record a thought, watch a skeleton, and have to reload the
 * page to find out it had been ready the whole time. The card would be
 * technically correct and practically useless.
 *
 * **Polling rather than a socket or a stream.** The thing being waited on
 * takes ten to twenty seconds and happens a handful of times a day per person.
 * A subscription would mean a connection held open all day for that, plus a
 * second delivery path for state the page already knows how to render. This is
 * `router.refresh()` on a timer, and the timer stops on its own.
 *
 * Renders nothing.
 */

/**
 * Every four seconds, and no faster.
 *
 * A refresh re-runs the page's queries — `getRiffs` is three selects — so this
 * is not free, and the wait it covers is ten to twenty seconds. Four is a
 * couple of polls per riff rather than a poll per second, and the difference
 * is invisible to somebody who has just put their phone away.
 */
const INTERVAL_MS = 4000

/**
 * Give up after five minutes.
 *
 * Slightly past `RIFF_STUCK_AFTER_MS`, deliberately: the poll has to outlive
 * the stuck threshold so the page can render the stuck message it has been
 * waiting for, and then stop. Without a ceiling a tab left open on a riff that
 * died would poll for as long as the laptop stayed awake — a background tab
 * quietly re-running queries all afternoon for a row that is never going to
 * change.
 */
const GIVE_UP_MS = 5 * 60 * 1000

export function RiffsRefresh({ active }: { active: boolean }) {
  const router = useRouter()

  React.useEffect(() => {
    if (!active) return

    const startedAt = Date.now()
    const id = setInterval(() => {
      /**
       * Not while the tab is hidden.
       *
       * A phone in a pocket with the tab backgrounded is the *normal* case for
       * this feature, and refreshing there spends battery and queries to
       * update pixels nobody is looking at. The `visibilitychange` listener
       * below catches up the moment they come back, which is the only moment
       * the answer matters.
       */
      if (document.visibilityState !== "visible") return

      if (Date.now() - startedAt > GIVE_UP_MS) {
        clearInterval(id)
        return
      }

      router.refresh()
    }, INTERVAL_MS)

    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh()
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [active, router])

  return null
}
