"use client"

/*
 * 10 — The chat fills the hero, and Quincy's reply is the headline.
 *
 * The screen: Studio, the chat that is Quincy's main surface. No window
 * chrome and no margin around it: the app runs off the top, the left and the
 * right of the frame, so the hero is the product rather than a picture of
 * it. The person has typed what happened; Quincy highlights the one sentence
 * that is the post, and its answer is set at headline size. The highlighter
 * is the one accent. The pointer rests on "Draft it", the next press.
 *
 * From a reference: personality through a character (a small blob with two
 * dot eyes) and a two-beat section headline. Pushed into Quincy's: one
 * character, because Quincy is one editor, not a crew of bots, drawn in ink
 * so it never takes the accent.
 */

import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUp02Icon, Mic01Icon } from "@hugeicons/core-free-icons"

import { Highlight } from "@/components/kit"

import { Blob, Frame, InviteButton, Pointer } from "./frame"

export function TheChatIsThePage() {
  return (
    <Frame>
      {/* The app, bleeding off three edges. */}
      <div className="absolute top-0 right-0 left-0 h-[620px] bg-kit-object">
        <nav className="absolute top-0 bottom-0 left-0 flex w-[208px] flex-col gap-1 border-r border-kit-hairline px-4 pt-7">
          <span className="mb-5 flex items-center gap-2 px-2.5 text-[15px] font-kit-strong">
            <Blob size={22} />
            Quincy
          </span>
          {["Studio", "Ideas", "Lineup", "Numbers", "Brain"].map((n) => (
            <span
              key={n}
              data-on={n === "Studio" || undefined}
              className="rounded-kit-control-inner px-2.5 py-1.5 text-kit-ink-muted data-on:bg-kit-control-hover data-on:font-kit-strong data-on:text-kit-ink"
            >
              {n}
            </span>
          ))}
        </nav>

        <div className="absolute top-0 right-0 bottom-0 left-[208px]">
          <div className="mx-auto flex h-full w-[720px] flex-col pt-14">
            {/* What the person typed. */}
            <div className="self-end text-kit-small text-kit-ink-muted">You · 16:10</div>
            <div className="mt-1.5 max-w-[470px] self-end rounded-kit-object bg-kit-well px-4 py-3 text-[15px] leading-[23px] text-pretty">
              We merged the new signup form today, nine fields down to three.{" "}
              <Highlight>Finished signups went from 41% to 68% in a week.</Highlight>
            </div>

            {/* Quincy's answer, at headline size. */}
            <div className="mt-12 flex items-center gap-2 text-kit-small text-kit-ink-muted">
              <Blob size={28} />
              Quincy
            </div>
            <h1 className="mt-2 max-w-[700px] text-[40px] leading-[46px] font-kit-strong tracking-[-0.03em] text-balance">
              The sentence I marked is the post. Want it on LinkedIn, Thursday at 08:00?
            </h1>
            <p className="mt-4 max-w-[520px] text-[16px] leading-[25px] text-kit-ink-muted text-pretty">
              I’ll write it in your voice, in three beats, with 68% on its own
              line. It waits for you before it goes anywhere.
            </p>
            <div className="relative mt-6 flex gap-2">
              <button
                type="button"
                className="h-10 rounded-kit-control bg-kit-control px-4 font-kit-strong shadow-kit-control transition-[background-color] duration-(--kit-duration-press) hover:bg-kit-control-hover motion-reduce:transition-none"
              >
                Draft it
              </button>
              <button
                type="button"
                className="h-10 rounded-kit-control bg-kit-control px-4 text-kit-ink-muted shadow-kit-control transition-[background-color] duration-(--kit-duration-press) hover:bg-kit-control-hover motion-reduce:transition-none"
              >
                Not this one
              </button>
              <Pointer style={{ left: 52, top: 22 }} />
            </div>

            {/* The composer, at the hero's bottom edge. */}
            <div className="mt-auto mb-7 flex items-center gap-3 rounded-kit-object bg-kit-object px-4 py-3 shadow-kit-object">
              <span className="flex-1 text-kit-ink-muted">Tell Quincy what happened</span>
              <HugeiconsIcon icon={Mic01Icon} size={18} className="text-kit-ink-muted" aria-hidden />
              <span className="grid size-8 place-items-center rounded-full bg-kit-ink text-kit-object">
                <HugeiconsIcon icon={ArrowUp02Icon} size={16} strokeWidth={2} aria-hidden />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* First section: what it will not do, under one line of facts. */}
      <section className="absolute inset-x-16 top-[620px] bottom-0 border-t border-kit-hairline pt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-[20px] leading-[26px] font-kit-strong tracking-[-0.015em]">
            You talk. It drafts.
          </h2>
          <div className="flex items-center gap-5">
            <span className="text-kit-ink-muted">$49 a month · X and LinkedIn</span>
            <InviteButton />
          </div>
        </div>
        <ul className="mt-9 grid grid-cols-3 gap-12">
          {[
            ["It does not post without you.", "Every draft waits. You approve it, or it stays a draft."],
            ["It does not count followers.", "The feed judges each post, so each post is measured against your own median."],
            ["It does not run accounts for you.", "One person, one voice. No second accounts posting in your name."],
          ].map(([t, b]) => (
            <li key={t}>
              <div className="font-kit-strong">{t}</div>
              <p className="mt-1.5 text-kit-ink-muted text-pretty">{b}</p>
            </li>
          ))}
        </ul>
      </section>
    </Frame>
  )
}
