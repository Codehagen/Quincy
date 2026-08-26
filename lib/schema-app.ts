import { relations, sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import type { DocumentLock, VideoDocument } from "./editor/types"
import { user } from "./schema"

/**
 * Application tables, deliberately NOT in lib/schema.ts.
 *
 * That file is generated output — `pnpm auth:generate` overwrites it whole
 * every time a Better Auth plugin changes. Anything hand-written there is lost
 * the first time someone adds a plugin, and the loss is silent until a query
 * fails in production.
 */

export const conversation = pgTable(
  "conversation",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Null until the first exchange names it from the opening message.
    title: text("title"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // The sidebar reads exactly this: one user's threads, newest touched first.
    index("conversation_user_updated_idx").on(table.userId, table.updatedAt),
  ]
)

export const message = pgTable(
  "message",
  {
    // The UIMessage id, not a fresh one. The client already has stable ids and
    // reusing them is what makes a save idempotent — a retried write updates
    // the same row instead of duplicating the turn.
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    // The whole UIMessage.parts array. Reasoning, tool calls and text already
    // travel through one renderer (components/chat/message-parts.tsx), and the
    // SDK ships validateUIMessages to type these back on the way out.
    // Normalising them into columns would re-derive a shape both ends agree on.
    parts: jsonb("parts").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("message_conversation_created_idx").on(
      table.conversationId,
      table.createdAt
    ),
  ]
)

/* ── The brain ────────────────────────────────────────────────────────────
   Where "your voice" is stored. See docs/brain.md for the reasoning; the
   short version is that structured data is authoritative and prose is
   rendered from it, never the reverse.
   ──────────────────────────────────────────────────────────────────────── */

export const BRAIN_KINDS = [
  "identity",
  "voice",
  "instruction",
  "policy",
  "story",
  "memory",
] as const

export type BrainKind = (typeof BRAIN_KINDS)[number]

/**
 * Where a page came from, and therefore whether it may supply a `proof` claim
 * that ends up in a published post. `inferred` may not — it is what Quincy
 * extracted but you have not seen.
 */
export const BRAIN_PROVENANCE = [
  "user",
  "published",
  "confirmed",
  "inferred",
] as const

export type BrainProvenance = (typeof BRAIN_PROVENANCE)[number]

export const brainPage = pgTable(
  "brain_page",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: BRAIN_KINDS }).notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    // Prose. Authoritative for identity and memory, rendered for the rest.
    body: text("body").notNull().default(""),
    // Structured. Authoritative for voice, instruction, policy and story.
    // Anything code reads lives here, because a number parsed out of a
    // paragraph changes silently when the paragraph is reworded.
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    provenance: text("provenance", { enum: BRAIN_PROVENANCE })
      .notNull()
      .default("user"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // Scoped to the user, not global. A key with no tenant in it is how two
    // accounts end up sharing a row — that was 5a6e9c7, and it stays fixed by
    // making the constraint itself impossible to get wrong.
    unique("brain_page_user_slug_key").on(table.userId, table.slug),
    // The read path: everything of one kind for one user, in one query.
    index("brain_page_user_kind_idx").on(table.userId, table.kind),
  ]
)

/**
 * Append-only. Written during a conversation; never rewritten. Compilation
 * reads these and rewrites the page, which is why nothing is lost when a
 * compile goes wrong.
 */
export const brainEvent = pgTable(
  "brain_event",
  {
    id: text("id").primaryKey(),
    pageId: text("page_id")
      .notNull()
      .references(() => brainPage.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: ["observation", "correction", "compile"],
    }).notNull(),
    // 'conversation:<id>' | 'post:<id>' | 'user' | 'heartbeat'
    source: text("source").notNull(),
    confidence: text("confidence", { enum: ["low", "medium", "high"] })
      .notNull()
      .default("medium"),
    summary: text("summary").notNull(),
    detail: text("detail").notNull().default(""),
    observedAt: timestamp("observed_at").notNull().defaultNow(),
  },
  (table) => [
    index("brain_event_page_observed_idx").on(table.pageId, table.observedAt),
  ]
)

/**
 * Snapshots taken before a compile overwrites a page. Events are append-only
 * and therefore need no versioning — only the compiled surface does.
 */
export const brainPageVersion = pgTable(
  "brain_page_version",
  {
    id: text("id").primaryKey(),
    pageId: text("page_id")
      .notNull()
      .references(() => brainPage.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    snapshotAt: timestamp("snapshot_at").notNull().defaultNow(),
  },
  (table) => [
    index("brain_page_version_page_idx").on(table.pageId, table.snapshotAt),
  ]
)

export const brainPageRelations = relations(brainPage, ({ one, many }) => ({
  user: one(user, { fields: [brainPage.userId], references: [user.id] }),
  events: many(brainEvent),
  versions: many(brainPageVersion),
}))

export const brainEventRelations = relations(brainEvent, ({ one }) => ({
  page: one(brainPage, {
    fields: [brainEvent.pageId],
    references: [brainPage.id],
  }),
}))

export const brainPageVersionRelations = relations(
  brainPageVersion,
  ({ one }) => ({
    page: one(brainPage, {
      fields: [brainPageVersion.pageId],
      references: [brainPage.id],
    }),
  })
)

/**
 * One row per model call. Append-only; nothing reads it to make a decision.
 *
 * `conversationId` is deliberately a plain column with **no foreign key**.
 * Every other reference to a conversation cascades on delete, which is right
 * for messages and wrong for money: deleting a thread must not erase the record
 * of what it cost. The id is kept for grouping and debugging, and is allowed to
 * point at a conversation that no longer exists.
 *
 * Tokens and cost are both stored. Tokens are the durable fact; cost is an
 * estimate at the rates in lib/pricing.ts on the day it was written, and those
 * rates change — Sonnet 5's introductory pricing ends 2026-08-31. Keeping the
 * token counts is what makes a later recomputation possible.
 */
export const usageEvent = pgTable(
  "usage_event",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id"),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    cachedInputTokens: integer("cached_input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    /** Micro-dollars. See lib/pricing.ts. */
    costMicros: integer("cost_micros").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    // Every read is "this user, this period" — the meter and, later, the cap.
    index("usage_event_user_created_idx").on(table.userId, table.createdAt),
  ]
)

export const conversationRelations = relations(
  conversation,
  ({ one, many }) => ({
    user: one(user, {
      fields: [conversation.userId],
      references: [user.id],
    }),
    messages: many(message),
  })
)

