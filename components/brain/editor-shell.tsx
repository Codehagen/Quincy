"use client"

import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { brainKeys } from "@/lib/brain-keys"
import { Button, Card, Text } from "@/components/kit"

export type SaveState = "idle" | "saving" | "saved" | "error"

/**
 * Chrome shared by every brain editor: the heading, the save control, and the
 * one place a rejected invariant is allowed to speak.
 *
 * The editors compose inside it rather than being configured by it — each kind
 * has a different body and there is no useful union of "a rule list" and "a
 * pillar table" that is not just `children`.
 *
 * It is one kit Card, the detail object under the brain's page tree
 * (docs/design/page.md, "List and detail"). The page's `h1` belongs to
 * KitPage, so the editor's title is an `h2` at body size and 560 — inside a
 * page, hierarchy is weight and grey. `titleAs="h1"` stays for a page that
 * has not moved to KitPage yet and needs the editor to carry its one title.
 */
export function EditorShell({
  title,
  titleAs = "h2",
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
  titleAs?: "h1" | "h2"
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
    <Card>
      <form
        className="flex flex-col gap-kit-group"
        onSubmit={(event) => {
          event.preventDefault()
          if (dirty) onSave()
        }}
      >
        <header className="flex flex-col gap-kit-tight">
          <div className="flex flex-wrap items-center justify-between gap-x-kit-group gap-y-kit-related">
            <Text as={titleAs} weight="strong">
              {title}
            </Text>

            <div className="flex shrink-0 items-center gap-kit-controls">
              {/* Reserved space, always rendered. Swapping a status line in and
                  out on save would shift the button by its own height at the
                  exact moment the pointer is over it. */}
              <span
                aria-live="polite"
                className={
                  "inline-flex items-center gap-1 text-kit-small text-kit-ink-muted transition-opacity duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none " +
                  (state === "saved" ? "opacity-100" : "opacity-0")
                }
              >
                <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} aria-hidden />
                Saved
              </span>

              {actions}

              <Button
                type="submit"
                variant="action"
                disabled={!dirty}
                pending={state === "saving"}
                pendingLabel="Saving…"
              >
                Save
              </Button>
            </div>
          </div>

          {description ? (
            <Text tone="muted">{description}</Text>
          ) : null}

          {aside}
        </header>

        {error ? (
          // In ink, not red: a rejected save is not a destructive action
          // (docs/design/states.md). `alert` because the person's own edit is
          // the thing at risk. The invariants write these for a person on
          // purpose, so the sentence already says what to do.
          <div role="alert">
            <Text>{error}</Text>
          </div>
        ) : null}

        {children}
      </form>
    </Card>
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
