/**
 * Checks that a channel's developer app is configured correctly, without a
 * browser and without connecting anything.
 *
 * Run with: npx tsx --env-file=.env.local scripts/probe-channels.ts [channel]
 *
 * Phase 0 of plans/005 is manual — someone clicks through a developer portal —
 * and the first sign of getting it wrong would otherwise be a person bouncing
 * off a consent screen with an error page. This asks the platform directly.
 *
 * It builds a real authorization URL and fetches it. Nothing is granted and no
 * token is issued: the response is either the consent screen (the app is set up)
 * or the provider's error page naming what is wrong. LinkedIn in particular
 * answers HTTP 200 with the failure written into the page body, so the status
 * code alone tells you nothing — the message has to be read out of the HTML.
 */
import {
  beginConnect,
  isChannelEnabled,
  redirectUri,
  channelLabel,
} from "../lib/channels"
import {
  CONNECTABLE_CHANNELS,
  type ConnectableChannel,
} from "../lib/schema-app"

/** Phrases each provider uses when the app itself is misconfigured. */
const FAILURES = [
  /redirect_uri does not match the registered value/i,
  /unauthorized_scope_error/i,
  /invalid_client_id/i,
  /invalid_request/i,
  /Bummer, something went wrong[.]? ?([^<]{0,120})/i,
]

function readable(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&copy;/gi, "©")
    .replace(/\s+/g, " ")
    .trim()
}

async function probe(channel: ConnectableChannel) {
  const label = channelLabel(channel)
  console.log(`\n=== ${label} ===`)

  if (!isChannelEnabled(channel)) {
    console.log(
      `  SKIP  not configured — set ${channel.toUpperCase()}_CLIENT_ID and _SECRET`
    )
    return
  }

  const { url } = await beginConnect(channel)
  const params = new URL(url).searchParams

  console.log(`  redirect_uri  ${redirectUri(channel)}`)
  console.log(`  scope         ${params.get("scope")}`)
  console.log(
    `  pkce          ${params.has("code_challenge") ? "S256" : "none"}`
  )

  const response = await fetch(url, { redirect: "manual" })
  const body = await response.text()
  const text = readable(body)

  for (const pattern of FAILURES) {
    const match = pattern.exec(text)
    if (match) {
      console.log(`  FAIL  ${match[0].trim()}`)
      process.exitCode = 1
      return
    }
  }

  // A 3xx to a login page is fine — that is the provider asking the visitor to
  // sign in before consenting, which only happens once the app itself is valid.
  console.log(
    `  PASS  ${label} accepted the request (HTTP ${response.status}) — consent screen reached`
  )
}

async function main() {
  const requested = process.argv[2] as ConnectableChannel | undefined

  if (requested && !CONNECTABLE_CHANNELS.includes(requested)) {
    throw new Error(
      `Unknown channel "${requested}". Try: ${CONNECTABLE_CHANNELS.join(", ")}`
    )
  }

  for (const channel of requested ? [requested] : CONNECTABLE_CHANNELS) {
    await probe(channel)
  }

  console.log(
    process.exitCode
      ? "\nFix the developer portal, then run this again."
      : "\nAll configured channels are ready to connect."
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
