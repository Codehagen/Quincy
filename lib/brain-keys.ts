/**
 * Query keys for the brain, in one place.
 *
 * Hierarchical so invalidation can be aimed: `brainKeys.all` clears everything
 * brain-shaped, `brainKeys.list(userId)` clears one account's pages and leaves
 * every other cached query alone.
 *
 * The userId is in the key for the same reason it is in the unique constraint
 * on `brain_page`. The comment there reads: "A key with no tenant in it is how
 * two accounts end up sharing a row — that was 5a6e9c7." The client cache has
 * the identical failure mode and no database constraint to catch it: the
 * QueryClient lives in the root layout and survives a sign-out, so a key of
 * just ["brain","list"] would hand the next account to sign in on this browser
 * the previous one's pages until the entry went stale.
 *
 * Server-derived, never user-supplied — the API route reads the session and
 * ignores anything the client claims about who it is. The key scopes the cache;
 * it does not authorise the read.
 */
export const brainKeys = {
  all: ["brain"] as const,
  lists: () => [...brainKeys.all, "list"] as const,
  list: (userId: string) => [...brainKeys.lists(), userId] as const,
} as const
