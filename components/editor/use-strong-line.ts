"use client"

import * as React from "react"

import type { TakeReading } from "@/lib/editor/reading"

import { networkFetch } from "./use-document"

/**
 * The reading with its strong line, asked for once per mount when the page
 * opened without one (plans/036, phase C). The server answers from its
 * cache, or makes the one call per asset it allows; a refusal (no plan, the
 * day's ceiling) leaves the reading as it was.
 */
export function useStrongLine(
  assetId: string | undefined,
  reading: TakeReading | null,
  fetcher: typeof fetch = networkFetch
): TakeReading | null {
  const [line, setLine] = React.useState<{ assetId: string; line: string } | null>(null)
  const asked = React.useRef<string | null>(null)

  const needs = Boolean(assetId && reading && reading.strongLine === null && reading.words > 0)

  React.useEffect(() => {
    if (!needs || !assetId || asked.current === assetId) return
    asked.current = assetId
    const replay =
      process.env.NODE_ENV !== "production" &&
      new URLSearchParams(window.location.search).get("replay") === "1"
    // Not aborted on cleanup: the request is asked once per asset, and a
    // remount (Strict Mode runs effects twice) must not cancel the only ask.
    void fetcher(`/api/editor/assets/${assetId}/strong-line${replay ? "?replay=1" : ""}`, {
      method: "POST",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { line?: string | null } | null) => {
        if (body?.line) setLine({ assetId, line: body.line })
      })
      .catch(() => {
        // Offline: the reading reads without it.
      })
  }, [needs, assetId, fetcher])

  if (!reading || reading.strongLine || !line || line.assetId !== assetId) return reading
  return { ...reading, strongLine: line.line }
}