export const messageRelations = relations(message, ({ one }) => ({
  conversation: one(conversation, {
    fields: [message.conversationId],
    references: [conversation.id],
  }),
}))

/* ── Drafts and Lineup ──────────────────────────────────────────────────────
   The approve → schedule chain. Four tables, and the shape of them was decided
   by app/prototypes/lineup before a line of this was written — deliberately,
   because three of the columns below would have been wrong the other way round:

   - **A slot is a row, not a view.** Agenda can only say "you have a Wednesday
     12:00 slot and it is empty" if the slot exists before anything fills it. A
     slot derived from posts that happen to repeat could never be empty, because
     there would be nothing to derive it from.
   - **Time hangs off the version, not the piece.** One draft goes out on X at
     08:00 and on LinkedIn at 11:00 the same day. A `scheduledFor` on the draft
     would have had to move both.
   - **`slotId` is nullable and has to be.** "Move it to Thursday at 14:00" is a
     one-off with a time and no standing commitment behind it.
   ───────────────────────────────────────────────────────────────────────── */

/** What a version can be. `approved` is what Lineup is allowed to schedule. */
export const VERSION_STATES = ["writing", "approved"] as const

/**
 * One piece, in your words, with the chain back to where it came from.
 *
 * Provenance is stored rather than joined: a riff can be deleted and the draft
 * should still be able to say it came out of a voice note two hours ago. The
 * ids stay so the chain can be re-linked when the riff still exists.
 */
export const draft = pgTable(
  "draft",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** What the piece is about. Not a headline. */
    idea: text("idea").notNull(),
    /** The angle from the riff this was drafted from, verbatim. */
    riffHook: text("riff_hook").notNull().default(""),
    /**
     * What kind of post this is, copied from the angle at draft time.
     *
     * Copied rather than joined, and that is the same call the two
     * `adapted_from_*` columns below make for the same reason: the riff can be
     * archived or the angle deleted, and what the user actually wrote should
     * still be able to say what it was. It is also the column `recentKinds`
     * reads, and that read must not depend on rows the user is free to throw
     * away.
     *
     * Empty for every draft written before this existed, and for one whose
     * angle had no settled kind.
     */
    kind: text("kind").notNull().default(""),
    sourceId: text("source_id").notNull().default(""),
    sourceLabel: text("source_label").notNull().default(""),
    /**
     * The post somebody else wrote that prompted this one. Empty for a draft
     * that came out of the user's own material.
     *
     * Two columns rather than a join to `source_item`, and rather than nothing
     * at all. A draft adapted from a stranger's post is the one kind this
     * product makes where the reader deserves to know what prompted it — the
     * alternative is a feed of other people's takes with no way to tell them
     * from your own thinking six months later. Stored rather than joined for
     * the reason the two fields above are: the bookmark can be deleted and the
     * draft should still be able to say where it came from.
     */
    adaptedFromUrl: text("adapted_from_url").notNull().default(""),
    adaptedFromHandle: text("adapted_from_handle").notNull().default(""),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // The read path: one user's drafts, newest first.
    index("draft_user_created_idx").on(table.userId, table.createdAt),
  ]
)

/**
 * One channel's version of a piece.
 *
 * Approval lives here, per row, for the same reason the UI approves per
 * version: these are different texts going to different places, and approving
 * them as a bundle would mean approving writing nobody read.
 */
export const draftVersion = pgTable(
  "draft_version",
  {
    id: text("id").primaryKey(),
    draftId: text("draft_id")
      .notNull()
      .references(() => draft.id, { onDelete: "cascade" }),
    /** Channel id, matching CHANNEL_RULES in lib/post-length.ts. */
    channel: text("channel").notNull(),
    label: text("label").notNull(),
    body: text("body").notNull().default(""),
    state: text("state", { enum: VERSION_STATES }).notNull().default("writing"),
    /** Null until approved. Kept so Lineup can order by what was ready first. */
    approvedAt: timestamp("approved_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // One version per channel per piece. Two LinkedIn versions of one draft is
    // not a state the product has, and a unique key is cheaper than the code
    // that would otherwise have to prevent it.
    unique("draft_version_draft_channel_key").on(table.draftId, table.channel),
    index("draft_version_draft_idx").on(table.draftId),
  ]
)

/**
 * A standing commitment: "Monday 08:00, X".
 *
 * A shape, not a date. This is what Week Plan fills on Sunday evening, and what
 * lets an empty Wednesday read as a slot going to waste rather than as a blank
 * square.
 */
export const slot = pgTable(
  "slot",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    /** ISO weekday: 1 = Monday through 7 = Sunday. */
    weekday: integer("weekday").notNull(),
    /** Zero-padded 24-hour "HH:MM". Text, so it sorts lexically as it reads. */
    timeOfDay: text("time_of_day").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    // One slot per channel per moment. Two X slots at Monday 08:00 is a
    // duplicate, not a plan.
    unique("slot_user_channel_when_key").on(
      table.userId,
      table.channel,
      table.weekday,
      table.timeOfDay
    ),
    index("slot_user_idx").on(table.userId),
  ]
)

/**
 * A post that has gone out, is going to, or tried and did not.
 *
 * `sending` is the one that looks like bookkeeping and is not. A row is moved
 * into it **before** the platform call, so two overlapping sweeps cannot both
 * send the same post, and a sweep that dies mid-publish leaves the row parked
 * somewhere nothing will pick it up again. This is the expensive lesson behind
 * every single-attempt retry policy — a publish that timed out may still have
 * succeeded, so the one thing you must not do is try it again. Here it is
 * a state instead, which has the advantage of being visible: a row sitting in
 * `sending` is the product saying "this went out, or it didn't, and I cannot
 * tell you which — go and look."
 *
 * `failed` is the opposite and needs no courage: the platform read the post and
 * refused it, in its own words, in `lastError`. Sending it again is safe.
 */
export const SCHEDULED_STATES = [
  "queued",
  "sending",
  "published",
  "failed",
] as const

/**
 * One approved version, with a time.
 *
 * **Unscheduling is a delete, not a state.** A version that is approved but has
 * no row here is exactly "waiting on Drafts for a time", which is what the
 * receipt on Lineup says out loud. Adding an `unscheduled` state would make the
 * same fact representable two ways and let them disagree.
 */
