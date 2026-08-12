/**
 * Seeds the drafts → lineup chain so both surfaces have something real to read.
 *
 * Replaces lib/demo.ts. That file served fixtures to an allowlisted address
 * because there was no table to read from; now there is, so the honest version
 * of "let me see the built half" is rows in the database owned by a real user.
 * Everyone else gets an empty page, which is still the true answer.
 *
 * The four pieces continue the Riffs fixtures — pricing, taxonomy, url-state
 * and rhythm-grid all appear there — so the chain Sources → Riffs → Drafts →
 * Lineup is legible end to end rather than as four disconnected screens.
 *
 * Between them they cover every state the two surfaces can render:
 *
 * - a piece with nothing approved  → Drafts has work to do
 * - a piece half approved          → Drafts shows a receipt beside an editor
 * - a version already published    → Lineup shows history it cannot change
 * - a version in a standing slot   → the slot reads as filled
 * - a version at a one-off time    → `slot_id` null, which has to be allowed
 * - two slots with nothing in them → the sentence the whole model exists for
 *
 * Dates are computed from the current week rather than hardcoded, so the seed
 * does not go stale the day after it is run.
 *
 * Run with:    npx tsx --env-file=.env.local scripts/seed-drafts.ts <email>
 * Remove with: npx tsx --env-file=.env.local scripts/seed-drafts.ts <email> --remove
 */
import { eq, inArray } from "drizzle-orm"

import { db } from "../lib/db"
import { user } from "../lib/schema"
import { draft, draftVersion, scheduledPost, slot } from "../lib/schema-app"
import {
  addCalendarDays,
  calendarDayIn,
  instantOf,
  isoWeekdayOf,
  parseTimeOfDay,
  resolveTimeZone,
} from "../lib/timezone"

const DRAFT_IDS = [
  "seed-pricing",
  "seed-taxonomy",
  "seed-url-state",
  "seed-rhythm-grid",
]

/**
 * Offsets from today, not weekdays of the current week.
 *
 * `getLineup` returns a rolling window that starts today, on the argument that
 * "what is going out" starts now rather than last Monday. Seeding against
 * Monday-of-this-week therefore dropped half the fixtures behind the window —
 * on a Tuesday, the Monday rows simply never appeared. Anchoring on today puts
 * every seeded row where it will actually be read.
 *
 * The slots stay weekday-based in the database, because a standing commitment
 * *is* a weekday; the weekday is just derived from the same date rather than
 * picked independently.
 */
function dayAt(offset: number, time: string, zone: string) {
  const parsed = parseTimeOfDay(time)
  if (!parsed) throw new Error(`Not a time: ${time}`)

  const date = addCalendarDays(calendarDayIn(new Date(), zone), offset)
  return instantOf({ ...date, ...parsed }, zone)
}

/**
 * ISO weekday, 1 = Monday, in the account's zone.
 *
 * Not the machine's. A seed run at 23:30 in Oslo is still on the previous day
 * in UTC, so a slot seeded as "today + 2" got a weekday one behind the post
 * that was supposed to fill it, and the row rendered as an empty slot beside an
 * unslotted post.
 */
function weekdayAt(offset: number, zone: string) {
  return isoWeekdayOf(addCalendarDays(calendarDayIn(new Date(), zone), offset))
}

type SeedVersion = {
  channel: string
  label: string
  body: string
  approved?: boolean
  /** Days from today + time. Present only when the version is scheduled. */
  when?: { offset: number; time: string }
  published?: boolean
}

