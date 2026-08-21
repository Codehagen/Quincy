import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/page-header"

import { CHANNELS_BY_STATE } from "../data"
import { LiveLabel, PlatformTile } from "./parts"

/**
 * Roster — axis: interaction model.
 *
 * Every platform is a row, connected or not, and the list makes no distinction
 * in footprint between them. Reads as infrastructure: a register of what exists
 * and what state each thing is in. Scales to twenty platforms without the page
 * turning into a scroll marathon.
 *
 * What it gives up: there is no room for strategy here, so the row can only
 * ever be a doorway to another screen.
 */
export function Roster() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-8 py-10">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Channels</PageHeaderTitle>
          <PageHeaderDescription>
            Where the writing goes out. Quincy publishes nowhere you have not
            connected.
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      {/* One elevation token owns the edge — no border alongside it. */}
      <div className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-xs">
        {CHANNELS_BY_STATE.map((channel) => (
          <div
            key={channel.platform}
            className="flex items-center gap-3 px-4 py-3"
          >
            <PlatformTile platform={channel.platform} live={channel.live} />

            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-card-title">{channel.label}</p>
              <p
                className={cn(
                  "truncate text-caption",
                  // Not an alpha derivative: muted-foreground/70 measures
                  // 3.23:1 on the card and fails AA at this size. The solid
                  // token is 6.29:1.
                  channel.handle
                    ? "font-mono text-muted-foreground"
                    : "text-muted-foreground"
                )}
              >
                {channel.handle ?? "Not connected"}
              </p>
            </div>

            <div className="ml-auto flex items-center gap-4">
              {channel.live !== null ? (
                <div className="hidden flex-col items-end gap-0.5 sm:flex">
                  <LiveLabel live={channel.live} />
                  <p className="text-caption text-muted-foreground">
                    {channel.cadence}
                  </p>
                </div>
              ) : null}

              {/* The row is not itself a link: wrapping it would make the whole
                  thing one announcement and kill text selection. The action is
                  its own control. */}
              {channel.live !== null ? (
                <Button variant="ghost" aria-label={`Manage ${channel.label}`}>
                  Manage
                  <HugeiconsIcon
                    aria-hidden="true"
                    data-icon="inline-end"
                    icon={ArrowRight01Icon}
                  />
                </Button>
              ) : (
                <Button
                  variant="outline"
                  aria-label={`Connect ${channel.label}`}
                >
                  Connect
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="px-3 text-caption text-muted-foreground">
        Disconnecting stops publishing immediately. Drafts already written stay
        in the lineup.
      </p>
    </div>
  )
}
