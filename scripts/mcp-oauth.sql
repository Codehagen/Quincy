-- MCP over OAuth: the eight tables `@better-auth/mcp` 1.7 needs.
-- See docs/mcp.md.
--
-- Mirrors the generated declarations in lib/schema.ts exactly — same column
-- names, same types, same nullability, same foreign keys, same index names.
-- That file is the output of `pnpm auth:generate`; this is the DDL that makes
-- the database agree with it.
--
-- **Nothing is dropped and nothing is migrated.** The three-table version this
-- replaces (`oauth_application`, and earlier shapes of `oauth_access_token`
-- and `oauth_consent`) was written for Better Auth 1.6 and was never applied,
-- so there is no `oauth_application` row anywhere and no client data to move.
-- The upgrade guide's "provider client store" migration — copy
-- `oauth_application` into `oauth_client` — does not apply for that reason. If
-- that ever stops being true, check before running: this script creates
-- `oauth_access_token` and `oauth_consent` with 1.7's shape and IF NOT EXISTS
-- would silently leave a 1.6 table standing.
--
-- APPLIED. This file is now only for a fresh database: the live one was created
-- from an earlier version of it and is brought to the 1.7 shape by
-- scripts/account-issuer.sql, which sets the NOT NULLs below and renames the
-- unique index. Everything here stays IF NOT EXISTS so a re-run against the
-- corrected database is a no-op rather than a conflict.
--
-- There is one database and running this is the production migration — see
-- AGENTS.md, "There is one database".
--
-- Every statement is IF NOT EXISTS. A second run changes nothing.
--
-- Order matters: `oauth_client` and `oauth_resource` are referenced by
-- everything after them, and `oauth_refresh_token` is referenced by
-- `oauth_access_token`.

-- The signing keyring for the `jwt` plugin.
--
-- Not optional and not incidental: a 1.7 access token bound to a resource is a
-- JWT signed with a key from this table and verified by `requireMcpAuth`
-- against /api/auth/jwks. With no table there is no key, and the first
-- authorization fails at the token endpoint.
--
-- `alg` and `crv` are the 1.7 additions that let one keyring hold more than
-- one algorithm, so a resource can pin its own.
CREATE TABLE IF NOT EXISTS "jwks" (
  "id" text PRIMARY KEY NOT NULL,
  "public_key" text NOT NULL,
  "private_key" text NOT NULL,
  "created_at" timestamp NOT NULL,
  "expires_at" timestamp,
  "alg" text,
  "crv" text
);

-- The registered client. One row per MCP client this server has ever issued a
-- client id to — whether the owner registered it on /settings or CIMD created
-- it from a Client ID Metadata Document.
--
-- A row here grants nothing. It is a client id and, for a confidential client,
-- a hashed secret; access needs a signed-in person to complete the
-- authorization code flow and consent.
--
-- `user_id` is null for a CIMD client: it belongs to a domain rather than to an
-- account, which is why /settings lists agents by consent rather than by
-- ownership.
CREATE TABLE IF NOT EXISTS "oauth_client" (
  "id" text PRIMARY KEY NOT NULL,

  -- Unique because every other table references *this* column rather than
  -- "id": the provider looks a client up by the id it handed out.
  "client_id" text NOT NULL UNIQUE,

  -- Hashed, never the value the client holds. Null for a public client, which
  -- is what every MCP client is (token_endpoint_auth_method "none").
  "client_secret" text,

  -- The Client ID Metadata Document URL a CIMD client was created from. Null
  -- for a client registered by a person.
  "client_discovery_id" text,

  "disabled" boolean DEFAULT false,

  -- Never set by this app. A client with skip_consent bypasses /consent, which
  -- is the one screen standing between a program and this account.
  "skip_consent" boolean,

  "enable_end_session" boolean,
  "subject_type" text,

  -- Null means "anything this server advertises", which is what registration
  -- on /settings deliberately leaves it as. The person still chooses on
  -- /consent.
  "scopes" text[],

  "client_credentials_scopes" text[] DEFAULT '{}',
  "user_id" text REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" timestamp,
  "updated_at" timestamp,
  "name" text,
  "uri" text,
  "icon" text,
  "contacts" text[],
  "tos" text,
  "policy" text,
  "software_id" text,
  "software_version" text,
  "software_statement" text,

  -- A real array now, not a comma-joined string. Exact matching at
  -- authorization is what makes this the security-relevant column.
  "redirect_uris" text[] NOT NULL,

  "post_logout_redirect_uris" text[],
  "backchannel_logout_uri" text,
  "backchannel_logout_session_required" boolean,
  "token_endpoint_auth_method" text,

  -- web | native. Decides which redirect URIs are legal for this client:
  -- web refuses loopback, native refuses https loopback.
  "application_type" text,

  "jwks" text,
  "jwks_uri" text,
  "grant_types" text[],
  "response_types" text[],
  "require_pkce" boolean,
  "dpop_bound_access_tokens" boolean DEFAULT false,
  "reference_id" text,
  "metadata" jsonb
);

