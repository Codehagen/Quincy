import type { IconSvgElement } from "@hugeicons/react"
import {
  Add01Icon,
  Alert02Icon,
  Clock01Icon,
  Coins01Icon,
  ComputerIcon,
  CreditCardIcon,
  GoogleIcon,
  LockPasswordIcon,
  Location01Icon,
  Logout01Icon,
  Mail01Icon,
  PauseIcon,
  RoboticIcon,
  SmartPhone01Icon,
  SquareLock02Icon,
  Tick02Icon,
  UserIcon,
} from "@hugeicons/core-free-icons"

import { calendarDayIn, hhmmIn } from "@/lib/timezone"
import { timeIn, zoneLabel } from "@/lib/zones"

/**
 * /settings as rows: what the server hands down, what each row says, and
 * Quincy's notes beside them. Plain functions with no React, so the server
 * page and the client desk agree on every word, and nothing here imports a
 * module that reads env or opens a connection (a constant from such a module
 * crashed /settings in production once: lib/mcp-shared.ts).
 *
 * Decided on /prototypes/settings-lab, "Desk" (docs/design/decisions.md,
 * "Settings is a working surface"): every setting, browser and agent is a
 * row in one grouped DataList, the open row in a pane beside it.
 */

// ── What the server hands down ─────────────────────────────────────────────

/**
 * A moment, already worded in the account's zone by the server, so the first
 * paint and the hydrated one agree. `short` is the row's fact ("07:52",
 * "Yesterday", "12 Nov"), `sentence` the same inside a sentence ("today at
 * 07:52", "yesterday", "on 12 Nov"), `full` the cell's title.
 */
export type When = { short: string; sentence: string; full: string }

/** One browser and the sessions behind it, as the page groups them. */
export type SettingsBrowser = {
  /** The first session's id: the row's key. */
  id: string
  /** Every session in the group, for one Sign out. Never a token. */
  ids: string[]
  /** What `describeUserAgent` says: "Chrome on macOS". */
  name: string
  count: number
  current: boolean
  /** The newest `updatedAt` in the group. */
  lastUsed: When
  /** The oldest `createdAt` in the group. */
  signedIn: When
}

/** One MCP client this account consented to. */
export type SettingsAgent = {
  clientId: string
  name: string
  /** Registered on this page (deleted on removal), or arrived by CIMD (consent taken back). */
  owned: boolean
  connected: When | null
  /** When it last took a key; null when it never has. */
  lastKey: When | null
}

export type PlanState = "trialing" | "active" | "expired" | "lapsed"

/** The billing snapshot, worded by the server in the billing page's own copy. */
export type SettingsPlan = {
  state: PlanState
  /** cancelAtPeriodEnd */
  ending: boolean
  /** past_due or unpaid: still open in Stripe, fixed in the portal. */
  recoverable: boolean
  /** The lead sentence: "You are on the plan.", "Ends 3 December 2026." */
  title: string
  /** The paragraph under it. */
  body: string
  /** Checkout or the portal. A recoverable plan is always the portal. */
  mode: "subscribe" | "manage"
  /** "Wednesday 09:02", in the account's zone. */
  trialEnds?: string
  /** "3 December 2026", in the account's zone. */
  renews?: string
  /** "3 Dec". */
  renewsShort?: string
}

export type SettingsUsage = {
  turns: number
  /** "$8.46", an estimate. */
  cost: string
  /** Last calendar month's turns; null when there were none to compare with. */
  lastMonthTurns: number | null
}

export type SettingsBilling = {
  /** STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set. */
  configured: boolean
  price: number
  /** MANAGED_PAYMENTS: Link sells it, VAT where it applies, receipts from Link. */
  managed: boolean
  /**
   * Back from Checkout (`?checkout=done`): `confirmed` when the snapshot
   * already says active, `pending` while it does not. Pending never offers
   * Subscribe: a second Checkout during the lag opens a second subscription.
   */
  checkout: "confirmed" | "pending" | null
}

export type SettingsData = {
  name: string
  email: string
  emailVerified: boolean
  /** An `account` row with a password (`credential`). */
  password: boolean
  /** An `account` row from Google. */
  google: boolean
  timezone: string
  /** The server's clock, so the first paint and the hydrated one agree. */
  nowIso: string
  browsers: SettingsBrowser[]
  agents: SettingsAgent[]
  /** Clients this account registered by hand (`oauth_client.user_id`). */
  registered: number
  /** MCP_CLIENTS_PER_USER, passed in: lib/mcp-gate.ts is server code. */
  agentLimit: number
  plan: SettingsPlan
  usage: SettingsUsage
  billing: SettingsBilling
  /** MAIL_REPLY_TO, passed in: lib/mail.ts holds the mail client. */
  supportEmail: string
}

