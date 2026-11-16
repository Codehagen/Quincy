import * as React from "react"

import type { Riff } from "@/lib/riffs"
import { SourceMark, Text, TextLink } from "@/components/kit"

export type ProvenanceMarkProps = {
  /** The four facts a riff carries about where it came from (`Riff`, lib/riffs.ts). */
  riff: Pick<Riff, "sourceId" | "sourceLabel" | "capturedAt" | "adaptedFrom">
  /**
   * A duration or a reference after the day: "4:12", "PR #418". Not on `Riff`
   * yet, so the caller passes it when it has it.
   */
  meta?: string
}

/**
 * Where a riff came from, on one muted line: the source, the day, and the
 * post someone else wrote that prompted it, when there was one. "Voice note ·
 * Today · 4:12", or "Pasted · Yesterday · From @maren's post".
 *
 * A borrowed idea is a fact for the moment of deciding (`Riff.adaptedFrom`),
 * so the link sits on the same line, not behind a click. It opens the
 * original in a new tab.
 */
export function ProvenanceMark({ riff, meta }: ProvenanceMarkProps) {
  return (
    <Text as="div" variant="small" tone="muted">
      <span className="flex min-w-0 flex-wrap items-center gap-x-kit-controls">
        <SourceMark id={riff.sourceId} label={riff.sourceLabel} when={riff.capturedAt} meta={meta} />
        {riff.adaptedFrom ? (
          <span>
            {"· From "}
            <TextLink href={riff.adaptedFrom.url} target="_blank" rel="noreferrer noopener">
              @{riff.adaptedFrom.handle}&apos;s post
            </TextLink>
          </span>
        ) : null}
      </span>
    </Text>
  )
}