CREATE INDEX IF NOT EXISTS "oauthClient_userId_idx"
  ON "oauth_client" ("user_id");

-- A protected resource this server issues audience-bound tokens for.
--
-- One row here in practice: the MCP endpoint. The provider seeds it at boot
-- from the plugin's `resource` option, and tolerates this table being absent by
-- deferring the seed — which is why the app still starts before this script has
-- run, and why the first authorization after it runs is what actually creates
-- the row.
CREATE TABLE IF NOT EXISTS "oauth_resource" (
  "id" text PRIMARY KEY NOT NULL,

  -- The RFC 8707 `resource` value, and the `aud` claim on every token issued
  -- for it. For this deployment: <BETTER_AUTH_URL>/api/mcp.
  "identifier" text NOT NULL UNIQUE,

  "name" text NOT NULL,
  "access_token_ttl" integer,
  "refresh_token_ttl" integer,
  "signing_algorithm" text,
  "signing_key_id" text,
  "allowed_scopes" text[],
  "custom_claims" jsonb,
  "dpop_bound_access_tokens_required" boolean DEFAULT false,
  "disabled" boolean DEFAULT false,
  "created_at" timestamp,
  "updated_at" timestamp,
  "policy_version" integer DEFAULT 1,
  "metadata" jsonb
);

-- Which clients may ask for which resources. Authoritative because
-- `enforcePerClientResources` defaults to true in 1.7: a client with no row
-- here for the MCP resource cannot get a token for it.
--
-- Written by the provider itself on every registration, from
-- `clientRegistrationDefaultResources` — which `mcp()` seeds with its own
-- resource. Nothing in this app writes it by hand.
CREATE TABLE IF NOT EXISTS "oauth_client_resource" (
  "id" text PRIMARY KEY NOT NULL,
  "client_id" text NOT NULL
    REFERENCES "oauth_client"("client_id") ON DELETE CASCADE,
  "resource_id" text NOT NULL
    REFERENCES "oauth_resource"("identifier") ON DELETE CASCADE,
  "metadata" jsonb,
  "created_at" timestamp
);

CREATE INDEX IF NOT EXISTS "oauthClientResource_clientId_idx"
  ON "oauth_client_resource" ("client_id");

CREATE INDEX IF NOT EXISTS "oauthClientResource_resourceId_idx"
  ON "oauth_client_resource" ("resource_id");

-- The uniqueness the linkage check assumes: one row per (client, resource).
-- Declared as a unique index rather than a constraint so IF NOT EXISTS applies.
--
-- The `_uidx` suffix is the name the 1.7 generator gives it and the name
-- lib/schema.ts declares. A database created before that regeneration carries
-- the old `_idx` name and is corrected by scripts/account-issuer.sql, which
-- renames it; this file only ever has to be right for a fresh database, and
-- IF NOT EXISTS makes it a no-op on one that has already been renamed.
CREATE UNIQUE INDEX IF NOT EXISTS "oauthClientResource_clientId_resourceId_uidx"
  ON "oauth_client_resource" ("client_id", "resource_id");

-- The refresh token, stored hashed. This is the row that matters for
-- revocation: the access token is a signed JWT with nothing behind it, so
-- setting "revoked" here is what actually ends a connection.
--
-- "rotated_at" and the two rotation_replay columns are the 30-second reuse
-- window: a refresh retried inside it replays the stored response instead of
-- being treated as a replay attack.
CREATE TABLE IF NOT EXISTS "oauth_refresh_token" (
  "id" text PRIMARY KEY NOT NULL,
  "token" text NOT NULL UNIQUE,
  "client_id" text NOT NULL
    REFERENCES "oauth_client"("client_id") ON DELETE CASCADE,
  "session_id" text REFERENCES "session"("id") ON DELETE SET NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "reference_id" text,
  "authorization_code_id" text,
  "resources" text[],
  "requested_user_info_claims" text[],

  -- NOT NULL in the 1.7 schema. The provider writes both on every insert; the
  -- generator only started declaring it in 1.7, so a database created from the
  -- earlier shape of this file is corrected by scripts/account-issuer.sql.
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL,

  "revoked" timestamp,
  "rotated_at" timestamp,
  "rotation_replay_response" text,
  "rotation_replay_expires_at" timestamp,
  "auth_time" timestamp,
  "confirmation" jsonb,
  "scopes" text[] NOT NULL
);

