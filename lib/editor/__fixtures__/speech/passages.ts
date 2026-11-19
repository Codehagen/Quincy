/**
 * Spoken passages for measuring the stumble detector (disfluency.ts).
 *
 * Each passage is written the way a transcriber returns speech: words with
 * their punctuation, one token per word. `|` marks a pause of 600 ms, which
 * the detector reads the way it reads a comma. `cut` lists the stumbles a
 * careful editor would take, by the exact words, in order. Everything not
 * listed is meant and must stay.
 *
 * Most passages are fluent on purpose. A false positive is a cut of
 * something the person meant to say, made without asking, so the fluent
 * text, with its doubles, lists and "like" as a verb, is where precision is
 * won or lost. The take from the editor's own mock is included as it was
 * transcribed.
 */

export type Passage = {
  name: string
  language: "en" | "no"
  text: string
  cut: {
    kind: "hesitation" | "repetition" | "false_start" | "discourse"
    phrase: string
  }[]
}

export const PASSAGES: Passage[] = [
  {
    name: "mock take",
    language: "en",
    text: "So, um, last week we shipped the new onboarding. We cut it from seven screens to two. Same questions, asked when they matter. Before, 48% of new people finished setup. This week it's 71%. The screens weren't the product. They were in the way. If you're building onboarding, count your screens. Then ask which ones you'd miss. Most of ours, nobody did.",
    cut: [{ kind: "hesitation", phrase: "um," }],
  },
  {
    name: "fluent product update",
    language: "en",
    text: "I like this release more than the last one. It was very very hard to get right, and I think that that is worth saying. We had had three attempts before it worked. Now it is fast, it is stable, and it is cheap to run. You know what changed? We stopped guessing. I mean it: no more guessing.",
    cut: [],
  },
  {
    name: "fluent walkthrough",
    language: "en",
    text: "First open the settings. Then pick the plan you want. If you like the yearly plan, pick that one. It is kind of a long page, so scroll down. The button is at the bottom, below the table. Press it once and wait. That is it. Bye bye.",
    cut: [],
  },
  {
    name: "stumbling explanation",
    language: "en",
    text: "We we shipped it on Monday. The the bug report came in at noon. We should, um, we need to look at the logs first. It was, like, huge. And then | uh | the fix went out. I think I think it works now.",
    cut: [
      { kind: "repetition", phrase: "We" },
      { kind: "repetition", phrase: "The" },
      { kind: "false_start", phrase: "We should," },
      { kind: "hesitation", phrase: "um," },
      { kind: "discourse", phrase: "like," },
      { kind: "hesitation", phrase: "uh" },
      { kind: "repetition", phrase: "I think" },
    ],
  },
  {
    name: "flytende oppdatering",
    language: "no",
    text: "Vi lanserte den nye versjonen i går. Det var veldig veldig mye arbeid, men det ble bra. Nei nei, det var ikke for sent. Vi testet den lenge, lenge, før vi slapp den. Hvis du liker den, si ifra. Du vet hvor du finner oss. Takk for nå, ha det bra.",
    cut: [],
  },
  {
    name: "flytende forklaring",
    language: "no",
    text: "Først åpner du innstillingene. Så velger du planen. Den er egentlig ganske enkel å forstå. Det er sånn vi har laget den. Ja, ja, det tar litt tid. Men det er verdt det, ikke sant?",
    cut: [],
  },
  {
    name: "snublende forklaring",
    language: "no",
    text: "Vi vi lanserte den i går. Det var, øh, det ble en lang dag. Den den første kunden ringte klokka ni. Det var, liksom, rart. Og så | ehm | fikset vi det.",
    cut: [
      { kind: "repetition", phrase: "Vi" },
      { kind: "false_start", phrase: "Det var," },
      { kind: "hesitation", phrase: "øh," },
      { kind: "repetition", phrase: "Den" },
      { kind: "discourse", phrase: "liksom," },
      { kind: "hesitation", phrase: "ehm" },
    ],
  },
]
