import { REFUSALS } from "@/app/(marketing)/pricing/copy"
import { Perched } from "@/components/showcase/demos/perched"

/**
 * What Quincy will never do, read from the pricing page's REFUSALS so the
 * two pages cannot disagree. The friend waits on the list's top edge.
 */
export function NeverList() {
  return (
    <Perched state="waiting" at="calc(100% - 4.5rem)" className="mx-auto w-full max-w-[40rem] text-left">
      <ul className="flex flex-col">
        {REFUSALS.map((r) => (
          <li
            key={r.never}
            className="grid gap-kit-tight border-t border-kit-hairline bg-kit-ground py-5 sm:grid-cols-[1fr_1.3fr] sm:gap-8"
          >
            <span className="text-base font-kit-strong text-kit-ink">{r.never}</span>
            <span className="text-kit-ink-muted">{r.because}</span>
          </li>
        ))}
      </ul>
    </Perched>
  )
}
