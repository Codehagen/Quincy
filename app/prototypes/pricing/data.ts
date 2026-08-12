/**
 * Fixtures for the pricing exploration.
 *
 * **Every number and every mechanic here is read out of the shipped billing
 * system, not invented.** A pricing page is the one surface where a wrong claim
 * is a refund request, so the sources are named inline:
 *
 * - `$49.00 USD / month`, monthly only — `docs/billing.md`, Stripe price
 *   `price_1U05jbKOzkjqB2ny5AmuEeus`, lookup key `quincy_monthly`. There is no
 *   annual price; `annualDiscountLookupKey` is listed under "Deliberately not
 *   here".
 * - The free day is one day, application state rather than a Stripe trial, and
 *   takes no card — `docs/billing.md`, "Why the trial is ours and not
 *   Stripe's".
 * - The clock starts at **email verification**, not at signup —
 *   `startTrial` is called from `emailVerification.afterEmailVerification` and
 *   from the Google branch guarded on `emailVerified`.
 * - Expiry is read-only, not a locked door — `app/(app)/layout.tsx`
 *   deliberately does not gate; `app/api/chat` returns 402. The shell, the
 *   brain, the drafts and the conversations all still render.
 * - Cancelling runs through the Stripe billing portal and sets
 *   `cancelAtPeriodEnd` — `components/billing/billing-actions.tsx`,
 *   `lib/billing.ts`.
 *
 * Two things are deliberately **not** claimed anywhere in this file, because
 * they are not true yet:
 *
 * - **No tax statement.** `docs/billing.md` is explicit that Codebase AS has no
 *   MVA or Stripe Tax handling and that $49 is currently the charged amount.
 *   Until `automatic_tax` is on, this page must not say "that is all you pay".
 * - **No "cancel any time and pay nothing more" flourish.** Cancelling ends the
 *   renewal; it does not refund the period already paid for. The copy says
 *   exactly that.
 *
 * House voice, matching `app/(marketing)/page.tsx`: no contractions, real
 * punctuation typed rather than approximated.
 */

/** The one plan. Written the way it is read, not as a number and a unit. */
export const PRICE = {
  figure: "$49",
  period: "a month",
  /** Stated because the seller is Norwegian and the charge is not in kroner. */
  currency: "US dollars, billed monthly",
} as const

/**
 * The free day, as the five things that actually happen — the diagram at the
 * top of `docs/billing.md`, written out.
 *
 * Step two is the one worth the page. Deriving the deadline from signup would
 * hand an account to someone who clicks the link two days later and finds it
 * already expired; that bug is the reason the clock hangs off verification, and
 * saying so is more convincing than any adjective about being generous.
 *
 * `at` is the state the account is actually in, and the last three are the
 * literal members of the `Entitlement` union in `lib/entitlement.ts` —
 * `trialing`, `expired` (which renders as read-only), `active`. A page whose
 * vocabulary is the code's vocabulary is a page that cannot drift from it.
 */
export const DAY = [
  {
    at: "Signed up",
    label: "An email goes out with a link in it",
    body: "No card, no plan to choose, and no clock running yet.",
  },
  {
    at: "Verified",
    label: "You click the link, and the day starts here",
    body: "Not at signup. People verify two days later, and an account that had expired before it was first opened would be a broken promise rather than a trial.",
  },
  {
    at: "Trialing",
    label: "Twenty-four hours with everything on",
    body: "The whole product, not a trial-shaped version of it with the good parts greyed out.",
  },
  {
    at: "Read-only",
    label: "The day ends and Quincy stops writing",
    body: "The app stays open. Your brain, your drafts and your conversations are all still there to read. What stops is the spending, not the access.",
  },
  {
    at: "Subscribed",
    label: "You decide it was worth $49 a month",
    body: "The card comes out at the end, once you have seen it write. Cancel in the billing portal and it runs to the end of the period you have paid for.",
  },
] as const