export const scheduledPost = pgTable(
  "scheduled_post",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    draftVersionId: text("draft_version_id")
      .notNull()
      .references(() => draftVersion.id, { onDelete: "cascade" }),
    /** The standing slot this fills, when it fills one. Null for a one-off. */
    slotId: text("slot_id").references(() => slot.id, { onDelete: "set null" }),
    /**
     * The moment this goes out. `timestamptz`, unlike every other column here.
     *
     * Not because the round trip was broken — drizzle writes a `Date` as
     * `toISOString()` and reads it back with `+0000`, so a naive column already
     * preserved the instant. It is because this is the one column something
     * other than drizzle will read. Publishing means `where scheduled_for <=
     * now()` on a cron, and against a naive column that comparison silently
     * depends on the database session's TimeZone setting. `timestamptz` makes
     * the column mean what it says to psql, to Studio, and to whatever writes
     * the publish job.
     *
     * The wall clock a person sees is not stored anywhere. It is derived from
     * this instant and `user.timezone`, in lib/timezone.ts, which is the only
     * arrangement where moving zones cannot corrupt what is already queued.
     */
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    state: text("state", { enum: SCHEDULED_STATES })
      .notNull()
      .default("queued"),
    /** When it actually went out. Same reasoning as `scheduledFor`. */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /**
     * When a sweep last claimed this row, set at the moment of the claim.
     *
     * The age of a `sending` row is the only evidence anyone has that it is
     * stuck rather than in flight, and without this column the answer would be
     * `createdAt`, which is when the post was scheduled and says nothing.
     */
    attemptedAt: timestamp("attempted_at", { withTimezone: true }),
    /** The platform's own words, kept for `failed`. Never paraphrased. */
    lastError: text("last_error"),
    /**
     * The live post. This is the receipt — a row that says published and cannot
     * show you the post is asking you to take our word for it.
     */
    postUrl: text("post_url"),
    /** The platform's id for it. A tweet id, or a LinkedIn URN. */
    externalId: text("external_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    // A version goes out once. Scheduling the same text twice is a mistake the
    // schema can refuse rather than the UI having to police.
    unique("scheduled_post_version_key").on(table.draftVersionId),
    // The read path: one user's week, in order.
    index("scheduled_post_user_when_idx").on(table.userId, table.scheduledFor),
    // The sweep's path, which crosses users rather than scoping to one: every
    // queued post whose moment has arrived. Without this it is a full scan
    // every few minutes, on the table that grows fastest in the product.
    index("scheduled_post_due_idx").on(table.state, table.scheduledFor),
  ]
)

export const draftRelations = relations(draft, ({ one, many }) => ({
  user: one(user, { fields: [draft.userId], references: [user.id] }),
  versions: many(draftVersion),
}))

export const draftVersionRelations = relations(
  draftVersion,
  ({ one, many }) => ({
    draft: one(draft, {
      fields: [draftVersion.draftId],
      references: [draft.id],
    }),
    scheduled: many(scheduledPost),
  })
)

export const scheduledPostRelations = relations(scheduledPost, ({ one }) => ({
  version: one(draftVersion, {
    fields: [scheduledPost.draftVersionId],
    references: [draftVersion.id],
  }),
  slot: one(slot, { fields: [scheduledPost.slotId], references: [slot.id] }),
}))

/* ── Channel connections ──────────────────────────────────────────────────
   Where the writing actually goes out. See plans/005.
   ──────────────────────────────────────────────────────────────────────── */

/** Channels Quincy can publish to today. A subset of CHANNEL_RULES. */
export const CONNECTABLE_CHANNELS = ["x", "linkedin"] as const

export type ConnectableChannel = (typeof CONNECTABLE_CHANNELS)[number]

/**
 * `active` — publish freely.
 * `needs_reauth` — the token aged out. Expected, not a fault: LinkedIn has no
 *   refresh token on self-serve, so every connection lands here every 60 days.
 * `revoked` — the person removed us upstream. Never publish again on this row.
 *
 * The distinction between the last two is the whole point of the column. One
 * is "click to continue" and the other is "you took this away from us", and
 * only the second must never be followed by another attempt.
 */
export const CONNECTION_STATES = ["active", "needs_reauth", "revoked"] as const

export type ConnectionState = (typeof CONNECTION_STATES)[number]

/**
 * A place Quincy may post as you.
 *
 * Deliberately **not** better-auth's `account` table, which is one row per way
 * of *signing in*. Three reasons, in plans/005 at length: X returns no email
 * and better-auth's link path hard-requires one; disconnecting a channel must
 * not remove a way to log in; and none of the state below has anywhere to live
 * in a table that `pnpm auth:generate` overwrites wholesale.
 *
 * Named `channel` rather than `platform` to match `draft_version.channel` and
 * `slot.channel`. Publishing joins across all three — a scheduled post carries
 * a version, the version names a channel, and this is the credential for it.
 * A second name for the same concept would put a translation step in the one
 * query that must not be subtly wrong.
 */
export const channelConnection = pgTable(
  "channel_connection",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    channel: text("channel", { enum: CONNECTABLE_CHANNELS }).notNull(),

    /**
     * The platform's own id for the account. X: `data.id` from `/2/users/me`.
     * LinkedIn: `sub` from `/v2/userinfo`, which is also what the author URN
     * `urn:li:person:{sub}` is built from.
     */
    externalId: text("external_id").notNull(),
    /**
     * For the line above a draft that says who this goes out as. LinkedIn's
     * OIDC profile has no handle, so this is null there — a connection you
     * cannot identify is one you cannot safely publish through, and the UI
     * falls back to displayName.
     */
    handle: text("handle"),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),

    /**
     * Encrypted at rest with symmetricEncrypt from better-auth/crypto, keyed
     * off BETTER_AUTH_SECRET — the same primitive that account.encryptOAuthTokens
     * uses, so there is one key and one algorithm in the system rather than two.
     * Never selected into anything that reaches a client component.
     */
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    /**
     * Space-separated, as the provider returned it — stored rather than
     * assumed. A connection made before a scope was added still exists, and
     * the publish path has to be able to tell that it cannot do the new thing.
     */
    scope: text("scope"),

    state: text("state", { enum: CONNECTION_STATES })
      .notNull()
      .default("active"),
    /** Set once when the reconnect nudge goes out, so it cannot send daily. */
    reauthNoticeSentAt: timestamp("reauth_notice_sent_at", {
      withTimezone: true,
    }),
    lastPublishedAt: timestamp("last_published_at", { withTimezone: true }),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    lastError: text("last_error"),
    /**
     * When an import of this channel's material last started. The cooldown
     * gate in lib/corpus-x.ts claims this column atomically — a single
     * conditional UPDATE — which is what makes "one import per window" hold
     * under concurrent requests on the HTTP driver (no session, no advisory
     * locks, no interactive transactions).
     */
    lastImportAt: timestamp("last_import_at", { withTimezone: true }),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // One row per channel per user, enforced by the database rather than by
    // every caller remembering to pick the right one. The application has no
    // way to address a second account on a channel — publish takes
    // (userId, channel), and the UI renders one row — so a second row was a
    // credential nothing could see and Disconnect could not remove.
    //
    // uniqueIndex rather than unique: scripts/channels.sql creates an index,
    // and a constraint of the same name would collide on the next db:push.
    uniqueIndex("channel_connection_user_channel_key").on(
      table.userId,
      table.channel
    ),
  ]
)

