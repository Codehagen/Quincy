import { Canvas } from "./canvas"
import { aInstrument, aNewsreader } from "./fonts"
import { Cta, Margin, TopLine } from "./marks"

/**
 * A galley proof. The headline is set in a display serif, centred over the
 * page like a magazine's, because the page below is an editor's: what you
 * said on the left in your own italic, what Quincy drafted on the right in
 * plain type, the three beats named in blue pen between them.
 */
export default function TheProof() {
  return (
    <Canvas>
      <TopLine />

      <div className="absolute inset-x-0 top-[104px] text-center">
        <h1
          className={`${aInstrument.className} text-[88px] leading-[1] tracking-[-0.02em]`}
        >
          You talk. Quincy drafts. <em className="italic">You send.</em>
        </h1>
        <p className="mx-auto mt-5 max-w-[52ch] text-[17px] leading-[1.5] text-kit-ink-muted">
          Give it a voice note, a merged pull request or a page of notes. It
          writes the post in your voice and waits for you.
        </p>
      </div>

      <div className="absolute top-[330px] left-16 grid w-[1068px] grid-cols-[1fr_1fr] gap-[200px]">
        <div>
          <p className="font-kit-mono text-[12px] text-kit-ink-muted">what you said, Tuesday</p>
          <div
            className={`${aNewsreader.className} mt-3 flex flex-col gap-3 text-[21px] leading-[1.45] italic text-kit-ink`}
          >
            <p>so we moved the annual toggle above the plans, that&apos;s all, same prices</p>
            <p>and annual went from nine last month to twenty-three this month</p>
            <p>I think nobody wanted annual less, they just never saw it</p>
          </div>
        </div>
        <div>
          <p className="font-kit-mono text-[12px] text-kit-ink-muted">what Quincy drafted, for X</p>
          <div className="mt-3 flex flex-col gap-3 text-[17px] leading-[1.5]">
            <Margin side="left" tone="pen" note="what I did" gap={22} width={170}>
              <p>I moved the annual toggle above our plans. Same prices.</p>
            </Margin>
            <Margin side="left" tone="pen" note="what happened" gap={22} width={170}>
              <div>
                <p className="text-kit-ink-muted">Annual signups this month:</p>
                <p className="text-[26px] leading-[1.3] font-[600] tabular-nums">23</p>
                <p className="text-kit-ink-muted">Last month it was 9.</p>
              </div>
            </Margin>
            <Margin side="left" tone="pen" note="what it meant" gap={22} width={170}>
              <p>Nobody wanted annual less. They never saw it.</p>
            </Margin>
          </div>
        </div>
      </div>

      <div className="absolute top-[640px] left-1/2 -translate-x-1/2">
        <Cta tone="action">Join the waitlist</Cta>
      </div>

      {/* The first section: the week. Lines, not tiles. */}
      <section className="absolute inset-x-16 top-[730px] bottom-0 border-t border-kit-hairline pt-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[18px] font-[600] tracking-[-0.015em]">Your week, drafted and waiting</h2>
          <p className="text-[14px] text-kit-ink-muted">Two or three posts. Nothing goes out on its own.</p>
        </div>
        <ol className="mt-4 grid grid-cols-5 gap-6 text-[14px] leading-[1.4]">
          {[
            ["Mon", "08:30", "I moved the annual toggle above our plans."],
            ["Tue", "", ""],
            ["Wed", "12:05", "Invoices now go out in your own currency."],
            ["Thu", "", ""],
            ["Fri", "09:10", "I stopped writing release notes nobody read."],
          ].map(([d, t, line]) => (
            <li key={d} className={`border-t-2 pt-2 ${line ? "border-kit-ink" : "border-kit-hairline"}`}>
              <p className="flex justify-between font-kit-mono text-[12px] text-kit-ink-muted">
                <span>{d}</span>
                <span>{t}</span>
              </p>
              <p className={`mt-1 ${line ? "" : "text-kit-ink-muted"}`}>{line || "Nothing planned."}</p>
            </li>
          ))}
        </ol>
      </section>
    </Canvas>
  )
}