// ── Dates ──────────────────────────────────────────────────────────────────

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function dayNumber(d: { year: number; month: number; day: number }) {
  return Date.UTC(d.year, d.month - 1, d.day) / 86_400_000
}

/**
 * One formatter for the row and the pane, as Drafts' Age column says it:
 * "07:52" for today, "Yesterday", "12 Nov" (with the year when it is not
 * this one). Calendar days in the account's zone, never the server's.
 */
export function describeWhen(at: Date, zone: string, now: Date): When {
  const then = calendarDayIn(at, zone)
  const today = calendarDayIn(now, zone)
  const days = dayNumber(today) - dayNumber(then)
  const full = at.toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zone,
  })
  if (days <= 0) {
    const t = hhmmIn(at, zone)
    return { short: t, sentence: `today at ${t}`, full }
  }
  if (days === 1) return { short: "Yesterday", sentence: "yesterday", full }
  const date = `${then.day} ${MONTH[then.month - 1]}${then.year === today.year ? "" : ` ${then.year}`}`
  return { short: date, sentence: `on ${date}`, full }
}

// ── Sections and rows ──────────────────────────────────────────────────────

export type SectionId = "profile" | "signin" | "plan" | "agents" | "account"

export const SECTIONS: readonly { id: SectionId; label: string; icon: IconSvgElement }[] = [
  { id: "profile", label: "Profile", icon: UserIcon },
  { id: "signin", label: "Sign-in", icon: SquareLock02Icon },
  { id: "plan", label: "Plan & billing", icon: CreditCardIcon },
  { id: "agents", label: "Agents", icon: RoboticIcon },
  { id: "account", label: "Account", icon: Logout01Icon },
]

export const SECTION_IDS = SECTIONS.map((s) => s.id)

export type PaneKind =
  | "name"
  | "zone"
  | "email"
  | "password"
  | "google"
  | "browser"
  | "agent"
  | "register"
  | "plan"
  | "usage"
  | "leave"

/** A state as a still glyph and a word (StatusMark); ink only when it needs you. */
export type Mark = { icon: IconSvgElement; word: string; ink?: boolean }

/** Which of Quincy's notes belongs to a row's pane. */
export type NoteKey =
  | "name"
  | "zone"
  | "email"
  | "password"
  | "google"
  | "browser"
  | "thisBrowser"
  | "agent"
  | "register"
  | "plan"
  | "usage"
  | "leave"

export type Item = {
  id: string
  group: SectionId
  kind: PaneKind
  icon: IconSvgElement
  title: string
  value: string
  /** The row's fact in mono: a time, a date, a count. Empty for none. */
  when: string
  /** The fact's full form, for the cell's title. */
  whenFull?: string
  mark: Mark | null
  needsYou?: boolean
  note: NoteKey
  /** The browser's or the agent's id. */
  ref?: string
}

const MARK_VERIFIED: Mark = { icon: Tick02Icon, word: "Verified" }
const MARK_THIS: Mark = { icon: Location01Icon, word: "This one" }

export function planMark(d: SettingsData): Mark {
  const p = d.plan
  if (d.billing.checkout === "pending") return { icon: Clock01Icon, word: "Confirming" }
  switch (p.state) {
    case "trialing":
      return { icon: Clock01Icon, word: "Free trial" }
    case "active":
      return p.ending ? { icon: Clock01Icon, word: "Ending" } : { icon: Tick02Icon, word: "Active" }
    case "expired":
      return { icon: PauseIcon, word: "Read-only", ink: true }
    case "lapsed":
      return { icon: Alert02Icon, word: p.recoverable ? "Payment needed" : "Cancelled", ink: true }
  }
}

/** Whether the plan asks something of the person: it opens first and takes the ink. */
export function planNeedsYou(d: SettingsData): boolean {
  if (d.billing.checkout === "pending") return false
  return d.plan.state === "expired" || d.plan.state === "lapsed"
}

/** "214 turns · $8.46 · last month 251", or nothing spent. */
export function usageLine(u: SettingsUsage): string {
  if (u.turns === 0) return "Nothing spent this month"
  const turns = `${u.turns.toLocaleString("en-GB")} turns · ${u.cost}`
  return u.lastMonthTurns != null ? `${turns} · last month ${u.lastMonthTurns.toLocaleString("en-GB")}` : turns
}

const MOBILE = /\b(iPhone|iPad|Android)\b/

