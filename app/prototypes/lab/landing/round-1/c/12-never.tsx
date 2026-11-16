"use client"

import { Button, Card, Mono, Muted, Stage, Text } from "@/components/kit"

import { Bar, Pill } from "./bar"
import { Blob } from "./blob"
import { Frame } from "./frame"

/**
 * 12 · What Quincy will never do. A reference's two-beat headline, centred
 * and tight, but the two beats are the product's promise: "Quincy drafts.
 * You send." Under it, where a reference lists one-line quotes, Quincy
 * lists its refusals, one line each, and one of them is settled by a
 * receipt (70,000 against 6.3 million). The proof sits beside the list: a
 * draft that has gone nowhere, with Approve in blue. That button is the
 * one accent, because it is the promise made into a control.
 */
const NEVER = [
  { no: "Post without you.", why: "Every draft waits for Approve." },
  {
    no: "Paste one post everywhere.",
    why: "Four versions of one message: three averaged 70,000 views, one did 6.3 million.",
  },
  { no: "Run a thousand faceless accounts.", why: "That rents attention you never own." },
  { no: "Show you a follower chart.", why: "Every number is against your own median." },
  { no: "Build you a dashboard.", why: "You see each post and where it is now." },
] as const

export function Never() {
  return (
    <Frame>
      <Bar />

      <div className="flex flex-col items-center pt-14 text-center">
        <h1 className="text-[72px] leading-[1.02] font-[580] tracking-[-0.058em] text-kit-ink">
          Quincy drafts. You send.
        </h1>
        <p className="mt-5 max-w-[520px] text-[18px] leading-[27px] text-pretty text-kit-ink-muted">
          It writes in your voice and publishes in your name, so nothing goes
          out until you say so.
        </p>
        <div className="mt-7">
          <Pill>Ask for an invite</Pill>
        </div>
      </div>

      <div className="mt-16 grid grid-cols-[1fr_420px] gap-14 px-16">
        <div>
          <Text weight="strong" tone="muted">What Quincy will never do</Text>
          <ol className="mt-3 flex flex-col">
            {NEVER.map((item, i) => (
              <li
                key={item.no}
                className="grid grid-cols-[40px_1fr] items-baseline border-t border-kit-hairline py-3.5"
              >
                <Mono>{String(i + 1).padStart(2, "0")}</Mono>
                <p className="text-[20px] leading-[28px] font-[560] tracking-[-0.02em] text-pretty text-kit-ink">
                  {item.no}{" "}
                  <span className="text-[15px] leading-[22px] font-[460] tracking-[-0.006em] text-kit-ink-muted">
                    {item.why}
                  </span>
                </p>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-kit-small text-kit-ink-muted">
            The 70,000 and 6.3 million are Gary Vaynerchuk&apos;s numbers.
          </p>
        </div>

        <Stage>
          <Card crop="bottom">
            <div className="flex items-center gap-2.5">
              <Blob size={22} />
              <Text as="span" weight="strong">Draft for LinkedIn</Text>
              <span className="ml-auto">
                <Mono>Not sent</Mono>
              </span>
            </div>
            <div className="mt-3 flex flex-col gap-3">
              <Text>I stopped pasting the same post to every channel.</Text>
              <Text>
                The LinkedIn one opens with the number. The X one opens with
                the question. <Muted>Same idea.</Muted>
              </Text>
            </div>
            <div className="mt-4 flex gap-1.5">
              <Button variant="action">Approve</Button>
              <Button>Edit</Button>
            </div>
            <div className="h-28" />
          </Card>
        </Stage>
      </div>
    </Frame>
  )
}
