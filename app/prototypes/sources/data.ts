import type { Connection } from "@/lib/sources"

/**
 * Mock connection states for the sources roster.
 *
 * These exist because the states cannot be produced yet — there is no
 * connection model, no OAuth, no credentials — and a state nobody has rendered
 * is a state nobody has designed. The production page passes `connection: null`
 * for every row, which is the true value there; this file is the only place
 * where anything else exists, and `app/prototypes` never ships.
 *
 * The set is chosen to cover what the row has to survive rather than what looks
 * good in a screenshot:
 *
 * - **`arriving`** — the happy path, and the least interesting.
 * - **`waiting`** — connected, nothing has come through. Indistinguishable from
 *   working on any surface that only draws a checkmark, which is how a source
 *   wired to the wrong repo stays green forever.
 * - **`paused`** — deliberately stopped. Has to read as a choice, not a fault.
 * - **`broken`** — token expired. The one state that should be able to
 *   interrupt you, and the one that has to survive the `sm` breakpoint where
 *   the status column stops rendering.
 * - **`null`** — never connected, which is every row in production today.
 *
 * The longest label in the set is deliberate too: "Needs reconnecting" is the
 * string that decides whether the status column fits beside a two-line
 * description, so it is the one worth laying out against.
 */
export const MOCK_CONNECTIONS: Record<string, Connection | null> = {
  voice: { state: "arriving", lastAt: "2 hours ago" },
  slack: { state: "broken", lastAt: "9 days ago" },
  loom: { state: "waiting", since: "3 days ago" },
  email: null,
  github: { state: "arriving", lastAt: "Yesterday" },
  granola: { state: "paused", lastAt: "6 days ago" },
  fathom: null,
  photos: { state: "arriving", lastAt: "3 days ago" },
  notion: { state: "waiting", since: "an hour ago" },
  calendar: null,
  rss: null,
}
