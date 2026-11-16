"use client"

/*
 * Built on ui-sdk (@ui-sdk/react/command + /dialog), not Base UI: Base UI has
 * no command list. ui-sdk's Command ranks as you type, keeps focus in the
 * input while arrows move the highlight, marks the matched letters and
 * announces the result count. The dialog is ui-sdk's too, so one component
 * never mixes the two behaviour layers.
 */

import * as React from "react"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { BubbleChatIcon, RefreshIcon, Search01Icon } from "@hugeicons/core-free-icons"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandItemText,
  CommandList,
  CommandSeparator,
  CommandStatus,
} from "@ui-sdk/react/command"
import {
  Dialog,
  DialogBackdrop,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/react/dialog"

import { CONTROL_SURFACE, FOCUS_RING, HIT_44, INPUT_TEXT, PANEL_ROW } from "./control-styles"
import { SCRIM } from "./overlay-styles"
import { useControllable } from "./use-controllable"
import { useModKey } from "./use-mod-key"

export type CommandPaletteItem = {
  /** Passed to `onAction`. Unique across every group. */
  value: string
  label: string
  /** Leading hugeicon. Decorative beside the label. */
  icon?: IconSvgElement
  /** More words the search matches ("lineup" finds "Schedule"). */
  keywords?: string[]
  /** Right-aligned and muted: a time, a count ("2h ago"). */
  meta?: string
  disabled?: boolean
}

export type CommandPaletteGroup = {
  /** "Pages", "Recent drafts". Hidden while none of its items match. */
  label: string
  items: CommandPaletteItem[]
}

export type CommandPaletteStatus = "idle" | "loading" | "error"

export type CommandPaletteProps = {
  groups: CommandPaletteGroup[]
  /** Runs with the item's `value`. The palette closes first. */
  onAction: (value: string) => void
  /**
   * Adds "Ask Quincy" as the last row, always present, with what was typed.
   * So a search that finds nothing still goes somewhere: to the chat.
   */
  onAsk?: (query: string) => void
  /**
   * For the groups that load (recent drafts). Pages still work while it
   * loads or fails, so the palette never blocks on it.
   */
  status?: CommandPaletteStatus
  /** Shown with `status="error"` as a row you can press to retry. */
  onRetry?: () => void
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /**
   * Listen for ⌘K / Ctrl+K on the whole page. One palette per page sets
   * this; the lab's second copy turns it off. Default true.
   */
  hotkey?: boolean
  /** The trigger pill's words. Default "Search or ask". */
  triggerLabel?: string
  placeholder?: string
}

const RETRY = "__kit-retry"
const ASK = "__kit-ask"

/**
 * ⌘K / Ctrl+K: jump to a page, open a recent draft, or ask Quincy. A white
 * panel over the scrim, the input on top, groups under it, every row the
 * selected grey when highlighted (never blue). The trigger is a quiet pill
 * that shows the platform's key after mount (useModKey); the listener
 * accepts both ⌘ and Ctrl everywhere.
 */
export function CommandPalette({
  groups,
  onAction,
  onAsk,
  status = "idle",
  onRetry,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  hotkey = true,
  triggerLabel = "Search or ask",
  placeholder = "Find a page or a draft, or ask",
}: CommandPaletteProps) {
  const [open, setOpen] = useControllable(openProp, defaultOpen, onOpenChange)
  const [query, setQuery] = React.useState("")
  const mod = useModKey()
  // ⌘K is pressed dozens of times a day; a palette that animates in and out
  // on the keyboard is a delay every time. Opened by a key (or by the
  // parent) it appears and goes at once; opened by a pointer on the trigger
  // pill it fades, briefly. The way it opened decides its close too.
  const [byPointer, setByPointer] = React.useState(false)

  const change = (next: boolean, source?: string) => {
    if (next) setByPointer(source === "mouse" || source === "touch" || source === "pen")
    setOpen(next)
    if (!next) setQuery("")
  }

  // Both modifiers, on every platform: only the hint chooses (AGENTS.md).
  const toggle = React.useEffectEvent(() => change(!open))
  React.useEffect(() => {
    if (!hotkey) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault()
        toggle()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [hotkey])

  const run = (value: string) => {
    if (value === RETRY) {
      onRetry?.()
      return
    }
    change(false)
    if (value === ASK) onAsk?.(query.trim())
    else onAction(value)
  }

  const asked = query.trim()

  return (
    <Dialog open={open} onOpenChange={(next, details) => change(next, details.source)}>
      <DialogTrigger
        aria-keyshortcuts={hotkey ? "Meta+K Control+K" : undefined}
        className={
          `relative inline-flex h-kit-control-md w-full max-w-72 min-w-0 items-center gap-2 rounded-full pr-1.5 pl-3 text-kit-body text-kit-ink-muted select-none ${CONTROL_SURFACE} ${FOCUS_RING} ${HIT_44} ` +
          "transition-[background-color,color] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none hover:bg-kit-control-hover hover:text-kit-ink"
        }
      >
        <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={2} aria-hidden className="shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">{triggerLabel}</span>
        {hotkey ? (
          <kbd
            aria-hidden
            className="shrink-0 rounded-kit-chip px-1.5 font-kit-mono text-kit-mono text-kit-ink-muted shadow-kit-inset"
          >
            {mod === "⌘" ? "⌘K" : "Ctrl K"}
          </kbd>
        ) : null}
      </DialogTrigger>
      {/* The modal scrim Dialog and Sheet use, instant unless a pointer opened it. */}
      <DialogBackdrop
        data-instant={byPointer ? undefined : ""}
        className={`${SCRIM} data-instant:transition-none motion-reduce:transition-none`}
      />
      <DialogContent
        data-instant={byPointer ? undefined : ""}
        className={
          // Object radius 18 with the 6px row inset, so rows are 12 (inner = outer − padding).
          // Lifted, as every modal over the scrim (Dialog, Sheet); floating panels are object.
          // The height also stops above an on-screen keyboard (ui-sdk's --visual-viewport-height).
          "fixed top-[12dvh] left-1/2 z-50 flex max-h-[min(76dvh,calc(var(--visual-viewport-height,100dvh)-12dvh-1rem))] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-kit-object bg-kit-object p-kit-row-inset text-kit-body text-kit-ink shadow-kit-lifted outline-none " +
          // A fade only, and only from a pointer: nothing scales, nothing travels.
          "transition-[opacity] duration-(--kit-duration-state) ease-kit-out " +
          "data-starting-style:opacity-0 data-ending-style:opacity-0 " +
          "data-instant:transition-none motion-reduce:transition-none"
        }
      >
        <DialogTitle className="sr-only">Search Quincy</DialogTitle>
        <Command
          onAction={(value) => run(value)}
          query={query}
          onQueryChange={(q) => setQuery(q)}
          status={status === "idle" ? "idle" : status === "loading" ? "loading" : "error"}
          className="flex min-h-0 flex-col"
        >
          <div className="relative flex items-center gap-2.5 px-3">
            <HugeiconsIcon
              icon={Search01Icon}
              size={18}
              strokeWidth={2}
              aria-hidden
              className="shrink-0 text-kit-ink-muted"
            />
            <CommandInput
              aria-label="Search pages and drafts"
              placeholder={placeholder}
              autoComplete="off"
              spellCheck={false}
              className={`h-12 min-w-0 flex-1 bg-transparent outline-none ${INPUT_TEXT}`}
            />
          </div>
          <span aria-hidden className="mx-3 h-px shrink-0 bg-kit-hairline" />
          <CommandEmpty
            // Always in the page as a live region; it only takes room with words in it.
            className="px-4 py-6 text-center text-pretty break-words text-kit-ink-muted empty:p-0"
          >
            {asked ? `Nothing matches “${asked}”.` : "Nothing here yet."}
          </CommandEmpty>
          <CommandList className="min-h-0 overflow-y-auto overscroll-contain pt-1.5 [scrollbar-width:thin]">
            {groups.map((group, i) => (
              <React.Fragment key={group.label}>
                {i > 0 ? <CommandSeparator className="mx-3 my-1.5 h-px bg-kit-hairline" /> : null}
                <CommandGroup>
                  <CommandGroupLabel className="px-4 pt-2 pb-1 text-kit-small font-kit-strong text-kit-ink-muted">
                    {group.label}
                  </CommandGroupLabel>
                  {group.items.map((item) => (
                    <PaletteRow key={item.value} item={item} />
                  ))}
                </CommandGroup>
              </React.Fragment>
            ))}
            {status === "error" ? (
              <CommandGroup>
                <CommandGroupLabel className="px-4 pt-2 pb-1 text-kit-small font-kit-strong text-kit-danger">
                  Drafts didn’t load
                </CommandGroupLabel>
                {onRetry ? (
                  <CommandItem
                    value={RETRY}
                    label="Try again"
                    keywords={[query]}
                    className={`${PANEL_ROW} text-kit-ink`}
                  >
                    <HugeiconsIcon icon={RefreshIcon} size={16} strokeWidth={2} aria-hidden className="shrink-0 text-kit-ink-muted" />
                    <span className="min-w-0 flex-1 truncate">Try again</span>
                  </CommandItem>
                ) : null}
              </CommandGroup>
            ) : null}
            {onAsk ? (
              <>
                <CommandSeparator className="mx-3 my-1.5 h-px bg-kit-hairline" />
                <CommandGroup>
                  <CommandItem
                    value={ASK}
                    label="Ask Quincy"
                    // Always matches: whatever was typed is its keyword.
                    keywords={asked ? [asked] : []}
                    className={`${PANEL_ROW} text-kit-ink`}
                  >
                    <HugeiconsIcon icon={BubbleChatIcon} size={16} strokeWidth={2} aria-hidden className="shrink-0 text-kit-ink-muted" />
                    <span className="min-w-0 flex-1 truncate">
                      {asked ? (
                        <>
                          Ask Quincy <span className="text-kit-ink-muted">“{asked}”</span>
                        </>
                      ) : (
                        "Ask Quincy…"
                      )}
                    </span>
                  </CommandItem>
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
          {/* Always mounted, outside the listbox: a live region announces only
              what changes inside it, and a listbox may hold only options. */}
          <CommandStatus className="shrink-0 px-4 text-kit-small text-kit-ink-muted not-empty:py-2.5">
            {status === "loading" ? "Looking through your drafts…" : null}
          </CommandStatus>
          <p
            aria-hidden
            className="mt-1 flex shrink-0 gap-3 px-4 pt-1.5 pb-1 text-kit-small text-kit-ink-muted pointer-coarse:hidden"
          >
            <span>↑↓ move</span>
            <span>↵ open</span>
            <span>esc close</span>
          </p>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

function PaletteRow({ item }: { item: CommandPaletteItem }) {
  return (
    <CommandItem
      value={item.value}
      label={item.label}
      keywords={item.keywords}
      disabled={item.disabled}
      className={`${PANEL_ROW} text-kit-ink`}
    >
      {item.icon ? (
        <HugeiconsIcon icon={item.icon} size={16} strokeWidth={2} aria-hidden className="shrink-0 text-kit-ink-muted" />
      ) : null}
      <CommandItemText className="min-w-0 flex-1 truncate [&_mark]:bg-transparent [&_mark]:font-kit-strong [&_mark]:text-kit-ink">
        {item.label}
      </CommandItemText>
      {item.meta ? (
        <span className="shrink-0 font-kit-mono text-kit-mono text-kit-ink-muted">{item.meta}</span>
      ) : null}
    </CommandItem>
  )
}