/** Every row on the page, in the sections' order. */
export function buildItems(d: SettingsData, now: Date): Item[] {
  const p = d.plan
  const signIn: Item[] = []
  if (d.password) {
    signIn.push({ id: "password", group: "signin", kind: "password", icon: LockPasswordIcon, title: "Password", value: "Set", when: "", mark: null, note: "password" })
  }
  if (d.google) {
    signIn.push(
      d.password
        ? { id: "google", group: "signin", kind: "google", icon: GoogleIcon, title: "Google", value: "Also signs you in", when: "", mark: null, note: "google" }
        : { id: "google", group: "signin", kind: "google", icon: GoogleIcon, title: "Sign-in", value: "With Google", when: "", mark: null, note: "google" }
    )
  }

  return [
    { id: "name", group: "profile", kind: "name", icon: UserIcon, title: "Name", value: d.name.trim() || d.email, when: "", mark: null, note: "name" },
    {
      id: "zone",
      group: "profile",
      kind: "zone",
      icon: Clock01Icon,
      title: "Time zone",
      value: zoneLabel(d.timezone, now),
      when: timeIn(d.timezone, now),
      mark: null,
      note: "zone",
    },
    {
      id: "email",
      group: "signin",
      kind: "email",
      icon: Mail01Icon,
      title: "Email",
      value: d.email,
      when: "",
      mark: d.emailVerified ? MARK_VERIFIED : null,
      note: "email",
    },
    ...signIn,
    ...d.browsers.map<Item>((b) => ({
      id: `browser:${b.id}`,
      group: "signin",
      kind: "browser",
      icon: MOBILE.test(b.name) ? SmartPhone01Icon : ComputerIcon,
      title: b.name,
      value: `Signed in ${b.signedIn.sentence}${b.count > 1 ? ` · ${b.count} sessions` : ""}`,
      when: b.current ? "Now" : b.lastUsed.short,
      whenFull: b.current ? "Active now" : `Last used ${b.lastUsed.full}`,
      mark: b.current ? MARK_THIS : null,
      note: b.current ? "thisBrowser" : "browser",
      ref: b.id,
    })),
    {
      id: "plan",
      group: "plan",
      kind: "plan",
      icon: CreditCardIcon,
      title: "Plan",
      value: `$${d.billing.price} a month${p.state === "trialing" && p.trialEnds ? `, free until ${p.trialEnds}` : ""}`,
      when: p.state === "active" ? (p.renewsShort ?? "") : "",
      whenFull: p.state === "active" && p.renews ? `${p.ending ? "Ends" : "Renews"} ${p.renews}` : undefined,
      mark: planMark(d),
      needsYou: planNeedsYou(d),
      note: "plan",
    },
    {
      id: "usage",
      group: "plan",
      kind: "usage",
      icon: Coins01Icon,
      title: "This month",
      value: usageLine(d.usage),
      when: d.usage.turns > 0 ? d.usage.cost : "",
      mark: null,
      note: "usage",
    },
    {
      id: "register",
      group: "agents",
      kind: "register",
      icon: Add01Icon,
      title: "Register an agent",
      value: "Only for one that cannot introduce itself",
      when: `${d.registered}/${d.agentLimit}`,
      whenFull: `${d.registered} of ${d.agentLimit} registered`,
      mark: null,
      note: "register",
    },
    ...d.agents.map<Item>((g) => ({
      id: `agent:${g.clientId}`,
      group: "agents",
      kind: "agent",
      icon: RoboticIcon,
      title: g.name,
      value: g.owned ? "Registered here" : "Introduced itself",
      when: g.lastKey?.short ?? "Never",
      whenFull: g.lastKey ? `Last key ${g.lastKey.full}` : "Never took a key",
      mark: null,
      note: "agent",
      ref: g.clientId,
    })),
    {
      id: "leave",
      group: "account",
      kind: "leave",
      icon: Logout01Icon,
      title: "Delete the account",
      value: "By mail, done by hand",
      when: "",
      mark: null,
      note: "leave",
    },
  ]
}

/** A group's qualifier, after Lineup's day label: the name in ink, this muted. */
export function qualifier(id: SectionId, d: SettingsData, now: Date): string {
  switch (id) {
    case "profile":
      return `${timeIn(d.timezone, now)} there`
    case "signin": {
      const ways = [d.password ? "Password" : null, d.google ? "Google" : null].filter(Boolean).join(" · ")
      const browsers = d.browsers.length === 1 ? "1 browser" : `${d.browsers.length} browsers`
      return [ways, browsers].filter(Boolean).join(" · ")
    }
    case "plan": {
      const p = d.plan
      if (d.billing.checkout === "pending") return "Confirming with Stripe"
      const when =
        p.state === "trialing" && p.trialEnds
          ? `until ${p.trialEnds}`
          : p.state === "active" && p.renewsShort
            ? `${p.ending ? "ends" : "renews"} ${p.renewsShort}`
            : ""
      return [planMark(d).word, when].filter(Boolean).join(" · ")
    }
    case "agents":
      if (d.agents.length === 0) return "none yet"
      return d.registered > 0 ? `${d.registered} of ${d.agentLimit} registered` : `${d.agents.length} connected`
    case "account":
      return ""
  }
}

