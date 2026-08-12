/**
 * Fixtures for /prototypes/settings.
 *
 * Worst content on purpose. A settings page laid out against "Christer Hagen"
 * and "Europe/Oslo" looks fine in every direction, which is the same as
 * learning nothing — so the account here carries the longest real name shape
 * (two given names, a double-barrelled surname), an address that cannot be
 * shortened without lying, and the longest IANA zone label there is.
 *
 * The sign-in method is a password and Google is unlinked, because that is the
 * truth for every beta account: plans/023 took the Google button off invited
 * signup, so an invited person can only arrive with a password.
 */

export type SignInMethod = "password" | "google"

export const ACCOUNT = {
  name: "Christer Bjørn-Hagen Sørensen-Wickström",
  email: "christer.bjorn-hagen@sorensen-wickstrom-consulting.example.com",
  /** The longest label in the list, and a real zone somebody actually lives in. */
  timezone: "Pacific/Kiritimati",
  method: "password" as SignInMethod,
  googleLinked: false,
  memberSince: new Date("2026-08-02T07:09:31Z"),
}

/**
 * A curated list, not `Intl.supportedValuesOf("timeZone")`.
 *
 * The full set is over 400 entries, which is a searchable combobox rather than
 * a select — a decision this run is not making. Twenty-four covers where people
 * are, and the account's own zone is prepended at render so a person outside
 * the list never sees their setting silently reset to the first option.
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
  "Pacific/Kiritimati",
]

export type SessionRow = {
  id: string
  browser: string
  place: string
  lastSeen: string
  current: boolean
}

/**
 * Four, not one. One row makes the section look like a label; four is where a
 * list has to decide what it does about the current session, and about a row
 * whose place is unknown because the address resolved to nothing.
 */
export const SESSIONS: SessionRow[] = [
  {
    id: "s1",
    browser: "Chrome on macOS",
    place: "Oslo, Norway",
    lastSeen: "Right now",
    current: true,
  },
  {
    id: "s2",
    browser: "Safari on iPhone",
    place: "Oslo, Norway",
    lastSeen: "2 hours ago",
    current: false,
  },
  {
    id: "s3",
    browser: "Firefox on Windows",
    place: "Location unknown",
    lastSeen: "Yesterday",
    current: false,
  },
  {
    id: "s4",
    browser: "Chrome on Android",
    place: "London, United Kingdom",
    lastSeen: "9 August",
    current: false,
  },
]

/**
 * What deleting the account actually removes. Named rather than summarised as
 * "your data", because every one of these is a table somebody would ask about
 * afterwards, and the list is what makes the hold deliberate rather than brave.
 */
export const DELETION_COVERS = [
  "your brain — voice, rules, strategy and stories",
  "every conversation, riff and draft",
  "your channel connections and their tokens",
  "your schedule, and anything waiting in it",
]
