"use client"

import * as React from "react"

import { KitRoot } from "@/components/kit"
import { ARRIVAL_TOTAL_MS } from "@/components/editor/arrival/passes"
import { Studio } from "@/components/editor/studio"

import { loadLocalTake, mockDocument, MOCK_PROJECT_ID, MOCK_REVISION, TRACKED_TAKE, type MockTake } from "./fixture"
import { liveTransport, prepare, scenarios, type Prepared, type ScenarioId } from "./scenarios"
import { mockFetch, mockServer, serverTransport } from "./server"
import { RECORD_STYLE, readRecordMode, type CutsMockRecorder } from "./record-mode"
import { applyTune, DEFAULT_TUNE, TunePanel, tuneNow } from "./tune"
import "./mock.css"

/*
 * The real editor on a fixture take, with the network replaced by the page
 * (server.ts) and the cutting run played from a recording of the real tools
 * (scenarios.ts). The chrome in the corner picks a scenario, replays it, and
 * tunes the cursor; none of it is the design being judged.
 *
 * Replay remounts the editor under a new key: the project is the fixture
 * again, and unmounting is what cancels every pending timer of the cursor
 * (plans/036, "Nothing stacks").
 */

/**
 * Auto-send waits this long after the starters land, so the person sees
 * them before the prompt replaces them (owner, phase H). It also covers the
 * lanes being measured before the cursor aims at them (700ms).
 */
const READ_STARTERS_MS = 1500

/** With the scan on, the starters land when it settles: typing earlier would skip it. */
const SCANNED_MS = ARRIVAL_TOTAL_MS + READ_STARTERS_MS

/** Stop mid-run presses Stop after this many presses, unless changed. */
const STOP_AFTER = 3

/** The URL does not change under the page, so there is nothing to subscribe to. */
const noSubscribe = () => () => {}

