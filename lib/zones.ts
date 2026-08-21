/**
 * The time zones a person can choose from, and how one is written.
 *
 * Deliberately curated rather than `Intl.supportedValuesOf("timeZone")`. The
 * full set is over 400 entries, which is a searchable combobox rather than a
 * select — a different component and a different decision. These are where
 * people are, and `zoneOptions` guarantees the account's own zone is present
 * whether or not it is in this list.
 *
 * See plans/024.
 */
export const ZONES = [
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Atlantic/Reykjavik",
  "Europe/London",
  "Europe/Lisbon",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Oslo",
  "Europe/Stockholm",
  "Europe/Helsinki",
  "Europe/Athens",
  "Africa/Lagos",
  "Africa/Nairobi",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
]

/**
 * The list, with the current zone guaranteed to be in it.
 *
 * A select whose value is not among its options renders empty, and a person
 * reads that as "Quincy does not know where I am" rather than as a gap in our
 * list. Anyone living outside the 25 above — and `Pacific/Kiritimati` is a real
 * place with real people — sees their own zone at the top instead.
 */
export function zoneOptions(current: string) {
  return ZONES.includes(current) ? ZONES : [current, ...ZONES]
}

/**
 * "Europe/Oslo · GMT+2".
 *
 * The offset is what makes an IANA identifier legible to somebody who does not
 * think in them. Derived at render, never stored: an offset is a fact about one
 * moment and the clocks move twice a year — which is the same reason the column
 * holds a zone and not an offset in the first place (see lib/timezone.ts).
 */
export function zoneLabel(zone: string, at: Date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      timeZoneName: "shortOffset",
    }).formatToParts(at)
    const offset = parts.find((part) => part.type === "timeZoneName")?.value
    return offset ? `${zone.replace(/_/g, " ")} · ${offset}` : zone
  } catch {
    // An unknown identifier throws rather than returning nothing. The raw
    // string is still true and still recognisable, so it is a better answer
    // than an empty row.
    return zone
  }
}

/** The wall clock in a zone, for the sentence that says why the zone matters. */
export function timeIn(zone: string, at: Date = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(at)
  } catch {
    return "—"
  }
}
