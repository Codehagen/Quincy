import * as React from "react"

const NEVER_CHANGES = () => () => {}

function isApple() {
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string }
  }
  const platform = nav.userAgentData?.platform || nav.platform || ""
  return /mac|iphone|ipad|ipod/i.test(platform)
}

/**
 * The modifier to SHOW in a hint: "⌘" on Apple platforms, "Ctrl" elsewhere.
 * The server and the hydration pass both say "Ctrl", so markup agrees; the
 * real platform is read after mount. Handlers must still accept both
 * `metaKey` and `ctrlKey` — only the hint has to choose (AGENTS.md).
 */
export function useModKey(): "⌘" | "Ctrl" {
  const apple = React.useSyncExternalStore(NEVER_CHANGES, isApple, () => false)
  return apple ? "⌘" : "Ctrl"
}