export const channelConnectionRelations = relations(
  channelConnection,
  ({ one }) => ({
    user: one(user, {
      fields: [channelConnection.userId],
      references: [user.id],
    }),
  })
)

/* ── Source items ─────────────────────────────────────────────────────────
   Material Quincy has read. See plans/011.
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Where a source item came from. `x` is the timeline import; the export
 * uploads and the LinkedIn DMA snapshot land in the same table under their
 * own names, which is what lets the voice compile read one query whatever
 * door the material came through.
 */
export const SOURCE_ITEM_SOURCES = [
  "x",
  "x-archive",
  "linkedin",
  "linkedin-export",
  /**
   * A post *somebody else* wrote that the user bookmarked, and a post the user
   * pasted in by hand. Both are here rather than in a table of their own
   * because they are the same fact — material Quincy has read — and the one
   * query the corpus is read by already filters on `source`.
   *
   * The distinction that matters is not where it came from, it is **whose
   * words these are**, and it is load-bearing: `compileVoice` must never see
   * these. Its `sources` parameter defaults to `["x", "x-archive"]` and every
   * caller passes the user's own sources explicitly, so a foreign post cannot
   * drift into the voice the product writes in. That default is the guard.
   */
  "x-bookmark",
  "pasted",
  /**
   * What you said on a recorded call, filtered to your own segments before it
   * ever reached a row. See plans/019.
   *
   * These *are* your own words, which is exactly the argument for adding it to
   * `compileVoice`'s sources — and the argument is wrong. Speech is not writing
   * voice: how you explain something on a call and how you write a post are
   * different instruments, and folding one into the other degrades the page
   * every draft is written from. The default above excludes this by not
   * mentioning it, which is the whole point of it being a default.
   *
   * `proof` may not be cited from here either. A sentence in a room is not
   * something you published, so it carries the same standing as chat —
   * material, never a receipt. See docs/brain.md on provenance.
   */
  "circleback",
  /**
   * A pull request you merged — the title and the description you wrote, never
   * the diff. See plans/021.
   *
   * The diff was measured against this repository's own history before it was
   * ruled out: 27 merged pull requests, median description 3,369 characters and
   * median diff 51 times larger. `MAX_TRANSCRIPT_CHARS` is 19,200, so every
   * description fits and the largest diff is sixteen times over — and the
   * description is the better material anyway, because it is the only place the
   * author already wrote down *why*.
   *
   * Same standing as `circleback` on both rules that matter. `compileVoice`
   * must not read it: a PR body is writing rather than speech, which makes the
   * temptation stronger and the answer no different — it is written for a
   * reviewer reading a diff, full of file paths and the second person, and
   * folding it into the voice would degrade every draft. And `proof` may not be
   * cited from here: a merge is checkable, but this repository is private, and
   * a receipt nobody can open is not a receipt. Published posts reach the story
   * bank through the front door docs/brain.md already describes.
   */
  "github",
  /**
   * What the world is loud about today, from the two origins that do not
   * charge for a read. See lib/signals.ts.
   *
   * These are the first sources here that nobody handed over: every value
   * above is material belonging to the user — their posts, their calls, their
   * merges, their bookmarks. These are public, they are the same rows for
   * every user who runs Trend Alerts on the same morning, and they are stored
   * per user anyway because the unique index is (user, source, external_id)
   * and a shared table would make "has this user already seen it" a join
   * against something that does not exist.
   *
   * Same two rules as `x-bookmark`, and both matter more here because nobody
   * chose this material. `compileVoice` must never read them — its `sources`
   * parameter defaults to the user's own posts, and that default is the guard.
   * And `proof` may not be cited from either: a stranger's benchmark is their
   * receipt, not yours.
   *
   * Two values rather than one "signal" so a story id and a repository name
   * cannot collide inside one external-id namespace.
   */
  "hacker-news",
  "github-repo",
] as const

export type SourceItemSource = (typeof SOURCE_ITEM_SOURCES)[number]

/**
 * One piece of material, as it arrived. A fact, not a job: there is no state
 * column because nothing here is pending — a row exists once the platform
 * handed it over, and everything downstream (the voice compile) is idempotent
 * over the whole set rather than consuming rows.
 *
 * `meta` holds the platform's own numbers (public_metrics, verbatim) and is
 * never parsed for logic — the same rule `brain_page.data` enforces in the
 * other direction. If code ever needs a metric, that is a column.
 */
export const sourceItem = pgTable(
  "source_item",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    source: text("source", { enum: SOURCE_ITEM_SOURCES }).notNull(),
    /** The platform's id — a tweet id, a LinkedIn URN. */
    externalId: text("external_id").notNull(),
    /** The live thing, for `proof` in a story page. */
    url: text("url").notNull().default(""),
    /** When the user published it. `timestamptz` — read for display and ordering. */
    postedAt: timestamp("posted_at", { withTimezone: true }),
    body: text("body").notNull().default(""),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    // Re-import is a no-op, enforced here rather than by callers remembering
    // `since_id`. The user is in the key deliberately — see brain_page.
    uniqueIndex("source_item_user_source_external_key").on(
      table.userId,
      table.source,
      table.externalId
    ),
    // The read path: one user's corpus from one source, newest first.
    index("source_item_user_source_posted_idx").on(
      table.userId,
      table.source,
      table.postedAt
    ),
  ]
)

export const sourceItemRelations = relations(sourceItem, ({ one }) => ({
  user: one(user, { fields: [sourceItem.userId], references: [user.id] }),
}))

/* ── Source connections ───────────────────────────────────────────────────
   The table lib/sources.ts promised. See plans/019.

   Its `getSourceConnections` has always been an async function returning an
   empty record, with a comment saying "when the table lands, this reads it,
   the demo branch goes, and no caller changes". This is that table, and that
   is still the contract — the signature does not move.
   ──────────────────────────────────────────────────────────────────────── */

