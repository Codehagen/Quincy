"use client"

import * as React from "react"

/*
 * Both imports below are dynamic and both sit behind conditions the bundler
 * folds to constants, which then lets it drop the dead branch. That is
 * load-bearing, not stylistic, and it is now carrying two different jobs.
 *
 * **`NODE_ENV`** keeps Lapse out of production. A top-level `import
 * "@aiforui/lapse/install"` is a side-effect import, which no bundler will ever
 * tree-shake, so the static form ships all ~1.7 MB of Lapse to production even
 * when nothing renders it. Verified by grepping .next for `__lapseLogBuffer__`.
 *
 * **`NEXT_PUBLIC_LAPSE`** keeps it optional. Lapse comes from a private
 * registry, so it is simply not installed for CI, for anyone who cloned the
 * public repository, or in the production build — and a bundler resolves a
 * dynamic import at build time, so a missing target is a build error rather
 * than something a `.catch()` could survive. next.config.ts asks whether the
 * package resolves and hands the answer down as a literal; when it is empty
 * this branch is gone before resolution is attempted, which is what lets
 * `pnpm dev` work on a machine that has never had the token.
 *
 * Types come from types/lapse.d.ts, so `tsc` agrees either way.
 */

// Fired at module evaluation rather than from the effect below, because this is
// the first client boundary the root layout renders — which is as early as the
// App Router lets anything patch the clock. Whatever still manages to read
// requestAnimationFrame/performance.now before this resolves (Remotion's player
// is the candidate here) keeps the real clock and won't slow down.
if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_LAPSE) {
  void import("@aiforui/lapse/install")
}

/**
 * The Lapse animation inspector, mounted from the root layout in dev only.
 *
 * Renders the React `<Lapse>` rather than calling `mountLapse()`: the panel
 * entry bundles its own copy of React, and this app already has one. Both paths
 * drive the same shared engine either way.
 *
 * Renders nothing at all when Lapse is not installed, which is the common case
 * for everybody but the machine that has the registry token. Nothing in the
 * product depends on it, so there is nothing to say about its absence — an
 * inspector that announces itself missing would be noise on every page load of
 * every clone.
 */
export function LapsePanel() {
  const [Panel, setPanel] = React.useState<React.ComponentType | null>(null)

  React.useEffect(() => {
    if (process.env.NODE_ENV === "production") return
    if (!process.env.NEXT_PUBLIC_LAPSE) return

    let cancelled = false
    void import("@aiforui/lapse")
      .then((mod) => {
        if (!cancelled) {
          // Updater form: React would otherwise call a bare component value as
          // if it were a lazy initializer.
          setPanel(() => mod.Lapse)
        }
      })
      // Belt to the braces above. The condition should already have made this
      // unreachable when the package is absent; if the two ever disagree, a
      // dev tool must not take the page down with it.
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  return Panel ? <Panel /> : null
}