const PIECES: {
  id: string
  idea: string
  riffHook: string
  sourceId: string
  sourceLabel: string
  versions: SeedVersion[]
}[] = [
  {
    id: "seed-pricing",
    idea: "Why we dropped per-seat pricing",
    riffHook:
      "Vi droppet per-seat prising. Her er regnestykket som avgjorde det.",
    sourceId: "voice",
    sourceLabel: "Voice notes",
    versions: [
      {
        channel: "x",
        label: "X",
        body: "Vi droppet per-seat prising i går.\n\nRegnestykket: kunden vår er én person som publiserer på vegne av et selskap. Verdien skalerer med hvor mye som faktisk blir publisert, ikke med hvor mange kollegaer som har en konto de aldri åpner.\n\nPer sete ville straffet akkurat den kunden vi helst vil ha — den som bruker det mest.",
      },
      {
        channel: "linkedin",
        label: "LinkedIn",
        body: "Vi brukte tre uker på prisingen og landet et sted vi ikke hadde planlagt.\n\nPer-seat er standarden i B2B SaaS, og den er standarden av en grunn: den vokser med kunden. Men den vokser med feil ting hos oss.\n\nQuincy er en agent én person bruker på vegne av et selskap. Verdien ligger i hvor mye som faktisk blir publisert — ikke i hvor mange kollegaer som har en konto de aldri åpner.\n\nSå vi priser på volum ut, ikke på hoder inn.",
      },
      {
        channel: "substack",
        label: "Substack",
        body: "Prising er et produktvalg, ikke et regnearkvalg.\n\nDet tok meg lengre tid å skjønne enn jeg vil innrømme…",
      },
    ],
  },
  {
    id: "seed-taxonomy",
    idea: "Filing by platform is a taxonomy mistake",
    riffHook:
      "Den vanligste feilen i integrasjonssider: å file etter plattform i stedet for retning.",
    sourceId: "slack",
    sourceLabel: "Slack",
    versions: [
      {
        channel: "linkedin",
        label: "LinkedIn",
        body: "De fleste integrasjonssider filer etter plattform. Da havner 14 ting under X og 1 under Instagram, og du finner ingenting.\n\nFil etter retning i stedet: hva som går ut, hva som kommer inn.",
        approved: true,
        when: { offset: 0, time: "12:30" },
      },
      {
        channel: "x",
        label: "X",
        body: "De fleste integrasjonssider filer etter plattform. Da havner 14 ting under X og 1 under Instagram, og du finner ingenting.\n\nFil etter retning i stedet: hva som går ut, hva som kommer inn. Plattform er et filter, ikke en overskrift.",
      },
    ],
  },
  {
    id: "seed-url-state",
    idea: "The URL as state management",
    riffHook: "URL-en er den beste state-managementen du ikke bruker.",
    sourceId: "github",
    sourceLabel: "GitHub",
    versions: [
      {
        channel: "x",
        label: "X",
        body: "URL-en er den beste state-managementen du ikke bruker.\n\nFiltrene i Quincy ligger i query params via nuqs. Et filtrert view kan deles, bokmerkes og overlever refresh — uten en eneste linje global state.",
        approved: true,
        when: { offset: 0, time: "08:00" },
        published: true,
      },
    ],
  },
  {
    id: "seed-rhythm-grid",
    idea: "24 automations, grouped by what they do",
    riffHook:
      "24 automatiseringer, gruppert etter hva de gjør — ikke hvor de kjører.",
    sourceId: "github",
    sourceLabel: "GitHub",
    versions: [
      {
        channel: "x",
        label: "X",
        body: "Vi grupperte 24 automatiseringer etter hva de gjør, ikke hvilken plattform de treffer.\n\nPlattform ble et filter i URL-en i stedet for en overskrift. Siden ble halvparten så lang og dobbelt så lett å lese.",
        approved: true,
        when: { offset: 1, time: "08:00" },
      },
      {
        channel: "linkedin",
        label: "LinkedIn",
        body: "En integrasjonsside gruppert etter plattform forteller deg hvor noe kjører. Den forteller deg ikke hva du får.\n\nVi snudde det: gruppér etter funksjon, la plattform være et filter. 24 rytmer, fire familier, og en side du kan lese uten å telle et rutenett.",
        approved: true,
        // No slot on purpose — a one-off time, which is what `slot_id` being
        // nullable exists for.
        when: { offset: 1, time: "11:00" },
      },
      {
        channel: "substack",
        label: "Substack",
        body: "Taksonomi er design.\n\nDen vanligste feilen i produktsider er å file etter det systemet vet om seg selv, i stedet for etter spørsmålet leseren kom med…",
        approved: true,
        when: { offset: 3, time: "09:00" },
      },
    ],
  },
]