/**
 * What a connected source is doing. The four states lib/sources.ts argued for,
 * now with somewhere to live.
 *
 * `waiting` and `broken` are the two that justify the column existing at all.
 * "Connected / not connected" is what a checkmark expresses, and it cannot
 * tell a source wired to the wrong workspace from one that is working, nor a
 * revoked one from a quiet one.
 */
export const SOURCE_CONNECTION_STATES = [
  "waiting",
  "arriving",
  "paused",
  "broken",
] as const

export type SourceConnectionState = (typeof SOURCE_CONNECTION_STATES)[number]

/**
 * A place material comes in from, and the credentials for it.
 *
 * Deliberately **not** `channel_connection` with a wider enum. That table is
 * shaped by OAuth — access token, refresh token, expiry, scope, a reauth
 * notice — because every channel on it is an OAuth grant Quincy publishes
 * through. An inbound webhook has none of those things and needs two this
 * table has instead: a routing token that appears in a URL, and a signing
 * secret the *provider* minted rather than one we were granted.
 *
 * Only what Circleback needs is here. The next source that wants an access
 * token adds the column then, having learned the shape from a real provider
 * rather than from an imagined one — the same reason `rhythm_subscription`
 * models a wall clock instead of a cron string.
 */
export const sourceConnection = pgTable(
  "source_connection",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /**
     * An id from `SOURCES` in lib/sources.ts, and not a foreign key — for the
     * same reason `rhythm_subscription.rhythm_id` is not one. The catalogue is
     * code, so a source can be added or renamed in a pull request rather than
     * in a migration.
     */
    source: text("source").notNull(),
    /**
     * The routing secret in the webhook path.
     *
     * An inbound POST carries no session and no identity — this is the only
     * thing that says whose meeting it is, which is why it is unique across
     * every user rather than per user. It is a bearer credential in a URL and
     * is treated as one: high entropy, revealed once behind a click, rotatable
     * by disconnecting.
     */
    token: text("token").notNull(),
    /**
     * The provider's own webhook secret — Circleback's `whsec_...`.
     *
     * Encrypted at rest with `symmetricEncrypt` from better-auth/crypto, keyed
     * off BETTER_AUTH_SECRET: the same primitive `channel_connection.accessToken`
     * uses, so there is one key and one algorithm in the system rather than two.
     *
     * Null until the user pastes it back, because the provider mints it and
     * only shows it after the automation exists. A null here means the endpoint
     * cannot verify anything yet and must therefore refuse everything — see
     * lib/source-connections.ts.
     */
    signingSecret: text("signing_secret"),
    state: text("state", { enum: SOURCE_CONNECTION_STATES })
      .notNull()
      .default("waiting"),
    /**
     * When material last arrived. This is what moves the row off `waiting`, and
     * it is deliberately the *arrival* rather than the connection: a source
     * that was wired up correctly and has handed over nothing looks different
     * from one that is working, which is the whole complaint in lib/sources.ts.
     */
    lastItemAt: timestamp("last_item_at", { withTimezone: true }),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    lastError: text("last_error"),
    /**
     * What this particular provider needs to identify a delivery, and nothing
     * a query is ever allowed to branch on structurally. Added by plans/021.
     *
     * GitHub forced it. A GitHub App has **one** webhook URL for every
     * installation, so the per-user token above cannot appear in the path —
     * identity arrives as `installation.id` in the body instead. That id has to
     * be stored, and so does the account login the app was installed on, which
     * is what tells a merge by you apart from a merge by a teammate.
     *
     * A jsonb rather than two columns, and the reason is the one plan 019 gave
     * for *not* pre-building the OAuth columns: the next source will need a
     * different pair, and a table that grows a column per provider becomes a
     * union of every integration ever attempted. The rule is `source_item.meta`'s
     * rule — the provider's own facts, read for display and for matching, never
     * the thing a `where` clause resolves a connection by. That is still
     * `token`, which is why GitHub stores a derived one.
     */
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // The lookup the webhook does on every request, and the reason the column
    // is globally unique: a token that resolved to two rows would be a request
    // we could not attribute.
    uniqueIndex("source_connection_token_key").on(table.token),
    // One row per source per user, enforced here rather than by every caller
    // remembering to pick one — the same argument channel_connection makes.
    uniqueIndex("source_connection_user_source_key").on(
      table.userId,
      table.source
    ),
  ]
)

export const sourceConnectionRelations = relations(
  sourceConnection,
  ({ one }) => ({
    user: one(user, {
      fields: [sourceConnection.userId],
      references: [user.id],
    }),
  })
)

/* ── Riffs ────────────────────────────────────────────────────────────────
   The step between raw material and a draft. See lib/riffs.ts for the argument
   and plans/017 for why the paste box moved here from /drafts.

   A riff is one scrap plus the angles Quincy sees in it. Two tables rather than
   angles-as-jsonb, matching the draft/draft_version split beside it and for the
   same reason: `draftAngle` is handed an angle id by a browser, and a row it
   can join back to a user is the difference between proving ownership and
   trusting the client with what gets written under someone's name.
   ──────────────────────────────────────────────────────────────────────── */

/**
 * `working` — Quincy has the scrap and has not finished reading it.
 * `failed` — it tried and could not. Added by plans/018.
 *
 * `failed` exists because voice made `working` reachable by a row that nobody
 * is watching. Until then every riff was written `ready` in the same
 * transaction as its angles, so `working` was a state the schema allowed and
 * nothing produced. A voice note leaves a row behind *before* the transcript
 * exists, which means the two-phase question the previous plan deferred —
 * "what does a card that hangs forever say?" — has to be answered now rather
 * than later. A skeleton with no terminal state is worse than ten honest
 * seconds; a skeleton that can become "Quincy could not make this out" and
 * offer a retry is better than both.
 */
/**
 * `archived` is "you decided this was not worth writing", and it keeps the row.
 *
 * The riff holds what the person actually said — a typed note, a transcript, a
 * pull request description. The angles under it are Quincy's suggestions and
 * cost a model call to make again; the scrap cost somebody a thought and cannot
 * be reproduced. So "Nothing here" hides the card and destroys nothing, which
 * is also what makes it safe to press without a confirmation dialog.
 *
 * No migration: the column is `text` and this list is a TypeScript narrowing,
 * so Postgres has always accepted the value.
 */
export const RIFF_STATES = ["working", "ready", "failed", "archived"] as const