/**
 * The setup sequence, for the round-two hybrids.
 *
 * **Read out of the flow this time, not out of row counts.** An earlier draft
 * of this list opened with "write down how you sound", which is backwards: you
 * never describe yourself to Quincy. You connect an account, it reads what you
 * already published, and *it* writes the description — then you correct it.
 * That reversal is the product, and a sequence that hides it is selling a
 * worse thing than the one that exists.
 *
 * The chain, in code:
 *
 * 1. `channel_connection` — OAuth. Two rows live, `x:active` and
 *    `linkedin:active`.
 * 2. `lib/corpus-x.ts` — one button on /sources ("Import posts") reads your own
 *    timeline into `source_item`, verbatim, never interpreting. 57 rows today,
 *    all `source='x'`. Metered: X removed the free tier in February 2026, so
 *    every page is bought at ~$0.005 a post.
 * 3. `lib/voice.ts` — the single model call in the pipeline. Same press. It
 *    emits a `portrait` ("specific enough that a stranger could pick their post
 *    out of a lineup"), rules, and stories with verbatim quotes and proof URLs.
 *    Landed as `provenance: "published"` — 1 voice page and 3 stories today.
 * 4. The ownership rule, `lib/voice.ts:240`, inherited verbatim from
 *    `lib/heartbeat.ts:195` — a page whose provenance is `user` is yours and
 *    the compile never overwrites it. 16 `user` pages against 4 `published`
 *    ones: in production this step is the majority of the brain.
 * 5. `riff` → `draft` → the approval gate. 10 and 7 rows.
 *
 * Steps 2 and 3 are one row here because they are one press — `importFromX()`
 * imports and compiles in a single action, and splitting them would invent a
 * step the user does not take.
 *
 * What is still left out, and why: `source_connection` has zero rows and
 * `lib/sources.ts:95` returns `{}` for every real account, so the *source
 * register* — Granola, GitHub, photos — is genuinely dead and is not sold.
 * (That is a different thing from /sources itself, which is where the live
 * channel read-back lives.) `scheduled_post` has zero rows and every
 * `rhythm_run` in production is `failed`, so the sequence ends at approval and
 * promises nothing about sending on a schedule.
 *
 * `you` and `quincy` are split because the thing being described alternates —
 * you do something, it does something back — and one of the variants makes
 * that alternation the whole structure. The `label` is the single-voice form
 * for the variants that do not.
 */
export const SEQUENCE = [
  {
    label: "You connect the accounts you already post from",
    you: "Connect the accounts you already post from",
    quincy:
      "Learns each channel’s real ceiling and its real fold, so a draft is written against the limit rather than trimmed to it afterwards.",
  },
  {
    label: "It reads those posts back and writes your portrait",
    you: "Press import, once",
    quincy:
      "Reads back what you have already published and writes down how you sound — the habits it can evidence, and the stories you keep returning to, each one carrying the posts that prove it.",
  },
  {
    label: "You correct the parts it got wrong",
    you: "Correct the parts it got wrong",
    quincy:
      "Never touches those pages again. A line you rewrite is yours, and every later pass writes around it rather than over it.",
  },
  /**
   * **The intended direction here is connector-fed, and it is not claimed
   * yet.** The design is that material arrives from what you already connected
   * — bookmarks, meetings — rather than from you handing anything over. One
   * rhythm exists for exactly that, `bookmarks-to-posts`, and it is scheduled
   * and running. It has also never once succeeded:
   *
   *     rhythm_run — bookmarks-to-posts: 5 runs, 5 failed, latest 2026-08-09
   *       12:00 "X is not connected."
   *       10:30 403 Forbidden        ← the bookmarks endpoint, refused by tier
   *
   * A 403 on bookmarks is an API access problem, not a bug that a retry fixes,
   * so "it reads your bookmarks" would be selling a path that has failed every
   * time it has ever run — including this morning. Meetings are the same shape:
   * plans/019 is unmerged and the granola rhythm does not run.
   *
   * What is live is the part that already produces most of the material:
   * `riff.source_id` is `voice` for 6 of 10 rows, `notes` for 2, `x` for 2. You
   * talk, and it lands as a riff. That is genuinely "something you actually
   * said", so the row stands on it and stays quiet about the rest.
   *
   * The moment one bookmarks run comes back `ok`, this row should be rewritten
   * to lead with it — it is the better sentence, and it will be true.
   */
  {
    label: "You talk, and it turns up as material",
    you: "Talk it out, or point it at a post worth answering",
    quincy:
      "Takes the voice note as it is, ramble and all, and finds the angles in it worth taking — then writes each channel on its own terms and in your voice. Not one string pasted into five boxes.",
  },
  {
    label: "You approve, and only then does it go",
    you: "Approve it, or rewrite the line you do not like",
    quincy:
      "Stops. Every version waits, and there is no switch anywhere that turns that off.",
  },
] as const