export function CutsMock() {
  const [scenario, setScenario] = React.useState<ScenarioId>("tighten")
  const [round, setRound] = React.useState(0)
  const [prepared, setPrepared] = React.useState<{ key: string; value: Prepared } | null>(null)
  // The owner's local take when its manifest is served, the tracked one otherwise.
  const [take, setTakeSource] = React.useState<MockTake | null>(null)
  const wrapper = React.useRef<HTMLDivElement>(null)
  const picker = React.useRef<HTMLSelectElement>(null)
  const stopAfter = React.useRef(STOP_AFTER)
  const key = `${take?.source}:${scenario}:${round}`
  // ?record=1: a frame-stepped film drives the page (record-mode.ts). Read
  // after mount, so the server's markup and the first client render agree.
  const record = React.useSyncExternalStore(noSubscribe, readRecordMode, () => false)

  React.useEffect(() => {
    if (record) tuneNow.current = { ...DEFAULT_TUNE, autoSend: false }
  }, [record])

  React.useEffect(() => {
    const abort = new AbortController()
    void loadLocalTake(abort.signal).then((local) => {
      if (!abort.signal.aborted) setTakeSource(local ?? TRACKED_TAKE)
    })
    return () => abort.abort()
  }, [])

  React.useEffect(() => {
    if (!take) return
    let live = true
    // Built here, in the browser: the fixture's ids are random and its dates
    // are now, so it never renders on the server.
    void prepare(scenario, mockDocument(take), take.words, take.strongLine, take.asset).then((value) => {
      if (live) setPrepared({ key, value })
    })
    return () => {
      live = false
    }
  }, [scenario, key, take])

  const ready = prepared?.key === key ? prepared.value : null

  // One server per mount: the fixture again on every Replay.
  const harness = React.useMemo(() => {
    if (!ready || !take) return null
    const server = mockServer(ready.document, MOCK_REVISION)
    return {
      transport: serverTransport(
        server,
        liveTransport(() => server.document, take.words, take.strongLine, () => tuneNow.current.pace)
      ),
      fetch: mockFetch(server, take.words, take.strongLine),
      // The harness replays the arrival on every Replay; the product plays it once per take.
      arrival: tuneNow.current.scan ? ("always" as const) : ("never" as const),
    }
  }, [ready, take])

  // Mounted: tune the fresh desk, then ask, the way a person would.
  React.useEffect(() => {
    const root = wrapper.current
    if (!ready || !root) return
    applyTune(tuneNow.current, root)
    const timers: number[] = []
    let observer: MutationObserver | null = null

    // Auto-send off: nothing is sent until the person picks or types.
    if (tuneNow.current.autoSend) timers.push(
      window.setTimeout(() => {
        const box = root.querySelector<HTMLTextAreaElement>(".cuts-shadcn textarea")
        if (!box) return
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(box, ready.prompt)
        box.dispatchEvent(new Event("input", { bubbles: true }))
        timers.push(window.setTimeout(() => box.form?.requestSubmit(), 50))
      }, tuneNow.current.scan && !tuneNow.current.reduced ? SCANNED_MS : READ_STARTERS_MS)
    )

    // Stop mid-run: press Stop after N presses of the cursor, as a person would.
    if (scenario === "stop") {
      let presses = 0
      observer = new MutationObserver((records) => {
        for (const r of records) {
          const node = r.target as HTMLElement
          // Count the attribute being added (no old value), the lead cursor only.
          if (r.oldValue === null && !node.hasAttribute("data-support")) {
            presses++
            if (presses === stopAfter.current) {
              root.querySelector<HTMLButtonElement>('.cuts-shadcn button[aria-label="Stop"]')?.click()
            }
          }
        }
      })
      observer.observe(root, { attributes: true, attributeOldValue: true, subtree: true, attributeFilter: ["data-tap"] })
    }

    return () => {
      timers.forEach(window.clearTimeout)
      observer?.disconnect()
    }
  }, [ready, scenario])

  // A reload can restore the picker's last value over React's default, so it
  // showed one scenario while another loaded. The DOM follows the state.
  React.useEffect(() => {
    if (picker.current && picker.current.value !== scenario) picker.current.value = scenario
  }, [scenario])

  const replay = React.useCallback(() => setRound((n) => n + 1), [])

  // The film's handle: reset to a scenario (scan on or off) and read when the
  // fresh editor is on screen. Never installed outside ?record=1.
  React.useEffect(() => {
    if (!record) return
    const api: CutsMockRecorder = {
      mounted: null,
      reset(next, options) {
        tuneNow.current = { ...tuneNow.current, scan: options?.scan ?? true, pace: options?.pace ?? tuneNow.current.pace }
        api.mounted = null
        setScenario(next)
        setRound((n) => n + 1)
      },
    }
    window.__cutsMock = api
    return () => {
      delete window.__cutsMock
    }
  }, [record])

  React.useEffect(() => {
    if (record && ready && harness && window.__cutsMock) window.__cutsMock.mounted = key
  }, [record, ready, harness, key])

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "r" && event.key !== "R") return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target instanceof HTMLElement ? event.target : null
      if (target?.closest("input, textarea, select, [contenteditable]")) return
      replay()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [replay])

  return (
    <KitRoot>
      <div ref={wrapper} className="cuts-mock h-dvh">
        {ready && harness && take ? (
          <Studio
            key={key}
            projectId={MOCK_PROJECT_ID}
            document={ready.document}
            revision={MOCK_REVISION}
            media={take.media}
            harness={harness}
          />
        ) : null}
      </div>

      {record ? <style>{RECORD_STYLE}</style> : null}

      {/* In the top bar's empty stretch, left of the frame menu: clear of the
          breadcrumb (at 1280 wide too, hence the narrow picker), the undo
          pair and the margin's Stop. */}
      {record ? null : (
        <div className="fixed top-1.5 right-[calc(50%+116px)] z-[60] flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-2 rounded-md bg-white/95 p-2 font-mono text-[11px] text-neutral-800 shadow ring-1 ring-neutral-300 dark:bg-neutral-900/95 dark:text-neutral-100 dark:ring-neutral-700">
            <label className="flex items-center gap-1">
              <span className="sr-only">Scenario</span>
              <select
                ref={picker}
                autoComplete="off"
                value={scenario}
                onChange={(e) => setScenario(e.currentTarget.value as ScenarioId)}
                className="w-[148px] truncate rounded border border-neutral-300 bg-transparent px-1 py-0.5"
              >
                {scenarios((take ?? TRACKED_TAKE).asset).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            {scenario === "stop" ? (
              <label className="flex items-center gap-1">
                <span>after</span>
                <input
                  type="number"
                  autoComplete="off"
                  min={1}
                  max={9}
                  defaultValue={STOP_AFTER}
                  onChange={(e) => {
                    stopAfter.current = Number(e.currentTarget.value) || 1
                  }}
                  className="w-9 rounded border border-neutral-300 bg-transparent px-1 py-0.5 tabular-nums"
                />
              </label>
            ) : null}
            <button
              type="button"
              onClick={replay}
              aria-keyshortcuts="R"
              className="rounded border border-neutral-300 px-2 py-0.5"
            >
              Replay · R
            </button>
            <span className="text-neutral-500" title="public/prototypes/cuts-mock/local/ is used when it exists">
              {take?.source === "local" ? "local" : "studio"}
            </span>
          </div>
          <TunePanel wrapper={() => wrapper.current} />
        </div>
      )}
    </KitRoot>
  )
}
