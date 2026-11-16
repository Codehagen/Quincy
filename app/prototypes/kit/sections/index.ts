import type { Section } from "../doc"

import { components } from "./components"
import { controls } from "./controls"
import { foundations } from "./foundations"
import { landing } from "./landing"
import { patterns } from "./patterns"
import { workspace } from "./workspace"
import { showcase } from "./showcase"
import { quincyDrafts } from "./quincy-drafts"
import { quincyRiffs } from "./quincy-riffs"
import { uiSdk } from "./ui-sdk"
import { overlays } from "./overlays"

/**
 * The page, in order. Adding a part of the kit is appending here: write
 * `sections/<part>.tsx` exporting a `Section[]` with its TOC group, and
 * spread it below. The table
 * of contents and the page both read this one array.
 */
export const SECTIONS: readonly Section[] = [
  ...landing,
  ...foundations,
  ...components,
  ...controls,
  ...patterns,
  ...workspace,
  ...showcase,
  ...quincyDrafts,
  ...quincyRiffs,
  ...uiSdk,
  ...overlays,
]