// ── Words ──────────────────────────────────────────────────────────────────

/**
 * The toolbar's one sentence, from the account and nothing else: the plan
 * first (it is the one thing that can stop Quincy), then the keys out.
 */
export function summarySentence(d: SettingsData): string {
  const p = d.plan
  const plan =
    d.billing.checkout === "pending"
      ? "Confirming the plan with Stripe."
      : d.billing.checkout === "confirmed"
        ? `On the plan${p.renewsShort ? `, renews ${p.renewsShort}` : ""}.`
        : p.state === "trialing"
          ? `Free until ${p.trialEnds ?? "the end of the trial"}.`
          : p.state === "expired"
            ? "The free day is over; Quincy has stopped writing."
            : p.state === "lapsed"
              ? p.recoverable
                ? "A payment did not go through."
                : "The plan was cancelled."
              : p.ending
                ? `Ending ${p.renewsShort ?? "at the end of the period"}; nothing changes before then.`
                : `Paying${p.renewsShort ? `, renews ${p.renewsShort}` : ""}.`
  const browsers = d.browsers.length === 1 ? "1 browser" : `${d.browsers.length} browsers`
  const agents = d.agents.length === 0 ? "no agents" : d.agents.length === 1 ? "1 agent" : `${d.agents.length} agents`
  return `${plan} ${browsers}, ${agents}.`
}

/**
 * Quincy's note beside the open row's object: the consequence the row does
 * not say itself. Lower case, 2–4 words, never a count (editor-marks.md,
 * "Notes on working surfaces"); none where it would only restate the row.
 */
export function paneNotes(d: SettingsData): Partial<Record<NoteKey, string>> {
  const others = d.browsers.filter((b) => !b.current).length
  const p = d.plan
  const day = (p.renewsShort ?? "").toLowerCase()
  const plan =
    d.billing.checkout != null
      ? undefined
      : p.state === "trialing"
        ? "no card needed to finish"
        : p.state === "expired"
          ? "nothing deleted, writing stopped"
          : p.state === "lapsed"
            ? p.recoverable
              ? "fix the card, nothing lost"
              : "start again, nothing lost"
            : p.ending
              ? day
                ? `on until ${day}`
                : "on until the period ends"
              : "nothing to do"
  const u = d.usage
  return {
    name: "every mail opens with it",
    zone: "every lineup slot moves with it",
    password: others > 0 ? "signs the others out" : "only this browser holds a key",
    browser: "it can sign in again",
    thisBrowser: "the one you are using",
    plan,
    usage:
      u.turns > 0 && u.lastMonthTurns != null
        ? u.turns < u.lastMonthTurns
          ? "under your usual month"
          : u.turns > u.lastMonthTurns
            ? "over your usual month"
            : undefined
        : undefined,
    register:
      d.agents.length === 0
        ? "most introduce themselves"
        : d.registered >= d.agentLimit - 2
          ? "almost at the limit"
          : undefined,
    agent: "it never publishes",
    leave: "by hand, usually the same day",
  }
}

/**
 * The list's notes, by group: something noticed that leads to an action,
 * 2–4 words, lower case, never a count. At most two, so with the pane's one
 * the screen holds three. Gone when the thing is resolved.
 */
export function listNotes(d: SettingsData): Partial<Record<SectionId, string>> {
  const p = d.plan
  const others = d.browsers.filter((b) => !b.current).length
  const candidates: [SectionId, string | undefined][] = [
    [
      "plan",
      d.billing.checkout != null
        ? undefined
        : p.state === "lapsed"
          ? "fix the card first"
          : p.state === "expired"
            ? "writing has stopped"
            : p.state === "active" && p.ending
              ? "keep it before it ends?"
              : undefined,
    ],
    ["signin", d.browsers.some((b) => b.name === "Unknown browser") ? "one has no name" : others >= 3 ? "others still signed in" : undefined],
    [
      "agents",
      d.registered >= d.agentLimit - 2 ? "almost full" : d.agents.some((g) => g.lastKey == null) ? "some never connected" : undefined,
    ],
  ]
  const out: Partial<Record<SectionId, string>> = {}
  for (const [k, v] of candidates) {
    if (v && Object.keys(out).length < 2) out[k] = v
  }
  return out
}
