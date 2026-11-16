import { Card, FileChip, Highlight, LiveDot, MarginNote, Mono, Text } from "@/components/kit"
import { Perched } from "@/components/showcase/demos/perched"

import { Crop, Sheet } from "@/components/showcase/demos/crop"
import { Check, ExportChip, Frame, YouSaid } from "./pictures"
import { CUT_SECONDS, SOURCE, clock } from "./take"

/*
 * The page's smaller pictures, each a calmer version of a real Cuts surface
 * at its real type size, on the landing's grey stage, with the friend on its
 * top edge in the state that surface is in. Every one shows something
 * plans/031-video-page-facts.md lists as working today.
 */

const CUT = clock(CUT_SECONDS)

/* ── It reads it first ────────────────────────────────────────────────── */

const INGEST = [
  { done: true, label: "Editing copy made", meta: "1080 × 1920" },
  { done: true, label: "Waveform read", meta: "1:58" },
  { done: false, label: "Timestamping every word", meta: "" },
] as const

/** The upload while it ingests: two steps done, the transcript running. */
export function IngestPicture() {
  return (
    <Crop label={`${SOURCE}, 1.2 gigabytes, being read. Editing copy made, 1080 by 1920. Waveform read, 1:58. Timestamping every word, running now.`}>
      <div className="mx-auto max-w-[30rem]">
        <Perched state="reading" at="68%">
          <Sheet>
            <div className="flex flex-col gap-kit-group">
              <div className="w-fit">
                <FileChip name={SOURCE} meta="1.2 GB" />
              </div>
              <div className="flex flex-col gap-2">
                {INGEST.map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-kit-related">
                    {row.done ? (
                      <span className="flex items-center gap-2.5">
                        <Check />
                        <span>{row.label}</span>
                      </span>
                    ) : (
                      <LiveDot pulse>{row.label}</LiveDot>
                    )}
                    {row.meta ? <Mono>{row.meta}</Mono> : null}
                  </div>
                ))}
              </div>
            </div>
          </Sheet>
        </Perched>
      </div>
    </Crop>
  )
}

const STEPS = [
  {
    title: "Drop a recording.",
    body: "One video or audio file, up to 5 GB. The same file twice only uploads once.",
  },
  {
    title: "It reads it first.",
    body: "An editing copy, a waveform, and every word with the moment it was said.",
  },
  {
    title: "Say the edit.",
    body: "Cut the pauses. Add captions. Punch in when I say sixty-eight. The timeline moves while Quincy works.",
  },
  {
    title: "Watch it, then export.",
    body: "Undo what you don’t like, or fix it by hand. Export renders an MP4 in your browser.",
  },
] as const

/** The four steps under the ingest picture, a row of four from a laptop up. */
export function Steps() {
  return (
    <ol className="mt-kit-picture grid gap-x-8 gap-y-8 text-left sm:grid-cols-2 lg:grid-cols-4">
      {STEPS.map((step, i) => (
        <li key={step.title} className="flex flex-col gap-kit-tight border-t border-kit-hairline pt-kit-related">
          <span className="font-kit-mono text-kit-mono text-kit-ink-muted tabular-nums">{i + 1}</span>
          <span className="font-kit-strong text-kit-ink">{step.title}</span>
          <span className="text-kit-ink-muted">{step.body}</span>
        </li>
      ))}
    </ol>
  )
}

/* ── The transcript is a second timeline ──────────────────────────────── */

const TRANSCRIPT = [
  { at: "0:02", words: "So we cut onboarding from nine screens to three.", selected: false },
  { at: "0:11", words: "Sorry, let me say that again, I lost it.", selected: true },
  { at: "0:19", words: "Six questions, gone. Sixty-eight percent finish signup now.", selected: false },
  { at: "0:31", words: "It was forty-one.", selected: false },
] as const

/** The transcript panel: one line selected, Delete and Zoom offered for it. */
export function TranscriptPicture() {
  return (
    <Crop label="The transcript of the take, line by line with times. The line at 0:11, Sorry, let me say that again, I lost it, is selected, with Delete and Zoom offered for the 9 selected words. A note beside it: select it, it’s cut.">
      <div className="mx-auto max-w-[calc(30rem+var(--spacing-kit-margin)+var(--spacing-kit-margin-gap))]">
        <Perched state="idle" at="44%">
          <div className="-mb-kit-bleed">
            <Card width="with-margin">
              <div className="flex flex-col gap-kit-related pb-14">
                <div className="flex items-center justify-between gap-kit-related">
                  <Text weight="strong">Transcript</Text>
                  <span className="flex items-center gap-kit-controls">
                    <Mono>9 words</Mono>
                    <span className="inline-flex h-8 items-center rounded-kit-control-inner bg-kit-control px-3 text-kit-small font-kit-strong shadow-kit-control">
                      Zoom
                    </span>
                    <span className="inline-flex h-8 items-center rounded-kit-control-inner bg-kit-control px-3 text-kit-small font-kit-strong shadow-kit-control">
                      Delete
                    </span>
                  </span>
                </div>
                {TRANSCRIPT.map((line) => {
                  const row = (
                    <div className="grid grid-cols-[2.75rem_1fr] gap-2">
                      <Mono>{line.at}</Mono>
                      <span className={line.selected ? "" : "text-kit-ink-muted"}>
                        {line.selected ? (
                          <span className="rounded-[3px] bg-kit-action-tint px-0.5 text-kit-ink [box-decoration-break:clone]">
                            {line.words}
                          </span>
                        ) : (
                          line.words
                        )}
                      </span>
                    </div>
                  )
                  return line.selected ? (
                    <MarginNote key={line.at} note="select it, it’s cut">
                      {row}
                    </MarginNote>
                  ) : (
                    <div key={line.at}>{row}</div>
                  )
                })}
              </div>
            </Card>
          </div>
        </Perched>
      </div>
    </Crop>
  )
}

