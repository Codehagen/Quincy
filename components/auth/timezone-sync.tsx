"use client"

import * as React from "react"

import { browserTimeZone } from "@/lib/timezone"
import { rememberTimeZone } from "@/app/(app)/actions"

/**
 * Reports this browser's timezone once, for an account that has none.
 *
 * Renders nothing. It exists because the fact only lives on the client and the
 * three groups who miss the signup form — Google sign-ups, accounts older than
 * the column, browsers that decline to answer — would otherwise have their
 * lineup drawn in UTC forever.
 *
 * The layout decides whether to mount this at all, by checking the session it
 * has already read. So the common case is not a skipped effect, it is no
 * component and no client bundle entry — this ships to the handful of people
 * who need it and to nobody else.
 *
 * The ref guard is for React's development double-invoke and for a re-render
 * mid-flight; the server action refuses a second write anyway, so the guard is
 * about not making the request rather than about correctness.
 */
export function TimeZoneSync() {
  const reported = React.useRef(false)

  React.useEffect(() => {
    if (reported.current) return
    reported.current = true

    const zone = browserTimeZone()
    if (!zone) return

    // Deliberately unawaited and deliberately silent. Nothing on screen depends
    // on the answer, the next render picks up the stored value, and a failure
    // here means the fallback stays in place for one more visit — which is
    // exactly the state this was already in.
    void rememberTimeZone(zone)
  }, [])

  return null
}