/**
 * The Statement variant's three questions. Chosen because they are the three a
 * stranger actually has at a price, not the ten a pricing page usually answers:
 * when am I charged, what happens if I do nothing, and how do I leave.
 */
export const QUESTIONS = [
  {
    q: "When does the card come out?",
    a: "After the free day, and only if you choose to continue. Quincy does not ask for one to start.",
  },
  {
    q: "What happens if I do nothing when the day ends?",
    a: "The account goes read-only. Everything you made is still there and still readable; Quincy simply stops writing until you subscribe.",
  },
  {
    q: "Can I cancel?",
    a: "In the billing portal, in one press. The subscription runs to the end of the period you have already paid for and then stops.",
  },
] as const

/**
 * The Ledger variant's left column: what the $49 buys.
 *
 * Every row is a surface that exists in `app/(app)` today. The temptation on a
 * pricing page is to list the roadmap in the present tense, and the row about
 * rhythms below is the deliberate refusal to do it.
 */
export const INCLUDED = [
  {
    item: "A brain you edit directly",
    body: "Your voice, your hard rules and your strategy as prose you can open and correct. Correct it once and the correction sticks instead of being repeated in every draft.",
  },
  {
    item: "A draft per channel, against that channel’s real limits",
    body: "Not one string pasted into five boxes. Each one written against the ceiling and the fold the platform actually enforces, with the count shown as you edit.",
  },
  {
    item: "Studio, and everything you say in it",
    body: "The conversations where the thinking happens are kept. Once a week Quincy compiles what is worth remembering and shows you what it wrote rather than deciding quietly.",
  },
  {
    item: "The approval gate, which is not a setting",
    body: "Every version waits. Nothing schedules or sends until you have read it, and there is no switch anywhere that turns that off.",
  },
  {
    item: "Your numbers against your own baseline",
    body: "What a post did compared to what you normally do, rather than compared to a stranger with a different audience.",
  },
  {
    /**
     * The honest row, and the reason this variant is worth building.
     *
     * `lib/rhythms.ts` carries an `available` flag: three of twenty-nine are
     * `true` — `bookmarks-to-posts`, `heartbeat`, `voice-refresh`. A pricing
     * page is where a buyer is entitled to know that, and saying it here costs
     * far less than a customer discovering it on day one.
     */
    item: "Three rhythms that run on their own, today",
    body: "Bookmarks into posts, the weekly heartbeat, and the voice refresh. There are more designed than are built, and the ones that are not built yet are marked as such inside the product rather than sold here.",
  },
] as const

/**
 * The Ledger variant's right column: the refusals.
 *
 * Carried over from the Contract direction in `app/prototypes/marketing`, which
 * lost as a whole landing page and is arguably right here — the pricing page is
 * where somebody is deciding whether to trust you with their name, which is the
 * question a ledger answers.
 */
export const REFUSALS = [
  {
    never: "Never posts anything you have not read",
    because:
      "Autoposting would have to be a decision made on purpose, not a default that arrives in a release note.",
  },
  {
    never: "Never cites a number you have not confirmed",
    because:
      "A figure in a post has to trace to something you can point at, or it is a liability with your name on it.",
  },
  {
    never: "Never invents a source",
    because:
      "One fabricated quote costs more trust than a year of good posts earns.",
  },
  {
    never: "Never shows you a follower chart",
    because:
      "Reach now follows the post, not the account. A follower line is a vanity number with a story attached to it.",
  },
  {
    never: "Never runs a thousand faceless accounts in your name",
    because:
      "The volume argument is right, and farming anonymous handles is still not what you hired a Head of Content for.",
  },
] as const
