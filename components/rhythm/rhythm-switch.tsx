"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { disableRhythm, enableRhythm } from "@/app/(app)/rhythm/actions"
import { Switch } from "@/components/ui/switch"

/**
 * The switch, finally switching something.
 *
 * Optimistic, and that is the whole design decision here. A rhythm toggle
 * writes a row and recomputes a cursor — a round trip on Neon over HTTP — and
 * a switch that waits for it reads as broken, because the one thing a switch
 * promises is that the state you see is the state you chose. So the UI moves
 * first and reverts on failure, which is the only case where the delay is
 * worth spending.
 *
 * `disabled` is still honoured for two kinds of rhythm and they mean different
 * things: `locked` is Heartbeat, which runs for everyone and is not a choice
 * (plans/016, decision 8), and everything else with no handler is simply not
 * built yet. The label says which, because a switch nobody can move has to
 * explain itself.
 */
export function RhythmSwitch({
  rhythmId,
  name,
  enabled,
  runnable,
  locked = false,
}: {
  rhythmId: string
  name: string
  enabled: boolean
  runnable: boolean
  locked?: boolean
}) {
  const router = useRouter()
  const [on, setOn] = React.useState(enabled)
  const [pending, setPending] = React.useState(false)

  /**
   * Re-sync to the server whenever the prop changes.
   *
   * Adjusted *during render* rather than in an effect. The effect version
   * (`useEffect(() => setOn(enabled), [enabled])`) is the obvious one and it
   * renders twice on every revalidate — React's own guidance, and what
   * `react-hooks/set-state-in-effect` flags. Setting state during render of
   * the same component is the supported way to derive from a changed prop:
   * React re-runs this component immediately, before touching the DOM, so the
   * intermediate value is never painted.
   */
  const [lastEnabled, setLastEnabled] = React.useState(enabled)
  if (enabled !== lastEnabled) {
    setLastEnabled(enabled)
    setOn(enabled)
  }

  if (locked || !runnable) {
    return (
      <Switch
        checked={locked}
        disabled
        aria-label={`${name} — ${locked ? "always on" : "not available yet"}`}
      />
    )
  }

  return (
    <Switch
      checked={on}
      disabled={pending}
      aria-label={`${name} — ${on ? "on" : "off"}`}
      onCheckedChange={async (next) => {
        setOn(next)
        setPending(true)

        try {
          const result = next
            ? await enableRhythm({ rhythmId })
            : await disableRhythm(rhythmId)

          if (!result.ok) {
            setOn(!next)
            return
          }

          // Re-reads the next-run time and the run history the server renders
          // beside this control.
          router.refresh()
        } catch {
          setOn(!next)
        } finally {
          setPending(false)
        }
      }}
    />
  )
}