/**
 * The standing week, expressed as offsets so it lands inside the read window,
 * then stored as the weekday those offsets fall on.
 *
 * Two are left empty deliberately: an empty slot is the one sentence this whole
 * model exists to make sayable.
 */
const SLOTS = [
  { channel: "x", offset: 0, timeOfDay: "08:00" },
  { channel: "linkedin", offset: 0, timeOfDay: "12:30" },
  { channel: "x", offset: 1, timeOfDay: "08:00" },
  { channel: "linkedin", offset: 2, timeOfDay: "12:00" },
  { channel: "substack", offset: 3, timeOfDay: "09:00" },
  { channel: "x", offset: 4, timeOfDay: "08:00" },
]

async function main() {
  // Explicit, because "the first row" quietly seeded the wrong account once.
  const email = process.argv[2]
  if (!email) throw new Error("Usage: seed-drafts.ts <email> [--remove]")
  const remove = process.argv.includes("--remove")

  const [owner] = await db
    .select({ id: user.id, timezone: user.timezone })
    .from(user)
    .where(eq(user.email, email))
    .limit(1)

  if (!owner) throw new Error(`No user with email ${email}`)

  /**
   * Seed in the account's own zone, so 08:00 in the fixture is 08:00 on screen.
   *
   * A seeded account usually has no zone: nothing signs it up through the form
   * that captures one. Falling back to UTC would put every fixture two hours
   * off what this machine's clock says, which looks like a seeding bug and is
   * not one. So the zone of the machine running the seed is written to the row
   * — the same value a browser here would have reported — and the account
   * behaves like a real one from then on.
   */
  const zone = resolveTimeZone(
    owner.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  )

  if (!owner.timezone) {
    await db.update(user).set({ timezone: zone }).where(eq(user.id, owner.id))
    console.log(`Set timezone for ${email} to ${zone}.`)
  }

  // Re-runnable. Drafts cascade to versions, versions cascade to scheduled
  // posts, so clearing the pieces clears the chain.
  await db.delete(draft).where(inArray(draft.id, DRAFT_IDS))
  await db.delete(slot).where(eq(slot.userId, owner.id))

  if (remove) {
    console.log(`Removed seeded drafts and slots for ${email}.`)
    return
  }

  const slotIds = new Map<string, string>()
  for (const s of SLOTS) {
    const weekday = weekdayAt(s.offset, zone)
    const id = `seed-slot-${s.channel}-${weekday}-${s.timeOfDay.replace(":", "")}`
    await db.insert(slot).values({
      id,
      userId: owner.id,
      channel: s.channel,
      weekday,
      timeOfDay: s.timeOfDay,
    })
    slotIds.set(`${s.channel}-${s.offset}-${s.timeOfDay}`, id)
  }

  let versions = 0
  let scheduled = 0

  for (const piece of PIECES) {
    await db.insert(draft).values({
      id: piece.id,
      userId: owner.id,
      idea: piece.idea,
      riffHook: piece.riffHook,
      sourceId: piece.sourceId,
      sourceLabel: piece.sourceLabel,
    })

    for (const v of piece.versions) {
      const versionId = `${piece.id}-${v.channel}`
      await db.insert(draftVersion).values({
        id: versionId,
        draftId: piece.id,
        channel: v.channel,
        label: v.label,
        body: v.body,
        state: v.approved ? "approved" : "writing",
        approvedAt: v.approved ? new Date() : null,
      })
      versions++

      if (!v.when) continue

      const key = `${v.channel}-${v.when.offset}-${v.when.time}`
      await db.insert(scheduledPost).values({
        id: `${versionId}-sched`,
        userId: owner.id,
        draftVersionId: versionId,
        slotId: slotIds.get(key) ?? null,
        scheduledFor: dayAt(v.when.offset, v.when.time, zone),
        state: v.published ? "published" : "queued",
        publishedAt: v.published
          ? dayAt(v.when.offset, v.when.time, zone)
          : null,
      })
      scheduled++
    }
  }

  console.log(
    `Seeded ${PIECES.length} drafts, ${versions} versions, ${scheduled} scheduled posts and ${SLOTS.length} slots for ${email}.`
  )
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error)
    process.exit(1)
  }
)