CREATE INDEX IF NOT EXISTS "oauthRefreshToken_clientId_idx"
  ON "oauth_refresh_token" ("client_id");

CREATE INDEX IF NOT EXISTS "oauthRefreshToken_sessionId_idx"
  ON "oauth_refresh_token" ("session_id");

CREATE INDEX IF NOT EXISTS "oauthRefreshToken_userId_idx"
  ON "oauth_refresh_token" ("user_id");

CREATE INDEX IF NOT EXISTS "oauthRefreshToken_authorizationCodeId_idx"
  ON "oauth_refresh_token" ("authorization_code_id");

-- The opaque access token, stored hashed — and normally empty in this
-- deployment.
--
-- Every MCP token names a resource, and a resource-bound token is a JWT rather
-- than a row. This table fills only for a grant that asked for no resource. It
-- still has to exist: the provider reads it at introspection and revocation,
-- and /settings joins it when working out when a client last took a key.
CREATE TABLE IF NOT EXISTS "oauth_access_token" (
  "id" text PRIMARY KEY NOT NULL,

  -- NOT NULL in the 1.7 schema, like the three below. See the note on
  -- oauth_refresh_token above.
  "token" text NOT NULL UNIQUE,
  "client_id" text NOT NULL
    REFERENCES "oauth_client"("client_id") ON DELETE CASCADE,
  "session_id" text REFERENCES "session"("id") ON DELETE SET NULL,
  "user_id" text REFERENCES "user"("id") ON DELETE CASCADE,
  "reference_id" text,
  "authorization_code_id" text,
  "resources" text[],
  "requested_user_info_claims" text[],
  "refresh_id" text REFERENCES "oauth_refresh_token"("id") ON DELETE CASCADE,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL,
  "revoked" timestamp,
  "confirmation" jsonb,
  "scopes" text[] NOT NULL
);

CREATE INDEX IF NOT EXISTS "oauthAccessToken_clientId_idx"
  ON "oauth_access_token" ("client_id");

CREATE INDEX IF NOT EXISTS "oauthAccessToken_sessionId_idx"
  ON "oauth_access_token" ("session_id");

CREATE INDEX IF NOT EXISTS "oauthAccessToken_userId_idx"
  ON "oauth_access_token" ("user_id");

CREATE INDEX IF NOT EXISTS "oauthAccessToken_authorizationCodeId_idx"
  ON "oauth_access_token" ("authorization_code_id");

CREATE INDEX IF NOT EXISTS "oauthAccessToken_refreshId_idx"
  ON "oauth_access_token" ("refresh_id");

-- What a person agreed to give a client. Written at consent and read on every
-- later authorization: a request whose scopes this row already covers is
-- granted without a screen, and one that asks for more is not.
--
-- Deleting a row here is what "Remove" on /settings does first, and it is why
-- a removed agent has to be consented to again rather than reconnecting
-- silently.
--
-- `user_id` is nullable in 1.7 because a consent can be held by a
-- `reference_id` — an organization — instead. This app has no organizations,
-- so every row here has a user.
CREATE TABLE IF NOT EXISTS "oauth_consent" (
  "id" text PRIMARY KEY NOT NULL,
  "client_id" text NOT NULL
    REFERENCES "oauth_client"("client_id") ON DELETE CASCADE,
  "user_id" text REFERENCES "user"("id") ON DELETE CASCADE,
  "reference_id" text,
  "resources" text[],
  "requested_user_info_claims" text[],
  "scopes" text[] NOT NULL,

  -- NOT NULL in the 1.7 schema. See the note on oauth_refresh_token above.
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS "oauthConsent_clientId_idx"
  ON "oauth_consent" ("client_id");

CREATE INDEX IF NOT EXISTS "oauthConsent_userId_idx"
  ON "oauth_consent" ("user_id");

-- One row per consumed `private_key_jwt` assertion id, so a replay collides on
-- the primary key and fails atomically.
--
-- No client here authenticates that way — every MCP client is public — so this
-- table stays empty. It is created anyway because the drizzle adapter refuses
-- to build when a model the provider declares is missing from lib/schema.ts,
-- and lib/schema.ts and this file have to agree.
CREATE TABLE IF NOT EXISTS "oauth_client_assertion" (
  "id" text PRIMARY KEY NOT NULL,
  "expires_at" timestamp NOT NULL
);
