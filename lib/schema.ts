import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  bigint,
  timestamp,
  boolean,
  integer,
  index,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  stripeCustomerId: text("stripe_customer_id"),
  trialEndsAt: timestamp("trial_ends_at"),
  timezone: text("timezone"),
  /**
   * When first run finished, or was skipped. Null means "has not been asked".
   * See plans/022.
   *
   * Deliberately not derived from whether the brain is empty. A person who
   * skips every question has an empty brain, so a derived check would send
   * them back through the interview on every visit forever. This column
   * answers "have they been asked"; the brain answers "what do we know".
   *
   * `withTimezone`, unlike its neighbours in this table. The naked timestamps
   * around it are what better-auth's generator emitted; every column the app
   * has added for itself in lib/schema-app.ts is timestamptz, and this is an
   * instant rather than a wall-clock time. The declaration has to say so or it
   * disagrees with the column scripts/onboarded-at.sql actually creates.
   */
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const subscription = pgTable("subscription", {
  id: text("id").primaryKey(),
  plan: text("plan").notNull(),
  referenceId: text("reference_id").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status: text("status").default("incomplete"),
  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),
  trialStart: timestamp("trial_start"),
  trialEnd: timestamp("trial_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  cancelAt: timestamp("cancel_at"),
  canceledAt: timestamp("canceled_at"),
  endedAt: timestamp("ended_at"),
  seats: integer("seats"),
  billingInterval: text("billing_interval"),
  stripeScheduleId: text("stripe_schedule_id"),
});

export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/* ------------------------------------------------------------------------- *
 * HAND-WRITTEN BLOCK — the MCP plugin's three tables.
 *
 * Everything above this line came out of `pnpm auth:generate`. These three did
 * not, and the reason is written down rather than assumed: this repository has
 * one Neon branch and it is production (AGENTS.md, "There is one database"), so
 * the generator and `db:push` were not run to add them. The declarations below
 * are transcribed by hand from the plugin's own schema
 * (`better-auth/plugins/oidc-provider/schema` — the MCP plugin reuses it
 * unchanged) and the matching DDL is `scripts/mcp-oauth.sql`.
 *
 * **The owner should re-run `pnpm auth:generate` to confirm this block.** It is
 * written to be byte-comparable with what the generator would emit: same model
 * keys, same column names, same nullability. If the generator disagrees, the
 * generator is right and this block goes.
 *
 * The export names matter more than the table names. `better-auth`'s drizzle
 * adapter looks a model up as `schema[modelName]`, so `oauthApplication`,
 * `oauthAccessToken` and `oauthConsent` are what it asks for; the snake_case
 * table names follow the convention `rate_limit` above already sets.
 * ------------------------------------------------------------------------- */

export const oauthApplication = pgTable(
  "oauth_application",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    icon: text("icon"),
    metadata: text("metadata"),
    // Unique because oauth_access_token and oauth_consent both reference it
    // rather than referencing the row id — the plugin looks clients up by the
    // id it handed the client, which is this column.
    clientId: text("client_id").notNull().unique(),
    // Empty string for a public (PKCE-only) client, which is what every MCP
    // client registers as.
    clientSecret: text("client_secret"),
    // Comma-separated on purpose: the plugin joins and splits on "," itself.
    redirectUrls: text("redirect_urls").notNull(),
    type: text("type").notNull(),
    disabled: boolean("disabled").default(false),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [index("oauth_application_userId_idx").on(table.userId)],
);

export const oauthAccessToken = pgTable(
  "oauth_access_token",
  {
    id: text("id").primaryKey(),
    // The bearer token an MCP client sends. Looked up on every tool call, so
    // the unique constraint is also the index that read needs.
    accessToken: text("access_token").notNull().unique(),
    refreshToken: text("refresh_token").notNull().unique(),
    accessTokenExpiresAt: timestamp("access_token_expires_at").notNull(),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at").notNull(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthApplication.clientId, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    // Space-separated. lib/mcp.ts is the only thing that reads them and it
    // splits on whitespace.
    scopes: text("scopes").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("oauth_access_token_clientId_idx").on(table.clientId),
    index("oauth_access_token_userId_idx").on(table.userId),
  ],
);

export const oauthConsent = pgTable(
  "oauth_consent",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthApplication.clientId, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    scopes: text("scopes").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    consentGiven: boolean("consent_given").notNull(),
  },
  (table) => [
    index("oauth_consent_clientId_idx").on(table.clientId),
    index("oauth_consent_userId_idx").on(table.userId),
  ],
);

/* ----------------------------- end of block ------------------------------ */

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));