/* ── It says when it did nothing ──────────────────────────────────────── */

/**
 * The tool's own answer when there is nothing to cut (lib/editor/tools.ts,
 * remove_silences): a tool that changed nothing says so, so the model never
 * tells the person their pauses are gone.
 */
export function NothingPicture() {
  return (
    <Crop label="In the editor chat you ask: Tighten it again. Quincy answers: There is no pause in this take long enough to cut. Nothing was changed. A note beside it: it says so.">
      <div className="mx-auto max-w-[calc(26rem+var(--spacing-kit-margin)+var(--spacing-kit-margin-gap))]">
        <Perched state="stuck" at="36%">
          <div className="-mb-kit-bleed">
            <Card width="with-margin">
              <div className="flex flex-col gap-kit-related pb-14">
                <YouSaid>Tighten it again.</YouSaid>
                <Text weight="strong">Quincy</Text>
                <MarginNote note="it says so" timing="after-highlight">
                  <span className="text-kit-ink-muted">
                    There is no pause in this take long enough to cut.{" "}
                    <span className="text-kit-ink">
                      <Highlight>Nothing was changed.</Highlight>
                    </span>
                  </span>
                </MarginNote>
              </div>
            </Card>
          </div>
        </Perched>
      </div>
    </Crop>
  )
}

/* ── Quincy cuts, you export ──────────────────────────────────────────── */

export function ExportPicture() {
  return (
    <div
      role="img"
      aria-label={`The finished cut, Onboarding update, ${CUT}, 9:16, captions on, waiting in the editor with Undo and Export. It renders in this tab.`}
      className="mx-auto w-full max-w-[37.5rem] pt-[3.25rem] text-left select-none"
    >
      <Perched state="waiting" size={64} at="74%">
        <div className="flex flex-col gap-kit-group rounded-kit-object bg-kit-object p-kit-pad shadow-kit-object sm:px-7 sm:pt-6 sm:pb-5">
          <div className="flex items-start gap-kit-group">
            <Frame width={72} caption="68%" punch />
            <div className="flex min-w-0 flex-col">
              <span className="font-kit-strong">Onboarding update</span>
              <Mono>
                {CUT} · 9:16 · captions on
              </Mono>
              <span className="mt-kit-related text-kit-ink-muted">
                Cut from {SOURCE}. It stays here until you export it.
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-kit-related border-t border-kit-hairline pt-kit-related">
            <Mono>MP4 · renders in this tab</Mono>
            <span className="flex flex-none items-center gap-kit-controls">
              <span className="inline-flex h-kit-control-md items-center rounded-kit-control px-3 font-kit-strong text-kit-ink-muted">
                Undo
              </span>
              <ExportChip />
            </span>
          </div>
        </div>
      </Perched>
    </div>
  )
}

/* ── Rows: what you say, what it does ─────────────────────────────────── */

export const EDITS = [
  {
    say: "“Cut the pauses.”",
    does: "Finds every pause longer than a third of a second from the word timings, cuts it out and closes the gap.",
  },
  {
    say: "“Add captions.”",
    does: "Builds them from the transcript, a word or a phrase at a time. They never appear on their own.",
  },
  {
    say: "“Make it vertical.”",
    does: "Switches the frame to 9:16, 16:9 or square and fits the picture inside. Ask it to fill the frame and it crops instead.",
  },
  {
    say: "“Punch in on that.”",
    does: "Pushes in on one clip for emphasis and eases back out. Nothing changes length.",
  },
  {
    say: "“Make it black and white.”",
    does: "Brightness, contrast, saturation, blur, colour shift, black and white, sepia and invert, on one clip or all of them.",
  },
  {
    say: "“Fade out at the end.”",
    does: "Fades a clip up at its start or down at its end. No cross-dissolves yet.",
  },
  {
    say: "“Delete clip three.”",
    does: "Splits and deletes clips, and closes the gap behind them.",
  },
] as const

export const NOT_YET = [
  {
    say: "Several takes in one cut",
    does: "One recording per cut for now. Picking the best take is not built.",
  },
  {
    say: "Music, b-roll and titles",
    does: "Not built. Quincy has no tool to add them.",
  },
  {
    say: "Posting the cut",
    does: `No channel takes video yet. You export the file and post it yourself.`,
  },
  {
    say: "Numbers for a cut",
    does: "Once a cut can be posted, it will be set against your own median, like every post. Never a follower count.",
  },
  {
    say: "Long recordings",
    does: "Reading a file has a five-minute limit. A long 4K take can run out of time.",
  },
] as const

export function Rows({
  rows,
  state,
  label,
}: {
  rows: readonly { say: string; does: string }[]
  state: "idle" | "resting"
  label: string
}) {
  return (
    <Perched state={state} at="calc(100% - 4.5rem)" className="mx-auto w-full max-w-[44rem] text-left">
      <ul aria-label={label} className="flex flex-col">
        {rows.map((r) => (
          <li
            key={r.say}
            className="grid gap-kit-tight border-t border-kit-hairline bg-kit-ground py-5 sm:grid-cols-[1fr_1.5fr] sm:gap-8"
          >
            <span className="text-base font-kit-strong text-kit-ink">{r.say}</span>
            <span className="text-kit-ink-muted">{r.does}</span>
          </li>
        ))}
      </ul>
    </Perched>
  )
}
