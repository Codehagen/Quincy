import { Canvas } from "./canvas"
import { Cta, PenLine, TopLine } from "./marks"

/**
 * One mark only. The hero is the person's own sentence, set as large as a
 * headline, with a single blue pen line under the part Quincy would post.
 * The product's own headline is small and sits under the quote, because
 * the quote is the argument.
 */
export default function OneLine() {
  return (
    <Canvas>
      <TopLine />

      <figure className="absolute top-[150px] left-16 w-[1060px]">
        <blockquote className="text-[66px] leading-[1.1] font-[600] tracking-[-0.04em] text-kit-ink">
          <span className="text-kit-ink-muted">
            &ldquo;We cut the onboarding email down to one question.
          </span>{" "}
          <PenLine>Thirty-one people wrote back.</PenLine>
          <span className="text-kit-ink-muted">&rdquo;</span>
        </blockquote>
        <figcaption className="mt-8 font-kit-mono text-[13px] text-kit-ink-muted">
          from a voice note, Tuesday, 2 min 14 s
        </figcaption>
      </figure>

      <div className="absolute top-[470px] left-16 flex w-[1060px] items-end justify-between gap-16 border-t border-kit-hairline pt-8">
        <div>
          <h1 className="text-[26px] leading-[1.25] font-[600] tracking-[-0.02em]">
            Quincy finds the line worth posting in what you already said.
          </h1>
          <p className="mt-3 max-w-[60ch] text-[17px] leading-[1.5] text-kit-ink-muted">
            Then it drafts the post in your voice for X and LinkedIn, and waits
            for you to send it.
          </p>
        </div>
        <Cta tone="action">Join the waitlist</Cta>
      </div>

      {/* The first section: what happened, against your own median. */}
      <section className="absolute inset-x-0 top-[660px] bottom-0 bg-kit-stage px-16 pt-10">
        <div className="grid grid-cols-[340px_1fr] gap-16">
          <div>
            <h2 className="text-[22px] font-[600] tracking-[-0.02em]">After it goes out</h2>
            <p className="mt-2 text-[16px] leading-[1.5] text-kit-ink-muted">
              Every number is against your own posts. No follower counts.
            </p>
          </div>
          <ul className="flex flex-col text-[16px]">
            {[
              ["Thu 09:10", "I cut our onboarding email down to one question.", "14 replies.", "Your median is 3."],
              ["Mon 08:30", "I stopped writing release notes nobody read.", "5 replies.", "Your median is 3."],
              ["Wed 12:05", "We tried a waitlist with no landing page.", "2 replies.", "Your median is 3."],
            ].map(([t, line, n, m]) => (
              <li key={t} className="grid grid-cols-[96px_1fr_auto] items-baseline gap-6 border-b border-kit-hairline py-3 last:border-b-0">
                <span className="font-kit-mono text-[12px] text-kit-ink-muted">{t}</span>
                <span className="truncate">{line}</span>
                <span className="tabular-nums">
                  <span className="font-[600]">{n}</span>{" "}
                  <span className="text-kit-ink-muted">{m}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </Canvas>
  )
}
