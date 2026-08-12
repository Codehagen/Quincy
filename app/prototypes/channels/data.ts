/**
 * Prototype fixture. Realistic on purpose — pillar weights sum to 100 because
 * the real policy invariant rejects a split that does not, and a prototype that
 * quietly breaks the rule teaches the wrong shape.
 *
 * Publishing destinations only. Meeting recorders, note tools and repos are
 * material coming *in* and belong to /sources; iMessage, Slack and Telegram are
 * places you talk to Quincy and belong to the chat. Flattening all three into
 * one grid is the mistake this is trying not to repeat — see
 * `app/(app)/channels/page.tsx` for where that boundary was drawn.
 *
 * Nine is roughly the ceiling for this surface, which is the number Roster has
 * to survive to earn its axis.
 */

export type Pillar = { name: string; weight: number }

export type Channel = {
  platform: string
  label: string
  handle: string | null
  /** null = never connected. */
  live: boolean | null
  cadence: string | null
  nextPost: string | null
  queued: number
  pillars: Pillar[]
}

const NOT_CONNECTED: Omit<Channel, "platform" | "label"> = {
  handle: null,
  live: null,
  cadence: null,
  nextPost: null,
  queued: 0,
  pillars: [],
}

export const CHANNELS: Channel[] = [
  {
    platform: "x",
    label: "X",
    handle: "@CodeHagen",
    live: true,
    cadence: "Weekdays 09:00",
    nextPost: "Thu 09:00",
    queued: 3,
    pillars: [
      { name: "Building in public", weight: 40 },
      { name: "Dev tooling", weight: 30 },
      { name: "Norwegian tech", weight: 20 },
      { name: "Personal", weight: 10 },
    ],
  },
  {
    platform: "linkedin",
    label: "LinkedIn",
    handle: "Christer Hagen",
    live: false,
    cadence: "Tue · Thu 08:00",
    nextPost: null,
    queued: 1,
    pillars: [
      { name: "Founder lessons", weight: 45 },
      { name: "Hiring", weight: 25 },
      { name: "Product", weight: 20 },
      { name: "Personal", weight: 10 },
    ],
  },
  {
    platform: "threads",
    label: "Threads",
    handle: "@codehagen",
    live: true,
    cadence: "Daily 17:00",
    nextPost: "Today 17:00",
    queued: 5,
    pillars: [
      { name: "Building in public", weight: 50 },
      { name: "Personal", weight: 30 },
      { name: "Dev tooling", weight: 20 },
    ],
  },
  {
    platform: "substack",
    label: "Substack",
    handle: "hagen.substack.com",
    live: false,
    cadence: "Sundays 07:00",
    nextPost: null,
    queued: 2,
    pillars: [
      { name: "Founder lessons", weight: 60 },
      { name: "Product", weight: 40 },
    ],
  },
  { platform: "bluesky", label: "Bluesky", ...NOT_CONNECTED },
  { platform: "instagram", label: "Instagram", ...NOT_CONNECTED },
  { platform: "youtube", label: "YouTube", ...NOT_CONNECTED },
  { platform: "mastodon", label: "Mastodon", ...NOT_CONNECTED },
  { platform: "kit", label: "Kit", ...NOT_CONNECTED },
]

export const CONNECTED = CHANNELS.filter((c) => c.live !== null)
export const AVAILABLE = CHANNELS.filter((c) => c.live === null)

/**
 * Connected first, then the rest in their authored order. Roster's axis is that
 * every row gets one treatment — that is about *presentation*, not sequence,
 * and a flat list with four live channels scattered through nine rows makes you
 * hunt for the thing you came to check.
 */
export const CHANNELS_BY_STATE: Channel[] = [...CONNECTED, ...AVAILABLE]
