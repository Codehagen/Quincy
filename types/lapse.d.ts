/**
 * Types for an optional dependency that is usually not installed.
 *
 * `@aiforui/lapse` is served from a private registry (see `.npmrc`), so it is
 * present only on a machine holding the token — and absent in CI, in any clone
 * of the public repository, and in the production build. Without these
 * declarations `tsc --noEmit` fails on the two dynamic imports in
 * components/lapse-panel.tsx with TS2307 for everybody in that majority, which
 * would make the typecheck gate report a broken repository rather than a
 * missing development tool.
 *
 * Ambient declarations for a package that *is* installed would normally be a
 * smell — a hand-written guess shadowing the real thing. Here it is checked
 * both ways: `tsc` passes with the package present and with it moved aside,
 * and the surface below is two symbols wide because that is all this repo
 * touches. If Lapse ever grows into something the product uses rather than
 * something a developer opens, this file should be deleted and the dependency
 * made real.
 */
declare module "@aiforui/lapse" {
  import type { ComponentType } from "react"

  /** The inspector panel. Rendered by components/lapse-panel.tsx. */
  export const Lapse: ComponentType
}

/** The clock patch. Imported for its side effect and nothing else. */
declare module "@aiforui/lapse/install" {}
