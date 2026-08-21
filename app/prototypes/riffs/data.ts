/**
 * Prototype fixtures for /riffs, round three.
 *
 * Round two ran on fourteen riffs to prove a point about scroll length, and the
 * point was won: Desk shipped. This round is asking two different questions —
 * what happens when no angle lands on a channel you publish to, and what every
 * failure looks like — so the queue is back down to **six**, which is close to
 * what the `riff` table actually held on 2026-08-08 (six rows, two accounts,
 * largest single queue four). Padding it to fourteen would only make both
 * questions harder to see.
 *
 * The failure fixtures are not here. They live in `variants/faults.tsx`, next
 * to the only variant that renders them, because a healthy queue with three
 * broken rows in it is not a healthy queue.
 *
 * Content is plausible and specific rather than lorem — an angle is prose, and
 * prose is the only way to judge line length, wrapping, and whether a channel
 * gap is obvious on screen. Nothing here is a real post.
 */

import type { Angle, Riff } from "@/lib/riffs"

export const RIFFS: Riff[] = [
  /**
   * Thread → X, Essay → Substack. **LinkedIn is missing**, and Quincy has
   * something in reserve for it. The everyday case.
   */
  {
    id: "pricing",
    scrap:
      "Per-seat pricing is wrong for us. We are selling something one person uses on behalf of a company — the value does not scale with headcount, it scales with how much gets published. Charging per seat would punish the exact customer we want.",
    sourceId: "voice",
    sourceLabel: "Voice notes",
    capturedAt: "Today",
    state: "ready",
    failure: "",
    stuck: false,
    adaptedFrom: null,
    angles: [
      {
        id: "pricing-1",
        hook: "Vi droppet per-seat prising. Her er regnestykket som avgjorde det.",
        shape: "Thread",
        kind: "Behind the scenes",
        why: "You have the actual numbers, and pricing threads from founders who show the maths get saved rather than liked.",
      },
      {
        id: "pricing-2",
        hook: "Hvordan vi prissetter en agent som jobber for deg mens du sover",
        shape: "Essay",
        kind: "Opinion",
        why: "Long enough to carry the reasoning, which is the part nobody else publishes.",
      },
    ],
  },

  /**
   * Carousel only → covers LinkedIn and Instagram, misses X entirely.
   * This is the fixture the whole Channels variant exists for: a riff worth
   * publishing where nothing on it can go to the channel you post to most.
   */
  {
    id: "sources-split",
    scrap:
      "Grunnen til at vi deler Channels og Sources: Channels er hvor skrivingen går ut, Sources er hvor materialet kommer inn. Ett rutenett som blander output, input og chat blir en liste ingen kan lese: plattform er et filter, ikke en taksonomi.",
    sourceId: "slack",
    sourceLabel: "Slack",
    capturedAt: "Today",
    state: "ready",
    failure: "",
    stuck: false,
    adaptedFrom: {
      url: "https://x.com/someone/status/1889",
      handle: "someone",
    },
    angles: [
      {
        id: "sources-1",
        hook: "Taksonomi er design. Her er hva som skjer når du tar den feil.",
        shape: "Carousel",
        kind: "Opinion",
        why: "This is a before/after argument, and before/after is what a carousel is actually good at.",
      },
    ],
  },

  /**
   * Essay only → Substack. Misses both channels you actually publish to, so
   * two gaps show at once and the ask has to handle a plural.
   */
  {
    id: "retreat",
    scrap:
      "Når jeg sier at det er en AI som skriver postene dine, nikker folk og slutter å høre etter. Når jeg sier at det er tingen som husker hva som skjedde denne uka så du har noe å skrive om, lener de seg fram. Skrivingen er den enkle delen nå. Å huske hva som var verdt å skrive om er det ingen som har løst.",
    sourceId: "voice",
    sourceLabel: "Voice notes",
    capturedAt: "Yesterday",
    state: "ready",
    failure: "",
    stuck: false,
    adaptedFrom: null,
    angles: [
      {
        id: "retreat-1",
        hook: "Vi bygde et minne og kalte det en skriveassistent",
        shape: "Essay",
        kind: "Story",
        why: "The four-month misdescription is the story, and admitting it is what makes it readable.",
      },
    ],
  },

  /**
   * One angle, already drafted, Carousel → LinkedIn and Instagram. **X is
   * missing.** The settled riff that still has a gap: the decision on this
   * material is made, and it never reached the channel you post to most.
   */
  {
    id: "rhythm-grid",
    scrap:
      "Merged #212 — rhythm grid, platform filter in the URL. 24 rhythms grouped by function instead of by platform, nuqs for the filter state so a filtered view is shareable.",
    sourceId: "github",
    sourceLabel: "GitHub",
    capturedAt: "Yesterday",
    state: "ready",
    failure: "",
    stuck: false,
    adaptedFrom: null,
    angles: [
      {
        id: "rhythm-1",
        hook: "Fra plattform til funksjon: hvordan vi grupperte 24 automatiseringer om",
        shape: "Carousel",
        kind: "Behind the scenes",
        why: "A before/after of the same grid, which is what a carousel is actually good at.",
        status: "drafted",
      },
    ],
  },

  {
    id: "onboarding",
    scrap:
      "Vi fjernet hele onboarding-touren. Ny bruker lander rett i Riffs med mikrofonen åpen. Aktivering gikk fra 31% til 58% på to uker. Turen forklarte produktet; snarveien leverte det.",
    sourceId: "voice",
    sourceLabel: "Voice notes",
    capturedAt: "3 days ago",
    state: "ready",
    failure: "",
    stuck: false,
    adaptedFrom: null,
    angles: [
      {
        id: "onboarding-1",
        hook: "Vi slettet onboarding-touren. Aktiveringen doblet seg.",
        shape: "Short post",
        kind: "Announcement",
        why: "A number and a deletion. Nothing else needed, and the shape people stop scrolling for.",
      },
      {
        id: "onboarding-2",
        hook: "31% → 58%. Det eneste vi gjorde var å fjerne noe.",
        shape: "Thread",
        kind: "Behind the scenes",
        why: "The thread version carries the before/after screens, which is the proof the short post has to be believed without.",
      },
    ],
  },

  /**
   * Thread → X. **LinkedIn is missing and there is no reserve for it**, so
   * asking comes back empty. Deliberate: a prototype where every ask succeeds
   * cannot show what the failure of an ask looks like, and "Quincy could not
   * find one" is the outcome the design most needs an answer for.
   */
  {
    id: "bug",
    scrap:
      "Two cost bugs in one week, both the same shape: we paid for the same work twice because nothing wrote down that it had already been done.",
    sourceId: "github",
    sourceLabel: "GitHub",
    capturedAt: "12 Aug",
    state: "ready",
    failure: "",
    stuck: false,
    adaptedFrom: null,
    angles: [
      {
        id: "bug-1",
        hook: "Begge kostnadsbuggene våre var samme bug: ingenting skrev ned at jobben var gjort.",
        shape: "Thread",
        kind: "Story",
        why: "A specific failure told plainly, with both commits as the receipts. Engineers repost these because they recognise the shape.",
      },
    ],
  },
]

