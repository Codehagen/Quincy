import type { DraftArtifactOutput, DraftVersionRef } from "../draft-artifact"
import type { StudioGreeting } from "../studio-greeting"

/**
 * The material every Quincy conversation fixture shares: one merged pull
 * request, one idea in it, one post in three beats. The same story the
 * landing tells (components/showcase/demos/the-post.ts), so a picture built
 * from these later says what the landing says.
 *
 * Plain data and no imports from components: the fixtures run in a unit
 * test, in Studio under NEXT_PUBLIC_CHAT_TRANSPORT=scripted, in the kit lab,
 * and (plan 029 step 3) behind the landing's pictures.
 */

/**
 * How long the scripted pauses last: 1 is the pace a person watches, 0 runs
 * the script at once (tests).
 */
export type FixturePace = { pace?: number }

/** A fixed clock, so a fixture renders the same on every run. */
export const FIXTURE_NOW = "2026-11-17T07:40:00.000Z"

export const FIXTURE_POST = [
  "We cut our onboarding from nine screens to three.",
  "People who finished signup, the week before and since:\n41% → 68%",
  "Every screen we removed was a question we never needed to ask.",
].join("\n\n")

export const FIXTURE_POST_SHORT = [
  "We cut onboarding from nine screens to three.",
  "Finished signup, before and since:\n41% → 68%",
  "Every screen we cut was a question we never needed.",
].join("\n\n")

export const FIXTURE_POST_X = [
  "Cut onboarding from 9 screens to 3.",
  "Signup completion:\n41% → 68%",
  "Every screen was a question we never needed to ask.",
].join("\n\n")

/** Ids every fixture shares. They never reach the database. */
export const FIXTURE_VERSION_IDS = {
  linkedin: "fixture-version-linkedin",
  x: "fixture-version-x",
} as const

export function fixtureVersion(
  channel: "linkedin" | "x",
  body: string,
  overrides: Partial<DraftVersionRef> = {}
): DraftVersionRef {
  return {
    versionId: FIXTURE_VERSION_IDS[channel],
    channel,
    label: channel === "linkedin" ? "LinkedIn" : "X",
    body,
    state: "writing",
    updatedAt: FIXTURE_NOW,
    displayName: "Christer Hagen",
    handle: channel === "x" ? "@christer" : null,
    avatarUrl: null,
    ...overrides,
  }
}

/** A draft tool's final output: the versions exist as rows. */
export function draftOutput(
  versions: DraftVersionRef[],
  overrides: Partial<DraftArtifactOutput> = {}
): DraftArtifactOutput {
  return {
    ok: true,
    message:
      "Drafted. The writing is in this conversation, waiting for you to approve. Nothing goes out until you do.",
    pieceId: "fixture-piece",
    versions,
    existing: false,
    fellBack: [],
    overLimit: [],
    ...overrides,
  }
}

/** A preliminary output while the words arrive: no row yet. */
export function writingOutput(versions: DraftVersionRef[]): DraftArtifactOutput {
  return draftOutput(versions, { message: "Writing.", pieceId: "", streaming: true })
}

/**
 * The text cut into `steps` growing prefixes on word boundaries, for a
 * preliminary output per step: how the real `draft_angle` streams
 * (lib/chat-tools.ts, `onPartial`).
 */
export function growing(text: string, steps: number): string[] {
  const words = text.match(/\S+\s*/g) ?? [text]
  const out: string[] = []
  for (let i = 1; i <= steps; i++) {
    out.push(words.slice(0, Math.ceil((words.length * i) / steps)).join("").trimEnd())
  }
  return out
}

/** The greeting an empty Studio opens with, for an account with one idea waiting. */
export const FIXTURE_GREETING: StudioGreeting = {
  opening: [
    "Morning, Christer.",
    "The pull request I read yesterday has a post in it: “Cut onboarding from nine screens to three”. The second idea has a number.",
  ],
  chips: ["Draft the second idea", "Show me all three"],
  link: { href: "/riffs", label: "Open Ideas" },
  typed: false,
}
