import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon } from "@hugeicons/core-free-icons"

import { Mono, Muted, Skeleton, SkeletonLines, Text } from "@/components/kit"

import { Bar, Pill } from "./bar"
import { Blob } from "./blob"
import { Frame } from "./frame"

/**
 * 11 · One sentence, on a dark ground. A reference's centred, very tight
 * hero, but the sentence is the bet from docs/vision.md and the subline is
 * its receipt. Under it, the product is the picture: a dark app window
 * where Quincy shows its work as a checked receipt and ends in one plain
 * sentence, "nothing sent". "Held for your read" is Quincy drafts, you
 * send, said by the product itself. Quincy appears as a small ink blob.
 * The one accent is the kit's green "this is fine": the checks only.
 */
const DONE = [
  { did: "Read your merged PR", what: "Ask about ideas that are ready" },
  { did: "Found", what: "3 ideas in it" },
  { did: "Drafted", what: "2 that sound like you, held for your read" },
  { did: "Checked", what: "the X one opens with the number" },
] as const

function Check() {
  return (
    <span aria-hidden className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-kit-success text-kit-success-on">
      <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2.6} />
    </span>
  )
}

export function OneSentence() {
  return (
    <Frame dark>
      <Bar />

      <div className="flex flex-col items-center pt-12 text-center">
        <h1 className="text-[70px] leading-[1.02] font-[570] tracking-[-0.055em] text-kit-ink">
          The feed reads the post,
          <br />
          not the poster.
        </h1>
        <p className="mt-5 max-w-[560px] text-[18px] leading-[27px] text-pretty text-kit-ink-muted">
          The same video went to a brand-new account and to his main one. The
          new account got 9.4 million views. The main one got 300,000.
        </p>
        <p className="mt-1.5 text-kit-small text-kit-ink-muted">Gary Vaynerchuk&apos;s numbers.</p>
        <div className="mt-7">
          <Pill>Ask for an invite</Pill>
        </div>
      </div>

      {/* The product as the picture: a whole window, cropped by the frame. */}
      <div className="absolute top-[468px] left-16 right-16 h-[480px] overflow-hidden rounded-[18px] bg-kit-object shadow-kit-object">
        <div className="flex h-10 items-center gap-1.5 border-b border-kit-hairline px-4">
          <span className="size-2.5 rounded-full bg-kit-chrome" />
          <span className="size-2.5 rounded-full bg-kit-chrome" />
          <span className="size-2.5 rounded-full bg-kit-chrome" />
        </div>
        <div className="grid h-full grid-cols-[200px_1fr_300px]">
          <aside className="flex flex-col gap-1 border-r border-kit-hairline p-3">
            <div className="mb-3 flex items-center gap-2.5 px-2 pt-1">
              <Blob size={24} />
              <Text as="span" weight="strong">Quincy</Text>
            </div>
            {["Studio", "Ideas", "Drafts", "Week", "Numbers"].map((n, i) => (
              <span
                key={n}
                className={`rounded-kit-chip px-2 py-1.5 ${i === 0 ? "bg-kit-well text-kit-ink" : "text-kit-ink-muted"}`}
              >
                {n}
              </span>
            ))}
          </aside>

          <div className="flex flex-col gap-5 px-8 pt-6">
            <div className="self-end rounded-kit-control bg-kit-well px-3.5 py-2.5">
              <Text>I merged the ideas fix. Anything in it?</Text>
            </div>
            <div className="flex gap-3">
              <Blob size={22} />
              <div className="flex flex-col gap-3">
                <ul className="flex flex-col gap-2" aria-label="What Quincy did">
                  {DONE.map((d) => (
                    <li key={d.did} className="flex items-center gap-2.5">
                      <Check />
                      <Text as="span">
                        {d.did} <Muted>→ {d.what}</Muted>
                      </Text>
                    </li>
                  ))}
                </ul>
                <Text>nothing sent. two drafts are waiting for you, the LinkedIn one first.</Text>
              </div>
            </div>
          </div>

          <aside className="flex flex-col gap-3 border-l border-kit-hairline p-5">
            <div className="flex items-center justify-between">
              <Text as="span" weight="strong">Held for your read</Text>
              <Mono>2 waiting</Mono>
            </div>
            <div className="rounded-kit-control bg-kit-well p-3.5">
              <Text weight="strong">Draft for LinkedIn</Text>
              <div className="mt-1">
                <Text variant="small" tone="muted">
                  Twelve ideas sat ready for a week. Nothing ever asked me about them.
                </Text>
              </div>
              <div className="mt-3">
                <SkeletonLines widths={["92%", "70%", "84%"]} />
              </div>
            </div>
            <div className="rounded-kit-control bg-kit-well p-3.5">
              <Text weight="strong">Draft for X</Text>
              <div className="mt-3">
                <Skeleton width="76%" />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </Frame>
  )
}
