"use client"

import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Alert02Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { brainKeys } from "@/lib/brain-keys"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export type SaveState = "idle" | "saving" | "saved" | "error"

/**
 * Chrome shared by every brain editor: the heading, the save control, and the
 * one place a rejected invariant is allowed to speak.
 *
 * The editors compose inside it rather than being configured by it — each kind
 * has a different body and there is no useful union of "a rule list" and "a
 * pillar table" that is not just `children`.
 */
export function EditorShell({
  title,
  description,
  dirty,
  state,
  error,
  onSave,
  aside,
  actions,
  children,
}: {
  title: string
  description?: string
  dirty: boolean
  state: SaveState
  error?: string
  onSave: () => void
  /** Rendered under the heading. Provenance notices live here. */
  aside?: React.ReactNode
  /**
   * Rendered to the left of Save. For controls that change what the editor is
   * showing rather than what it holds — the prose read/edit switch is the only
   * one so far. Anything that mutates the page belongs in `children`, where the
   * dirty state can see it.
   */
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <form
      className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-8 py-10"
      onSubmit={(event) => {
        event.preventDefault()
        if (dirty) onSave()
      }}
    >
      <header className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-6">
          {/* balance, because a two-word title wrapping to leave one word on
              line two is the most visible kind of ragged heading. */}
          <h1 className="text-display text-balance">{title}</h1>

          <div className="flex shrink-0 items-center gap-3 pt-2">
            {actions}

            {/* Reserved space, always rendered. Swapping a status line in and
                out on save would shift the button by its own height at the
                exact moment the pointer is over it. */}
            <span
              aria-live="polite"
              className={cn(
                "text-caption text-muted-foreground transition-opacity duration-150",
                state === "saved" ? "opacity-100" : "opacity-0"
              )}
            >
              <HugeiconsIcon icon={Tick02Icon} data-icon="inline-start" />
              Saved
            </span>

            <Button
              type="submit"
              size="sm"
              disabled={!dirty || state === "saving"}
            >
              {state === "saving" ? "Saving" : "Save"}
            </Button>
          </div>
        </div>

        {description ? (
          <p className="max-w-[60ch] text-body text-pretty text-muted-foreground">
            {description}
          </p>
        ) : null}

        {aside}
      </header>

      {error ? (
        // Three signals, not one: the tint, the mark, and a sentence that says
        // what to do. The invariants write these for a person on purpose.
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 px-3 py-2 text-body text-destructive"
        >
          <HugeiconsIcon icon={Alert02Icon} className="mt-0.5 shrink-0" />
          <span className="text-pretty">{error}</span>
        </p>
      ) : null}

      {children}
    </form>
  )
}

/**
 * Dirty tracking and the save round trip, shared by every editor.
 *
 * Compares against the last value the server accepted rather than the value the
 * page loaded with, so saving and then undoing your edit correctly leaves the
 * button disabled.
 */
export function useBrainForm<T>(
  initial: T,
  save: (value: T) => Promise<{ ok: boolean; error?: string }>
) {
  const [value, setValue] = React.useState(initial)
  const [committed, setCommitted] = React.useState(initial)
  const [state, setState] = React.useState<SaveState>("idle")
  const [error, setError] = React.useState<string>()
  const queryClient = useQueryClient()

  const dirty = React.useMemo(
    () => JSON.stringify(value) !== JSON.stringify(committed),
    [value, committed]
  )

  const onSave = React.useCallback(async () => {
    setState("saving")
    setError(undefined)
    const result = await save(value)

    if (result.ok) {
      setCommitted(value)
      setState("saved")
      // The other half of caching the brain. The tree renders titles and
      // provenance out of this cache, and a save can change both — renaming a
      // page, or correcting a compiled one, which takes it out of Heartbeat's
      // loop and puts the mark on its row. Without this the row keeps the old
      // name until the entry goes stale, and the surface quietly disagrees with
      // the database it was just written to.
      //
      // Aimed at `lists()` rather than `all`: it clears every account's page
      // list this browser has cached and nothing else. The server action also
      // calls revalidatePath("/brain"), which handles a full reload; this
      // handles the client that is still standing there.
      void queryClient.invalidateQueries({ queryKey: brainKeys.lists() })
      return
    }

    setError(result.error)
    setState("error")
  }, [queryClient, save, value])

  // The "Saved" note is an acknowledgement, not a status. Leaving it up makes
  // the next edit look like it saved itself.
  React.useEffect(() => {
    if (state !== "saved") return
    const timer = setTimeout(() => setState("idle"), 2000)
    return () => clearTimeout(timer)
  }, [state])

  // Clear the rejection the moment the value moves. A rejected save leaves a
  // sentence on screen describing a form that no longer exists, and the reader
  // has no way to tell whether it still applies — worse when the fix also puts
  // the value back where it started, which disables Save and leaves the error
  // as the only thing on screen with nothing to act on.
  const firstRender = React.useRef(true)
  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    setError(undefined)
    setState((s) => (s === "error" ? "idle" : s))
  }, [value])

  return { value, setValue, dirty, state, error, onSave }
}