export const riff = pgTable(
  "riff",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** The raw material, close to verbatim. What you actually said — or, for
     *  an adapted riff, what somebody else actually wrote. */
    scrap: text("scrap").notNull(),
    /** Source id from lib/sources.ts, so the chain stays legible on screen. */
    sourceId: text("source_id").notNull().default(""),
    sourceLabel: text("source_label").notNull().default(""),
    /**
     * The delivery this riff came out of, when there was one. See plans/026.
     *
     * `sourceId` beside it holds the *kind* — "github" — which is what the card
     * renders and what nothing can be joined on. This is the `source_item` row,
     * so a riff can be traced back to the merge that made it and the merge's
     * own numbers can be read again without the workflow having to carry them
     * forward a second time. Empty for a riff somebody typed or pasted; there
     * is no row upstream of those.
     */
    sourceItemId: text("source_item_id").notNull().default(""),
    /**
     * What the writer should know about the material that is not the material.
     *
     * `scrap` is what was said. This is what it was said *about* — for a merge,
     * `{ forUser, facts }`: the sentence the selection wrote about what changed
     * for a user of the product, plus the repository's description, homepage
     * and topics and the merge's own counts. Twelve angles from four merges
     * produced zero drafts on 2026-08-24, and part of the reason is that
     * `generateDraft` had never been told what the product *is*: it saw a hook,
     * a pull request description and a brain, and wrote around the subject.
     *
     * Never parsed for logic beyond reading strings out of it — the same
     * contract `source_item.meta` carries, and it matters more here because
     * this is prompt input. A shape that changes upstream has to degrade to a
     * shorter prompt, never to a throw on a page somebody is watching.
     */
    context: jsonb("context")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    /**
     * Whose post this came out of, when it came out of somebody else's.
     *
     * The same pair `draft` carries, and carried here too rather than only
     * there: the riff is where you decide, and "this idea is borrowed" is a
     * fact you need at the moment of deciding, not after the writing exists.
     */
    adaptedFromUrl: text("adapted_from_url").notNull().default(""),
    adaptedFromHandle: text("adapted_from_handle").notNull().default(""),
    state: text("state", { enum: RIFF_STATES }).notNull().default("working"),
    /**
     * Why it failed, in the user's words rather than the exception's.
     *
     * On the row rather than only in the log because the person who has to
     * decide whether to re-record is looking at the card, not at Vercel. Empty
     * for every state but `failed`.
     */
    failure: text("failure").notNull().default(""),
    /**
     * When the work started, for the stuck-state story.
     *
     * Distinct from `created_at`, which is when the row appeared — the same
     * instant today, but a queued run would separate them and the question
     * "has this been working too long?" is about the work, not the row.
     * Null for a riff that never had a background phase, which is every riff
     * the paste box makes.
     */
    startedAt: timestamp("started_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // The read path: one user's working queue, newest first.
    index("riff_user_created_idx").on(table.userId, table.createdAt),
    // Idempotency for the Bookmarks rhythm, which re-reads the same bookmarks
    // every run. Partial would be better; Postgres cannot express it through
    // drizzle's builder, so `createRiffFromPost` checks before inserting and
    // this index is what makes that check cheap.
    index("riff_user_adapted_from_idx").on(table.userId, table.adaptedFromUrl),
  ]
)

/**
 * What a riff could become. Never a finished post — a direction plus a hook.
 *
 * No `status` column. An angle is drafted exactly when a draft carries its
 * hook (`draft.riff_hook`), which lib/riffs.ts already derives — storing it
 * twice would give two rows the chance to disagree about whether something
 * was written.
 */
export const riffAngle = pgTable(
  "riff_angle",
  {
    id: text("id").primaryKey(),
    riffId: text("riff_id")
      .notNull()
      .references(() => riff.id, { onDelete: "cascade" }),
    /** The opening line, which is the whole bet on any platform. */
    hook: text("hook").notNull(),
    /** Shape, not platform: "Short post" | "Thread" | "Carousel" | "Essay". */
    shape: text("shape").notNull(),
    /**
     * What the post *is*, from `ANGLE_KINDS` in lib/adapt.ts.
     *
     * Text with a default rather than an enum, the same call `shape` and
     * `RIFF_STATES` make: the list is a judgment about content and it will be
     * revised, and a revision should be a pull request rather than a migration.
     *
     * **Empty is a real value.** Every angle written before this column existed
     * has none, and a model that answers off-list gets emptied rather than
     * guessed at — see `settleKind`. Readers must treat it as "unknown" and not
     * as a kind.
     */
    kind: text("kind").notNull().default(""),
    /** One line on why this angle is worth writing. Quincy's reasoning, shown. */
    why: text("why").notNull().default(""),
    /** Render order, so the model's ranking survives the round trip. */
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("riff_angle_riff_idx").on(table.riffId, table.position)]
)

export const riffRelations = relations(riff, ({ one, many }) => ({
  user: one(user, { fields: [riff.userId], references: [user.id] }),
  angles: many(riffAngle),
}))

export const riffAngleRelations = relations(riffAngle, ({ one }) => ({
  riff: one(riff, { fields: [riffAngle.riffId], references: [riff.id] }),
}))

/* ── Rhythms ──────────────────────────────────────────────────────────────
   What Quincy does on its own, once somebody has switched it on. See plans/016.

   The catalogue stays in lib/rhythms.ts — it is code, and a row exists only
   for a rhythm a user has actually enabled. That split is what lets a rhythm
   be added, renamed or removed in a pull request rather than a migration, and
   it is why `rhythm_id` below is not a foreign key.
   ───────────────────────────────────────────────────────────────────────── */

/** What a run left behind. Four outcomes, and three of them are not failures. */
export const RHYTHM_RUN_STATES = [
  "ok",
  "failed",
  /** Never ran: unentitled, or the catalogue no longer has a handler for it. */
  "skipped",
  /** Its window closed before the dispatcher reached it. See MAX_LATENESS_MS. */
  "missed",
] as const

export type RhythmRunState = (typeof RHYTHM_RUN_STATES)[number]

/**
 * One user's standing instruction: "run this, at this hour, in my zone".
 *
 * **A wall clock and a weekday, never a cron string.** lib/timezone.ts's header
 * records what a stored UTC hour cost us once already — an 08:00 slot that was
 * right on screen and two hours wrong in the world. `slot` models a standing
 * commitment exactly this way, and two representations of "when" in one product
 * is one too many. The zone is not stored here either: it is `user.timezone`,
 * read at dispatch, so a user who moves does not leave a trail of subscriptions
 * pinned to a country they left.
 */