/**
 * What Quincy comes back with when you ask for a channel nothing covered.
 *
 * Written per riff rather than generated from a template, for the reason the
 * scraps are written rather than lorem: the whole question this variant asks is
 * "is a channel-targeted angle actually a different angle, or the same hook
 * with a different tag on it?" A templated fixture would answer that question
 * by construction, and answer it wrong.
 *
 * Keyed `riffId:channelId`. A missing key means Quincy has nothing to offer for
 * that pair, which is itself a state the variant has to handle — see
 * `askForChannel` in state.ts.
 */
export const RESERVE: Record<string, Omit<Angle, "id">> = {
  "sources-split:x": {
    hook: "Den vanligste feilen i integrasjonssider: å file etter plattform i stedet for retning.",
    shape: "Thread",
    kind: "Opinion",
    why: "The carousel argues visually. On X the same point lands as a numbered critique with the screenshot in post two.",
  },
  "retreat:x": {
    hook: "Skrivingen er den enkle delen nå. Å huske hva som var verdt å skrive om har ingen løst.",
    shape: "Short post",
    kind: "Opinion",
    why: "The one sentence from the essay that stands completely alone. No setup, no thread, nothing to click.",
  },
  "retreat:linkedin": {
    hook: "Fire måneder med å beskrive produktet feil — og samtalen som avslørte det",
    shape: "Carousel",
    kind: "Story",
    why: "LinkedIn rewards the admission-of-error shape, and the before/after of the two sentences is literally two slides.",
  },
  "pricing:linkedin": {
    hook: "Vi tar ikke betalt per sete. Her er hva vi tar betalt for i stedet.",
    shape: "Carousel",
    kind: "Behind the scenes",
    why: "The thread shows the maths; on LinkedIn the same decision reads better as the principle first and the numbers as proof.",
  },
  "rhythm-grid:x": {
    hook: "URL-en er den beste state-managementen du ikke bruker.",
    shape: "Thread",
    kind: "Teardown",
    why: "The carousel is already drafted and it argues visually. On X the same PR is a different point entirely — nuqs is having a moment in your niche and you just shipped a real use for it.",
  },
  // `bug` has no reserve for LinkedIn, and `onboarding` needs none — its two
  // angles already reach both channels, which is the quiet case the variant has
  // to handle without saying anything at all.
}
