# Editor marks: Highlight, MarginNote, Beats

Quincy is a human editor. It does three things to a page, the way an editor
does with a pen: it highlights the one sentence that matters, writes a short
note in the margin, and names a draft's three beats. These are the product's
voice on the page, so they are scarce. A page with every mark on it reads as a
dashboard with handwriting.

## When Quincy marks up a page

```
Is there one sentence the person must not miss (the result, the reason)?
 ├── Yes → Highlight it
 └── No  → no Highlight
Does Quincy have an opinion about a specific line ("your best hour", "I wouldn't")?
 ├── Yes → MarginNote around that line
 └── No  → no note. A note that restates the line is noise.
Is the object a draft post?
 ├── Yes → BeatBracket each of its three beats, inside Beats
 └── No  → no brackets. Beats name a post's structure, nothing else.
```

Limits per object (Card or Window):

- **Highlight: at most 1.** Two highlights compete and neither wins. Never on a
  heading: a heading already has weight.
- **MarginNote: at most 1**, plus the three beat brackets on a draft. Two notes
  beside one object read as an argument.
- **BeatBracket: exactly 3 or 0.** `did`, `happened`, `meant`. There is no
  fourth beat, and one bracket never wraps two beats.
- A Highlight and a MarginNote may mark the same line (lab 01, 28): the note
  waits for the sweep with `timing="after-highlight"`.

In development the kit warns once in the console for each broken rule it can
see: a second Highlight in one Card or Window, a Highlight inside a heading,
a MarginNote in a `crop="corner"` or full-width Card, a second MarginNote in
one object. A warning is a bug in the page, not noise.

Never on: navigation, settings, buttons, empty chrome, or anything the person
wrote that Quincy has not read. The marks are Quincy's reading, so they appear
only where Quincy has read something.

## Highlight

The yellow sweep under the one sentence that matters. Sweeps once (700ms) the
first time 40% of it is on screen. Pass `active` to drive it yourself (a tab
swap); flipping it back retargets mid-sweep. Under reduced motion it is
simply there. Use `Text weight="strong"` instead when the line is a label, not
a finding.

```tsx
// Correct — lab 28: one finding, highlighted, the median beside it in grey
<Text><Highlight>That is 1.4× your usual week.</Highlight> <Muted>1,210 is your median.</Muted></Text>

// Incorrect — two highlights in one card, one of them on a heading
<Text weight="strong"><Highlight>Thursday</Highlight></Text>
<Text><Highlight>That is 1.4× your usual week.</Highlight></Text>
```

## MarginNote

A handwritten note (Caveat 21, graphite) in the margin beside the line(s) it
wraps, with a thin bracket spanning them.

Props: `note` (a few words, lower case, Quincy's voice, no full stop needed),
`children` (the line or lines it is about), `show` (default `true`),
`timing` `at-rest` (default) | `after-highlight`.

- The Card needs `width="with-margin"`; the column is 170px plus a 10px gap.
- Never inside `crop="corner"`: there is no margin left.
- The wrapped block must reach the object's content edge, or the note floats
  at the wrong x.
- Under a 512px stage, or outside any Stage, the note sits under its line
  and the bracket goes.
- Hand-written means short: ≤ 6 words. "read before standup. your best hour."

```tsx
// Correct — lab 38: an editor's aside on the thing it is about
<MarginNote note="pick one. you don't have to write it up">
  <div role="group" aria-label="Start with">…</div>
</MarginNote>

// Incorrect — the note restates the line; it adds nothing Quincy read
<MarginNote note="this is the draft"><Text>The draft.</Text></MarginNote>
```

The handwriting (`Hand`) and `Bracket` are internal. There is no bare
handwritten note; every note is about a line.

## Beats and BeatBracket

The blue pen naming a draft's beats: "what I did", "what happened", "what it
meant". Wrap the three brackets in `Beats` so pointing at one with a mouse
quiets the other two (to 26% opacity). Hover enhances and never hides: touch
and keyboard always see all three.

```tsx
// Correct — lab 21
<Beats>
  <BeatBracket beat="did"><Text>I cut our onboarding email down to one question.</Text></BeatBracket>
  <BeatBracket beat="happened">
    <Text>Replies in the first week:</Text>
    <Text variant="figure">31</Text>
    <Text variant="small" tone="muted">Your median is 6.</Text>
  </BeatBracket>
  <BeatBracket beat="meant"><Text>People answer a question. They skip a brochure.</Text></BeatBracket>
</Beats>

// Incorrect — two beats in one bracket, and only two of three
<BeatBracket beat="did"><Text>I cut the email.</Text><Text>Replies went up.</Text></BeatBracket>
<BeatBracket beat="meant"><Text>People answer a question.</Text></BeatBracket>
```

**A draft card is its own room.** `DraftCard` (and the chat's writing card)
wraps its Card in `DRAFT_ROOM`, a `kit-stage` size container, so the card
measures the space it sits in rather than needing a Stage around it. From
32rem the card gives up the margin column and the three brackets stand to
the right of the lines, as on the landing's picture; under 32rem each label
sits under its lines. The same card does this in Studio's chat, in /drafts'
Stage and in the lab, and the width comes from the room, never from the
marks, so the lines do not reflow when the brackets appear.

A post that has no clear "happened" is not ready; do not bracket it with a
guess. Fix the draft, then mark it.
