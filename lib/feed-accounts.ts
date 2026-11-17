import type { listConnections } from "./channels"
import { initialsOf } from "./initials"

/**
 * Who each channel's post is from, as the feed will show it: the connected
 * account's own name, handle and picture, as the channel reported them at
 * connect time (`channel_connection`). Not only `active` rows: a connection
 * waiting on a reconnect is still the account the post goes out as.
 *
 * Where a field is not stored, it is left out rather than made up:
 * - LinkedIn stores no handle (its profile has none), so its post shows the
 *   name alone, as LinkedIn does.
 * - Nothing stores LinkedIn's headline, so the line under the name is empty.
 * - With no connection for a channel, the post is from the person's own
 *   name, with no handle: a handle Quincy has not seen would be a guess in
 *   their name.
 *
 * Drafts and Lineup both draw a post as its feed shows it, from this one map.
 */
export type FeedAccount = {
  name: string
  handle: string | null
  initials: string
  avatarUrl: string | null
  headline: string | null
}

export type FeedAccounts = { byChannel: Record<string, FeedAccount>; fallback: FeedAccount }

export function feedAccounts(
  user: { name?: string | null; email: string },
  connections: Awaited<ReturnType<typeof listConnections>>
): FeedAccounts {
  const ownName = user.name?.trim() || user.email.split("@")[0] || user.email
  const fallback: FeedAccount = {
    name: ownName,
    handle: null,
    initials: initialsOf(user),
    avatarUrl: null,
    headline: null,
  }
  const byChannel: Record<string, FeedAccount> = {}
  for (const c of connections) {
    if (c.state === "revoked") continue
    const name = c.displayName?.trim() || ownName
    byChannel[c.channel] = {
      name,
      // Stored as X reports it, "@name"; the feed header adds its own "@".
      handle: c.handle?.replace(/^@/, "").trim() || null,
      initials: initialsOf({ name, email: user.email }),
      avatarUrl: c.avatarUrl,
      headline: null,
    }
  }
  return { byChannel, fallback }
}
