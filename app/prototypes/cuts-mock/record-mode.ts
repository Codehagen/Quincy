import type { ModelPace } from "@/lib/editor/pace"

import type { ScenarioId } from "./scenarios"

/*
 * ?record=1: the mock as a film set. A frame-stepped render (outside the
 * repo) drives the page: the harness chrome and the dev badge are hidden,
 * auto-send is off so the film's pointer presses the real suggestions, and
 * `window.__cutsMock` resets to a scenario. Harness only; nothing in
 * components/editor reads any of it.
 */

export type CutsMockRecorder = {
  /** The key of the editor on screen once a reset has mounted it; null while it loads. */
  mounted: string | null
  /** Remount on the fixture under a scenario; `scan: false` opens settled. */
  reset: (scenario: ScenarioId, options?: { scan?: boolean; pace?: ModelPace }) => void
}

declare global {
  interface Window {
    __cutsMock?: CutsMockRecorder
  }
}

export function readRecordMode(): boolean {
  return new URLSearchParams(window.location.search).get("record") === "1"
}

/** The Next dev badge and the dev time tool sit over the desk's corners; a film shows neither. */
export const RECORD_STYLE = "nextjs-portal,[data-lapse-panel]{display:none!important}"