export const rhythmSubscription = pgTable(
  "rhythm_subscription",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /**
     * A catalogue id from RHYTHMS in lib/rhythms.ts. Deliberately not a foreign
     * key: a row whose rhythm has been removed from the catalogue is a no-op
     * the dispatcher reports and skips, which is a better failure than a
     * migration that has to run before a deploy can land.
     */
    rhythmId: text("rhythm_id").notNull(),
    /** 0–23, on the user's own clock. */
    hour: integer("hour").notNull(),
    /** 0–59, same clock. */
    minute: integer("minute").notNull(),
    /** ISO weekday 1–7, matching WEEKDAYS in lib/slots.ts. Null means daily. */
    weekday: integer("weekday"),
    /**
     * Off without forgetting the time. Deleting the row would work and would
     * also throw away the hour the user chose, so switching a rhythm off and
     * on again would silently move it back to the default.
     */
    enabled: boolean("enabled").notNull().default(true),
    /**
     * The dispatcher's cursor. `timestamptz` for the reason
     * `scheduled_post.scheduled_for` is: this column is compared against
     * `now()` by something other than Drizzle, and against a naive column that
     * comparison depends on the session's TimeZone setting.
     *
     * Denormalised from (hour, minute, weekday, user.timezone), which means it
     * has to be recomputed whenever any of those change — including the
     * timezone, which is the one that is easy to forget. See
     * `rescheduleForUser` in lib/rhythm-run.ts.
     */
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    /**
     * Held while a run is in flight, so two overlapping cron ticks cannot both
     * run the same subscription. Unlike `scheduled_post.claimedAt`, an
     * abandoned claim here is safe to reclaim after STALE_CLAIM_MS — nothing a
     * rhythm does reaches the outside world. A handler that changes that has
     * to change this rule with it.
     */
    runningSince: timestamp("running_since", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // Two subscriptions to one rhythm is not a state the product has, and a
    // unique key is cheaper than the code that would otherwise prevent it.
    unique("rhythm_subscription_user_rhythm_key").on(
      table.userId,
      table.rhythmId
    ),
    // The dispatcher's path, which crosses users rather than scoping to one.
    // Without it this is a full scan every fifteen minutes.
    index("rhythm_subscription_due_idx").on(table.enabled, table.nextRunAt),
    // The /rhythm page's path: one user's switches.
    index("rhythm_subscription_user_idx").on(table.userId),
  ]
)

/**
 * What happened, each time one fired.
 *
 * The receipt half of the same argument docs/vision.md makes against a
 * dashboard: a rhythm should be able to show you the runs it made and what
 * each one left behind, not a count. `summary` is one line a person can read —
 * never a stack trace, because this renders on a card.
 */
export const rhythmRun = pgTable(
  "rhythm_run",
  {
    id: text("id").primaryKey(),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => rhythmSubscription.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    rhythmId: text("rhythm_id").notNull(),
    state: text("state", { enum: RHYTHM_RUN_STATES }).notNull(),
    summary: text("summary").notNull().default(""),
    /** True when a person pressed "Run now" rather than the clock firing. */
    manual: boolean("manual").notNull().default(false),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    // The read path: one subscription's history, newest first.
    index("rhythm_run_subscription_idx").on(
      table.subscriptionId,
      table.startedAt
    ),
    // The /rhythm page loads every card's last run in one query.
    index("rhythm_run_user_started_idx").on(table.userId, table.startedAt),
  ]
)

export const rhythmSubscriptionRelations = relations(
  rhythmSubscription,
  ({ one, many }) => ({
    user: one(user, {
      fields: [rhythmSubscription.userId],
      references: [user.id],
    }),
    runs: many(rhythmRun),
  })
)

export const rhythmRunRelations = relations(rhythmRun, ({ one }) => ({
  subscription: one(rhythmSubscription, {
    fields: [rhythmRun.subscriptionId],
    references: [rhythmSubscription.id],
  }),
  user: one(user, { fields: [rhythmRun.userId], references: [user.id] }),
}))

/* ── Video ────────────────────────────────────────────────────────────────
   The pillar-to-clips half of the atomiser. One recording comes in, gets cut,
   and leaves as several platform-specific pieces.

   Two tables and a deliberate split between them: a **project** is an edit, an
   **asset** is a file. Assets are content-addressed and shared, because the
   same recording feeds a TikTok cut and a Shorts cut and must not be probed,
   transcoded or transcribed twice.
   ──────────────────────────────────────────────────────────────────────── */

/**
 * The edit document, stored whole.
 *
 * `document` is jsonb and is authoritative — the same object the preview, the
 * renderer and the agent read (see lib/editor/types.ts). It is deliberately not
 * normalised into clip and track tables. Every read wants the whole timeline,
 * every write is a batch, and a relational shape would mean a join per lane to
 * rebuild something the client holds in memory anyway.
 *
 * `revision` is optimistic concurrency, not a version history. A write states
 * the revision it read and loses if the document moved, which is what stops a
 * slow agent run from overwriting a drag made while it was thinking.
 *
 * `lock` is held for the length of an agent run. See DocumentLock for why a
 * lock rather than a merge.
 */
export const videoProject = pgTable(
  "video_project",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Untitled"),
    document: jsonb("document").$type<VideoDocument>().notNull(),
    /** Bumped by every applied batch. Starts at 0, never reused. */
    revision: integer("revision").notNull().default(0),
    lock: jsonb("lock").$type<DocumentLock>().notNull(),
    /** R2 key of the poster frame. Null until the first render of frame one. */
    thumbnailKey: text("thumbnail_key"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // The project list: one user's edits, most recently touched first.
    index("video_project_user_updated_idx").on(table.userId, table.updatedAt),
  ]
)

/**
 * Ingest states, in the order they happen.
 *
 * `uploaded` is bytes in R2 and nothing else known. `probed` means we have the
 * shape. `ready` means the proxy exists and the editor can open it — the
 * transcript deliberately does not gate it, because scrubbing footage while
 * Deepgram is still running is useful and waiting for it is not.
 */
export const VIDEO_ASSET_STATES = [
  "uploaded",
  "probed",
  "processing",
  "ready",
  "failed",
] as const

export type VideoAssetState = (typeof VIDEO_ASSET_STATES)[number]

