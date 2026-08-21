/**
 * Shows what is actually connected, and proves the stored token still works.
 *
 * Run with: npx tsx --env-file=.env.local scripts/inspect-channels.ts
 *
 * The difference between this and verify-channels.ts is the network. That one
 * asserts the module's behaviour with fabricated tokens and never leaves the
 * machine. This one takes the real credential out of the database, decrypts it,
 * and asks the platform who it belongs to.
 *
 * That call is the only thing that proves a connection end to end. A row with a
 * plausible-looking ciphertext in it and a `state` of "active" is not evidence
 * that anything works — the encryption round trip, the token exchange, and the
 * platform's willingness to honour the token are three separate claims, and
 * only the last one is worth anything on its own.
 *
 * Read-only, and deliberately so. It reads through `peekAccessToken`, which
 * never refreshes or writes, rather than the function lib/channels.ts reserves
 * for actually using a connection — that one refreshes what is stale and
 * writes what it learns, so inspecting a connection through it would change
 * it: marking a working row `needs_reauth`, or spending an X refresh token
 * that X will not honour twice. A diagnostic that alters what it measures is
 * worse than no diagnostic. Do not swap this back.
 */
import { listConnections, peekAccessToken } from "../lib/channels"
import { db } from "../lib/db"
import { user } from "../lib/schema"
import type { ConnectableChannel } from "../lib/schema-app"

function ago(date: Date | null): string {
  if (!date) return "—"
  const days = Math.round((date.getTime() - Date.now()) / 86_400_000)
  if (days > 1) return `in ${days} days`
  if (days === 1) return "tomorrow"
  if (days === 0) return "today"
  return `${Math.abs(days)} days ago`
}

async function live(userId: string, channel: ConnectableChannel) {
  const access = await peekAccessToken(userId, channel)

  if (!access.ok) {
    console.log(`    token        no connection row`)
    process.exitCode = 1
    return
  }

  const expiresAt = access.connection.accessTokenExpiresAt
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    // Reported, not refused: the platform's answer is the evidence this script
    // exists to collect, and "expired locally but still honoured" is itself
    // worth knowing.
    console.log(
      `    token        expired locally at ${expiresAt.toISOString()}`
    )
  }

  if (channel === "linkedin") {
    const response = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${access.accessToken}` },
    })

    if (!response.ok) {
      console.log(
        `    token        REJECTED by LinkedIn (${response.status}) ${(await response.text()).slice(0, 160)}`
      )
      process.exitCode = 1
      return
    }

    const me = (await response.json()) as { sub?: string; name?: string }
    console.log(`    token        works — LinkedIn says this is ${me.name}`)
    console.log(`    author URN   urn:li:person:${me.sub}`)
    return
  }

  const response = await fetch("https://api.x.com/2/users/me", {
    headers: { Authorization: `Bearer ${access.accessToken}` },
  })

  if (!response.ok) {
    console.log(
      `    token        REJECTED by X (${response.status}) ${(await response.text()).slice(0, 160)}`
    )
    process.exitCode = 1
    return
  }

  const { data } = (await response.json()) as {
    data?: { username?: string; name?: string }
  }
  console.log(`    token        works — X says this is @${data?.username}`)
}

async function main() {
  const users = await db.select().from(user)
  let found = 0

  for (const account of users) {
    const connections = await listConnections(account.id)
    if (connections.length === 0) continue

    found += connections.length
    console.log(`\n${account.email}`)

    for (const connection of connections) {
      console.log(`  ${connection.channel}`)
      console.log(
        `    as           ${connection.displayName ?? "—"}${connection.handle ? ` (${connection.handle})` : ""}`
      )
      console.log(`    external id  ${connection.externalId}`)
      console.log(`    state        ${connection.state}`)
      console.log(`    scopes       ${connection.scopes.join(" ") || "—"}`)
      console.log(`    expires      ${ago(connection.accessTokenExpiresAt)}`)
      if (connection.lastError) {
        console.log(`    last error   ${connection.lastError.slice(0, 120)}`)
      }
      await live(account.id, connection.channel)
    }
  }

  if (found === 0) {
    console.log("Nothing connected yet.")
    console.log("Sign in at http://localhost:3000/login, then visit")
    console.log("http://localhost:3000/api/connect/linkedin")
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
