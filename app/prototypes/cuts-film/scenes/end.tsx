import { QuincyMark } from "@/components/mascot"
import { blur, easeOutExpo, lerp, progress, spring, springContact } from "../motion"
import { Words, push, swing } from "../parts"
import type { SceneProps } from "../storyboard"

// The end card: the lockup lands, "Cuts" beside it, the promise, the address. No call to action we can't keep.

const MARK = 260
const MARK_SPRING = { duration: 560, bounce: 0.25 }
const NAME = MARK + 260
const LINE = NAME + 420
const URL_AT = LINE + 700

export const END_CUES = [
  { at: MARK + springContact(MARK_SPRING), sound: "thump" },
  { at: NAME + 120, sound: "tick" },
  { at: LINE + 260, sound: "lift" },
  { at: URL_AT, sound: "tick" },
]

export function EndScene({ t }: SceneProps) {
  const land = spring(t - MARK, MARK_SPRING)
  const squash = t - MARK > 900 ? 0 : 1 - Math.min(1, land)
  const name = spring(t - NAME, { duration: 500, bounce: 0.2 })
  return (
    <div className="absolute inset-0 origin-center" style={push(t, 99999, { exit: false })}>
      {/* The lockup at 2.4×, "Cuts" beside it in the wordmark's own size and weight, one row scaled together. */}
      <div className="absolute inset-x-0 flex justify-center" style={{ top: 236 }}>
        <div className="flex origin-center scale-[2.4] items-center gap-3 text-kit-ink">
          <span
            className="inline-flex origin-bottom"
            style={{
              opacity: Math.min(1, progress(t, MARK, 100)),
              transform: t - MARK > 900 ? undefined : `translateY(${lerp(-22, 0, Math.min(1, land)).toFixed(2)}px) scale(${(1 + squash * 0.12).toFixed(3)}, ${(1 - squash * 0.1).toFixed(3)})`,
              filter: blur(squash * 2),
            }}
          >
            <QuincyMark size="md" still />
          </span>
          <span
            className="text-kit-wordmark leading-none font-kit-strong text-kit-ink-muted"
            style={{ opacity: Math.min(1, Math.max(0, (t - NAME) / 120)), transform: `translateX(${((1 - name) * -14).toFixed(2)}px)`, filter: blur((1 - Math.min(1, name)) * 3) }}
          >
            Cuts
          </span>
        </div>
      </div>
      <p className="absolute inset-x-0 text-center text-[2.75rem] leading-[1.06] font-kit-strong tracking-[-0.04em] text-balance text-kit-ink" style={{ top: 372 }}>
        <Words text="Quincy drafts." t={t} at={LINE} /> <Words text="You send." t={t} at={LINE + 220} className="text-kit-ink-muted" />
      </p>
      <div className="absolute inset-x-0 flex justify-center" style={{ top: 476, ...swing(t, URL_AT, { tilt: 0, y: 12 }) }}>
        <span className="text-kit-body text-kit-ink-muted" style={{ transform: `translateY(${lerp(4, 0, easeOutExpo(progress(t, URL_AT, 400))).toFixed(2)}px)` }}>
          hirequincy.com
        </span>
      </div>
    </div>
  )
}
