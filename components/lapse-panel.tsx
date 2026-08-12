"use client"

import * as React from "react"

/*
 * Both imports below are dynamic and both sit behind a `process.env.NODE_ENV`
 * check, which the bundler folds to a constant and then drops the dead branch
 * with. That is load-bearing, not stylistic: a top-level `import
 * "@aiforui/lapse/install"` is a side-effect import, which no bundler will ever
 * tree-shake, so the static form ships all ~1.7 MB of Lapse to production even
 * when nothing renders it. Verified by grepping .next for `__lapseLogBuffer__`.
 */

// Fired at module evaluation rather than from the effect below, because this is
// the first client boundary the root layout renders — which is as early as the
// App Router lets anything patch the clock. Whatever still manages to read
// requestAnimationFrame/performance.now before this resolves (Remotion's player
// is the candidate here) keeps the real clock and won't slow down.
if (process.env.NODE_ENV !== "production") {
  void import("@aiforui/lapse/install")
}

/**
 * The Lapse animation inspector, mounted from the root layout in dev only.
 *
 * Renders the React `<Lapse>` rather than calling `mountLapse()`: the panel
 * entry bundles its own copy of React, and this app already has one. Both paths
 * drive the same shared engine either way.
 */
export function LapsePanel() {
  const [Panel, setPanel] = React.useState<React.ComponentType | null>(null)

  React.useEffect(() => {
    if (process.env.NODE_ENV === "production") return

    let cancelled = false
    void import("@aiforui/lapse").then((mod) => {
      if (!cancelled) {
        // Updater form: React would otherwise call a bare component value as
        // if it were a lazy initializer.
        setPanel(() => mod.Lapse)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  return Panel ? <Panel /> : null
}