/**
 * One media file and everything derived from it.
 *
 * Keyed by content hash, so re-uploading the same recording is free and two
 * projects cutting the same talk share one proxy and one transcript. That is
 * also why the asset is not owned by a project — it belongs to the user.
 *
 * The editor never touches `storageKey`. It reads `proxyKey`, which is H.264
 * 8-bit yuv420p at a constant frame rate, because the alternative is meeting
 * every codec a phone can produce in the browser's decode path. Originals are
 * kept for the final render only.
 */
export const videoAsset = pgTable(
  "video_asset",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    state: text("state", { enum: VIDEO_ASSET_STATES })
      .notNull()
      .default("uploaded"),
    /** As uploaded, for display. Never used to identify the file. */
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    /** `xxh3-128:<bytes>:<hash>`. The identity of the file. */
    contentHash: text("content_hash").notNull(),
    /** Bytes. bigint because a 4K screen recording clears the int4 ceiling. */
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),

    storageKey: text("storage_key").notNull(),
    proxyKey: text("proxy_key"),
    /** Keyframe offsets and audio peaks. Drawn by the timeline every render. */
    seekIndexKey: text("seek_index_key"),
    thumbnailKey: text("thumbnail_key"),
    /**
     * The sprite sheet the spine tiles across its clips, and its geometry.
     *
     * The geometry is stored rather than assumed because the sheet is planned
     * from the duration: a fifteen-second clip and a ten-minute talk get
     * different intervals, and the tile count is capped. A constant in the
     * client would be right until the first asset that planned differently, and
     * then quietly wrong for that one forever.
     */
    filmstripKey: text("filmstrip_key"),
    filmstripTiles: integer("filmstrip_tiles"),
    filmstripIntervalUs: bigint("filmstrip_interval_us", { mode: "number" }),
    filmstripTileWidth: integer("filmstrip_tile_width"),
    filmstripTileHeight: integer("filmstrip_tile_height"),

    /* Probe output. Columns rather than a blob because the editor branches on
       all of them: rotation decides the display matrix, fps decides frame
       snapping, hasAudio decides whether a transcript is even attempted. */
    durationUs: bigint("duration_us", { mode: "number" }),
    width: integer("width"),
    height: integer("height"),
    fps: integer("fps"),
    /** Degrees from the container matrix. Phones shoot sideways constantly. */
    rotation: integer("rotation").notNull().default(0),
    hasAudio: boolean("has_audio").notNull().default(false),

    /**
     * Deepgram's response, verbatim. Word timestamps are read constantly and
     * the shape is the provider's, so parsing it into columns would be
     * re-deriving something the caption builder already reads whole.
     */
    transcript: jsonb("transcript").$type<Record<string, unknown>>(),
    transcriptProvider: text("transcript_provider"),
    transcribedAt: timestamp("transcribed_at", { withTimezone: true }),

    /**
     * Gemini Files handle for visual questions — b-roll placement, best-take
     * selection, scene boundaries. Expires in 48 hours, so the handle is stored
     * with its expiry and re-uploaded on demand rather than assumed live.
     *
     * Nothing in the first cut reads this. Silence removal, captions and
     * ducking are all transcript work; vision earns its place later. The
     * plumbing is here from the start because retrofitting ingest means
     * reprocessing the whole library.
     */
    geminiFileUri: text("gemini_file_uri"),
    geminiExpiresAt: timestamp("gemini_expires_at", { withTimezone: true }),

    /** Why it failed, shown to the user. Null unless state is `failed`. */
    error: text("error"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // Re-upload is a no-op. The user is in the key so two accounts uploading
    // the same file each get a row, matching brain_page and source_item.
    uniqueIndex("video_asset_user_hash_key").on(
      table.userId,
      table.contentHash
    ),
    index("video_asset_user_created_idx").on(table.userId, table.createdAt),
    // The ingest worker's queue: everything not yet finished, oldest first.
    index("video_asset_state_idx").on(table.state, table.createdAt),
  ]
)

export const videoProjectRelations = relations(videoProject, ({ one }) => ({
  user: one(user, { fields: [videoProject.userId], references: [user.id] }),
}))

export const videoAssetRelations = relations(videoAsset, ({ one }) => ({
  user: one(user, { fields: [videoAsset.userId], references: [user.id] }),
}))

/**
 * The waitlist. One row per address, from the moment `/` stopped being a
 * signup page. See plans/023.
 *
 * **No user reference, and it must stay that way.** A row here is a stranger,
 * and most of them will never become a `user`. Joining the two would make the
 * waitlist a view of accounts, which is exactly backwards — the point of the
 * table is the people who do not have one yet. `redeemedAt` records that a
 * code was spent; the account it created is found by email, not by a key.
 *
 * `email` is stored trimmed and lowercased, so the UNIQUE constraint is a
 * plain one rather than an expression index. Normalising on write is what we
 * want regardless: an address that differs only in case is the same inbox, and
 * a second row for it means a second invite to one person.
 */
export const waitlist = pgTable(
  "waitlist",
  {
    id: text("id").primaryKey(),
    /** Trimmed and lowercased by `lib/waitlist.ts`. Never write it raw. */
    email: text("email").notNull().unique(),
    /** Which surface it came from, so a campaign can be told from the page. */
    source: text("source").notNull().default("landing"),
    /**
     * `sha256(ip + WAITLIST_IP_SALT)`, and never the address itself.
     *
     * A per-IP cooldown needs to recognise a repeat caller; it does not need to
     * know who they are. The hash gives the first without the second, so the
     * table holds no identifier that has to appear in the privacy policy or be
     * deleted on request. The salt is what stops the hash being reversible by
     * enumeration — there are only four billion IPv4 addresses, and an unsalted
     * sha256 of one is not anonymous at all.
     */
    ipHash: text("ip_hash"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Set when an invite is sent. Null means still waiting. */
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    /** The code in the invite link. Null until invited, unique when set. */
    inviteCode: text("invite_code"),
    inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
    /** Set when the code was spent on a signup. A code is single use. */
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    /** For a human note against a row: who they are, why they are next. */
    note: text("note").notNull().default(""),
  },
  (table) => [
    // The invite path: oldest first, because the order people asked is the
    // order they are let in, and that promise is on the page.
    index("waitlist_created_idx").on(table.createdAt),
    // The cooldown read: this caller, recently.
    index("waitlist_ip_created_idx").on(table.ipHash, table.createdAt),
    // A code identifies exactly one row. Partial on purpose — every row that
    // has not been invited carries NULL here, and a plain unique index would
    // be satisfied by those but says nothing useful about them.
    uniqueIndex("waitlist_invite_code_idx")
      .on(table.inviteCode)
      .where(sql`${table.inviteCode} is not null`),
  ]
)
