-- MCP over OAuth: the three tables Better Auth's `mcp` plugin needs.
-- See plans/027, phase 4e, and docs/mcp.md.
--
-- Transcribed from the plugin's own schema
-- (better-auth/plugins/oidc-provider/schema — the MCP plugin reuses it
-- unchanged) and mirrored by the hand-written block in lib/schema.ts. Nothing
-- else in the database changes shape and no data moves, so this is safe to run
-- ahead of the code that uses it.
--
-- UNAPPLIED as of writing. There is one database and running this is the
-- production migration — see AGENTS.md, "There is one database".
--
-- Every statement is IF NOT EXISTS. A second run changes nothing.

-- The registered client. One row per MCP client that has ever completed
-- dynamic registration (RFC 7591) against /api/auth/mcp/register.
--
-- A row here grants nothing. It is a client id and, for a confidential client,
-- a secret; access needs a signed-in person to complete the authorization code
-- flow and consent.
CREATE TABLE IF NOT EXISTS "oauth_application" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "icon" text,

  -- JSON, as a string. The plugin stringifies and parses it itself, so this is
  -- text rather than jsonb — jsonb would round-trip the value through a
  -- different type than the code that wrote it expects.
  "metadata" text,

  -- Unique because the two tables below reference *this* column rather than
  -- "id": the plugin looks a client up by the id it handed out.
  "client_id" text NOT NULL UNIQUE,

  -- Empty string, not null, for a public client. Every MCP client registers
  -- with token_endpoint_auth_method "none", which is exactly that case.
  "client_secret" text,

  -- Comma-separated. The plugin joins on write and splits on read.
  "redirect_urls" text NOT NULL,

  -- web | native | user-agent-based | public. Not a CHECK constraint: the list
  -- belongs to the plugin, and a copy here would be a second authority.
  "type" text NOT NULL,

  "disabled" boolean DEFAULT false,
  "user_id" text REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS "oauth_application_userId_idx"
  ON "oauth_application" ("user_id");

-- The bearer token. Read once per MCP request, by access_token.
--
-- No index is declared on "access_token" because the UNIQUE constraint already
-- is one, and that is the lookup every tool call makes.
CREATE TABLE IF NOT EXISTS "oauth_access_token" (
  "id" text PRIMARY KEY NOT NULL,
  "access_token" text NOT NULL UNIQUE,
  "refresh_token" text NOT NULL UNIQUE,
  "access_token_expires_at" timestamp NOT NULL,
  "refresh_token_expires_at" timestamp NOT NULL,
  "client_id" text NOT NULL
    REFERENCES "oauth_application"("client_id") ON DELETE CASCADE,
  "user_id" text REFERENCES "user"("id") ON DELETE CASCADE,

  -- Space-separated, e.g. "openid profile email read write". lib/mcp.ts is the
  -- only reader and it splits on whitespace.
  "scopes" text NOT NULL,

  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS "oauth_access_token_clientId_idx"
  ON "oauth_access_token" ("client_id");

CREATE INDEX IF NOT EXISTS "oauth_access_token_userId_idx"
  ON "oauth_access_token" ("user_id");

-- What a person agreed to give a client. Written once at consent and read on
-- every later authorization so a returning client does not ask twice.
CREATE TABLE IF NOT EXISTS "oauth_consent" (
  "id" text PRIMARY KEY NOT NULL,
  "client_id" text NOT NULL
    REFERENCES "oauth_application"("client_id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "scopes" text NOT NULL,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL,
  "consent_given" boolean NOT NULL
);

CREATE INDEX IF NOT EXISTS "oauth_consent_clientId_idx"
  ON "oauth_consent" ("client_id");

CREATE INDEX IF NOT EXISTS "oauth_consent_userId_idx"
  ON "oauth_consent" ("user_id");
