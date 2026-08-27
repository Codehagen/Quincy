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
 * `locked` is Heartbeat and is the only switch here that cannot move: it runs
 * for everyone on a system cron and is maintenance rather than a choice
 * (plans/016, decision 8). Its label says so, because a switch nobody can move
 * has to explain itself.
 *
 * There is no third state. A rhythm with no switch to offer — an event rhythm,
 * turned on by connecting its source — renders no switch at all rather than a
 * disabled one, so this component is only ever asked about something a press
 * can change. See components/rhythm/rhythm-grid.tsx.
 */
export function RhythmSwitch({
  rhythmId,
  name,
  enabled,
  locked = false,
}: {
  rhythmId: string
  name: string
  enabled: boolean
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

  if (locked) {
    return <Switch checked disabled aria-label={`${name} — always on`} />
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
