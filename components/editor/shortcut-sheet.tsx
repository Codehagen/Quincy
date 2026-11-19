"use client"

import * as React from "react"

import { Dialog, DialogPanel, Kbd } from "@/components/kit"
import { KEY_GROUPS, KEYMAP } from "@/lib/editor/keymap"

/**
 * Every key the editor answers, read from the same table the handler uses,
 * so the sheet cannot list a key that does nothing. Opened with `?`.
 */
export function ShortcutSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPanel
        title="Keyboard shortcuts"
        description="The keys work anywhere in the editor except while you type."
        size="lg"
      >
        <div className="grid gap-6 sm:grid-cols-2">
          {KEY_GROUPS.map((group) => (
            <section key={group} className="flex flex-col gap-1">
              <h3 className="pb-1 text-kit-mono tracking-wide text-kit-ink-muted uppercase">
                {group}
              </h3>
              <dl className="flex flex-col">
                {KEYMAP.filter((entry) => entry.group === group).map(
                  (entry) => (
                    <div
                      key={entry.action}
                      className="flex items-center justify-between gap-3 py-1"
                    >
                      <dt className="min-w-0 text-kit-small text-kit-ink">
                        {entry.label}
                      </dt>
                      <dd className="flex shrink-0 items-center gap-1.5">
                        {entry.hints.map((hint, index) => (
                          <React.Fragment key={hint.join("+")}>
                            {index > 0 ? (
                              <span className="text-kit-small text-kit-ink-muted">
                                or
                              </span>
                            ) : null}
                            <Kbd keys={hint} size="sm" />
                          </React.Fragment>
                        ))}
                      </dd>
                    </div>
                  )
                )}
              </dl>
            </section>
          ))}
        </div>
      </DialogPanel>
    </Dialog>
  )
}
