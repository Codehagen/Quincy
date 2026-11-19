import { blur, easeIn, easeOutExpo, lerp, progress } from "../motion"
import { Words } from "../parts"
import type { SceneProps } from "../storyboard"

// A beat's words: a small card in the bottom-left corner over the desk, so the editor keeps the whole frame.
// The card lands once per beat (the first beat's card rises in; later ones swap their words in place).

export function CaptionScene({ t, duration, scene }: SceneProps) {
  const [lead, soft] = scene.caption
  const first = scene.id === "drop"
  const at = first ? 120 : 180
  const inP = easeOutExpo(progress(t, first ? 0 : 0, first ? 500 : 1))
  const out = easeIn(progress(t, duration - 200, 180))
  const leadDone = at + lead.split(" ").length * 32 + 160
  return (
    <div
      className="absolute bottom-6 left-6 max-w-[460px] rounded-kit-object bg-kit-object px-5 pt-3.5 pb-4 shadow-kit-lifted"
      // The card leaves with its words (never an empty card between beats); the next beat's card is there at once.
      style={first ? { opacity: inP * (1 - out), transform: `translateY(${lerp(12, 0, inP).toFixed(2)}px)`, filter: blur((1 - inP) * 4) } : { opacity: Math.min(1, progress(t, 0, 120)) * (1 - out) }}
    >
      <p className="mb-1 text-kit-small text-kit-ink-muted" style={{ opacity: 1 - out }}>
        <Words text={scene.eyebrow} t={t} at={at - 80} stagger={24} />
      </p>
      <h2 className="text-[26px] leading-[1.1] font-kit-strong tracking-[-0.03em] text-balance text-kit-ink" style={{ opacity: 1 - out, filter: blur(out * 5) }}>
        <Words text={lead} t={t} at={at} /> <Words text={soft} t={t} at={leadDone} className="text-kit-ink-muted" />
      </h2>
    </div>
  )
}
