"use client"

/*
 * 08 — Marks on the transcript.
 *
 * The receipt written onto the words instead of listed beside them. What
 * the run removed is folded, not struck: the pauses become a grey chip that
 * says how long they were, the "um" goes faint. The strong line gets the
 * one highlight, and Quincy's one note sits in the margin beside it. Press
 * a folded chip to put it back. The accent is the highlighter's yellow.
 */

import type { ReactNode } from "react"
import { Download04Icon } from "@hugeicons/core-free-icons"

import { Button, Highlight, Text } from "@/components/kit"

import { CUT_SECONDS, SEGMENTS, fmt, toCut } from "../fixture"
import { EditorBar, Frame, HandBracket, Hand, Picture } from "../parts"

type Row =
  | { kind: "line"; id: string; at: number; body: ReactNode }
  | { kind: "gap"; id: string; text: string }

const seg = (id: string) => SEGMENTS.find((s) => s.id === id)!

const ROWS: Row[] = [
  {
    kind: "line",
    id: "s1",
    at: 0,
    body: (
      <>
        So, <span className="text-kit-ink-disabled">um,</span> {seg("s2").text}
      </>
    ),
  },
  { kind: "gap", id: "p1", text: "2.3 s pause, cut" },
  ...["s3", "s4"].map((id) => ({ kind: "line" as const, id, at: toCut(seg(id).at), body: seg(id).text })),
  { kind: "gap", id: "p2", text: "1.8 s pause, cut" },
  ...["s5", "s6", "hook", "s7", "s8"].map((id) => ({
    kind: "line" as const,
    id,
    at: toCut(seg(id).at),
    body: seg(id).text,
  })),
]

export function MarksOnTheTranscript() {
  return (
    <Frame>
      <EditorBar
        seconds={CUT_SECONDS}
        right={
          <Button variant="action" icon={Download04Icon}>
            Export
          </Button>
        }
      />
      <div className="flex gap-8 px-10 pt-7">
        <div className="flex flex-col gap-3">
          <Picture shape="9:16" width={180} punch caption="They were in the way." time={fmt(16.9)} />
          <Text variant="small" tone="muted">
            {fmt(CUT_SECONDS)} after revision 14
          </Text>
        </div>

        <div className="w-[470px] rounded-kit-object bg-kit-object px-6 py-5 shadow-kit-object">
          <div className="mb-3 flex items-baseline justify-between">
            <Text as="span" weight="strong">
              Transcript
            </Text>
            <span className="text-kit-meta text-kit-ink-muted">grey chips are cuts · press one to put it back</span>
          </div>
          <ol className="flex flex-col">
            {ROWS.map((r) =>
              r.kind === "gap" ? (
                <li key={r.id} className="flex py-1 pl-[52px]">
                  <span className="inline-flex h-6 items-center rounded-kit-chip bg-kit-well px-2 font-kit-mono text-kit-mono-sm text-kit-ink-muted tabular-nums">
                    {r.text}
                  </span>
                </li>
              ) : (
                <li key={r.id} className="relative flex gap-3 py-1.5">
                  <span className="w-10 shrink-0 pt-0.5 font-kit-mono text-kit-mono-sm text-kit-ink-muted tabular-nums">
                    {fmt(r.at)}
                  </span>
                  <span className="min-w-0">
                    {r.id === "hook" ? <Highlight>{r.body}</Highlight> : r.body}
                  </span>
                  {r.id === "hook" ? (
                    <span className="absolute top-0 bottom-0 left-[calc(100%+30px)] flex items-center gap-2">
                      <HandBracket height={44} tone="graphite" />
                      <Hand>this is the hook</Hand>
                    </span>
                  ) : null}
                </li>
              ),
            )}
          </ol>
        </div>
      </div>
    </Frame>
  )
}
