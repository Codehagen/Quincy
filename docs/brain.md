# The Brain

Quincy writes in your voice. The brain is where "your voice" is stored, edited,
and kept current. It is the difference between an agent that drafts and an agent
that drafts like you.

Four surfaces already exist in the sidebar under Setup — Rhythm, Sources, Voice —
and this is the data behind them.

## What goes here, and what does not

Three layers, three purposes. Every piece of information lands in exactly one.

| Layer | Holds | Example |
| --- | --- | --- |
| **Brain** | Facts about you and your work | "Sold Docdir to Broker AS, April 2026" |
| **Conversation** | What was said in one thread | "make that shorter" |
| **Session** | The current turn | the draft on screen right now |

The test: would this still matter in six months, and is it hard to reconstruct
from the transcripts? Brain. Otherwise it belongs in the conversation and dies
with it.

A preference about how Quincy should behave ("always ask before scheduling") is
a `voice` or `instruction` page, not a stray note. If it is worth obeying twice,
it is worth storing.

## The one invariant

**Structured data is authoritative. Prose is rendered from it.**

Not the other way round, and never both at once for the same claim.

The reason is concrete. The posting cadence drives queue slots. If code reads a
number that a model parsed out of free text, then rewording a sentence silently
changes when your posts go out, and nothing in the interface tells you it
happened. That is the same shape as a schema bug: invisible until it costs you
something.

So: anything code reads lives in `data` and gets a real control in the UI.
Anything only the model reads lives in `body` as prose.

## Page kinds

One table, one `kind` column. The compiled-truth machinery, versioning, and
event log are identical across kinds; splitting them into separate tables would
duplicate all of it four times.

| Kind | Authoritative | Cap | Notes |
| --- | --- | --- | --- |
| `identity` | `body` | 50k chars | Who you are. Grows freely. |
| `voice` | `data` | 15 rules | How you write. Hard cap forces curation. |
| `instruction` | `data` | 15 rules | Hard rules Quincy must obey. |
| `policy` | `data` | one per platform | Goal, audience, pillars, cadence, windows. |
| `story` | `data` | none | The story bank. |
| `memory` | `body` + events | none | Auto-extracted, user-correctable. |

`voice` is separate from `identity` on purpose. Identity facts ("based in Bodø")
and voice rules ("never write 'we have been building it for a while'") change at
completely different rates and deserve different review. Folding them into one
page means a voice rule can be lost inside an essay about yourself.

### The story schema

A story is not a note. It is a reusable unit with a fixed shape:

```ts
{
  narrative: string    // one paragraph, what happened
  point: string        // one sentence, the lesson that generalises
  hook: string         // the opening line, in the language you post in
  quotes: string[]     // your own words, verbatim
  proof: string[]      // checkable facts: dates, outcomes, names
  useFor: string[]     // when to reach for this one
  theme: string        // grouping for the index
}
```

`proof` carries the most risk in the whole system. It is what lets Quincy write
a specific number into a post that goes out under your name. A fabricated proof
point is the worst failure this product can have, so `proof` may only come from
a source you have already approved. See Provenance below.

`useFor` is the retrieval key. It is written in plain language by a human, which
means you can read why Quincy picked a story, and correct it by editing a
sentence.

## Schema

```ts
// lib/schema-app.ts

export const brainPage = pgTable(
  "brain_page",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // 'identity' | 'voice' | 'instruction' | 'policy' | 'story' | 'memory'
    kind: text("kind").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    // Prose. Authoritative for identity and memory; rendered for the rest.
    body: text("body").notNull().default(""),
    // Structured. Authoritative for voice, instruction, policy, story.
    data: jsonb("data").notNull().default({}),
    // How this page got here. Gates whether proof may be cited.
    provenance: text("provenance").notNull().default("user"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // Scoped to the user, not global. A primary key without a tenant in it is
    // how two accounts end up sharing a row — see commit 5a6e9c7.
    unique("brain_page_user_slug_key").on(table.userId, table.slug),
    index("brain_page_user_kind_idx").on(table.userId, table.kind),
  ]
)

export const brainEvent = pgTable(
  "brain_event",
  {
    id: text("id").primaryKey(),
    pageId: text("page_id")
      .notNull()
      .references(() => brainPage.id, { onDelete: "cascade" }),
    // 'observation' | 'correction' | 'compile'
    kind: text("kind").notNull(),
    // 'conversation:<id>' | 'post:<id>' | 'user' | 'heartbeat'
    source: text("source").notNull(),
    confidence: text("confidence").notNull().default("medium"),
    summary: text("summary").notNull(),
    detail: text("detail").notNull().default(""),
    observedAt: timestamp("observed_at").notNull().defaultNow(),
  },
  (table) => [index("brain_event_page_observed_idx").on(table.pageId, table.observedAt)]
)

export const brainPageVersion = pgTable("brain_page_version", {
  id: text("id").primaryKey(),
  pageId: text("page_id")
    .notNull()
    .references(() => brainPage.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  data: jsonb("data").notNull(),
  snapshotAt: timestamp("snapshot_at").notNull().defaultNow(),
})
```

Events are append-only, so they are never versioned. Only the compiled page is
snapshotted, and only when it is rewritten.

There is deliberately no denormalised timeline column. Rendering the event list
on read costs one query; keeping a text copy in sync costs a bug every time
someone forgets.

## Provenance, and why corrections stick

Every page and every event carries where it came from:

| Provenance | Means | May supply `proof` |
| --- | --- | --- |
| `user` | You wrote or edited it | yes |
| `published` | Compiled from a post you published | yes |
| `confirmed` | Quincy proposed it, you accepted | yes |
| `inferred` | Quincy extracted it, unreviewed | **no** |

**The compile rule: once you have edited a memory page, Heartbeat stops writing
to it.** That is what turns "your corrections stick" from a sentence in the UI
into a property of the system. Without it, the next background run quietly
reverts you.

The test is provenance, not timestamps. Comparing a correction's time against
the newest evidence reads at page level, and at page level there is no way to
tell "the user revised this exact claim" from "the user mentioned something else
on the same topic". The first implementation compared timestamps and let a
contradiction be appended underneath a correction, which is worse than being out
of date: a page asserting both halves gives the model no way to choose.

Deliberately stubborn, and deliberately not lossy. Facts Heartbeat declined to
write land as low-confidence events on the page itself, where a review surface
can surface them, and the watermark still advances so nothing is retried
forever.

## The write contract

All writes go through `lib/brain.ts`. Nothing else touches these tables, and the
model never gets raw SQL.

```ts
appendEvent(pageId, { kind, source, summary, detail, confidence })
putCompiled(pageId, { body, data })   // snapshots the previous version first
applyCorrection(pageId, { field, value, note })
proposePage(userId, draft)            // lands as provenance: 'inferred'
confirmPage(pageId)                   // 'inferred' -> 'confirmed'
```

The AI tool definitions call these functions. A malformed edit from a model
cannot break the invariants because it never gets the chance to write one.

## Heartbeat

The recurring job. Vercel Cron.

**Nothing is compiled during a conversation.** Synthesis mid-turn writes down
what the model just invented rather than what you confirmed. Capture is cheap
and inline; compilation is deliberate and scheduled.

| When | What |
| --- | --- |
| Every chat turn | `appendEvent` only. One insert, no model call. |
| Heartbeat | Compile the capture inbox into `memory` pages. Fold published posts into the story bank. Rebuild the index counts and the gap list. |

Scheduled in `vercel.json`, Mondays at 22:17. The route is
`/api/cron/heartbeat` and it checks `CRON_SECRET` before doing anything —
without that check it is a public endpoint that rewrites everyone's memory on
request. It answers 404 rather than 401 to an unauthenticated caller, so the
path is not confirmed to exist.

Cron rather than a durable workflow. The property a workflow would sell us,
safe to interrupt and re-run, is already a property of the schema: events are
append-only and never consumed, `putPage` snapshots before it overwrites, and
the watermark is the last thing written. A run that dies halfway costs nothing
to repeat. Revisit when one run stops fitting in one function invocation.

Stories are compiled from **published posts**, not from raw chat. A published
post is text you already approved and put your name on, which is what makes its
`proof` safe to cite later. Chat is unapproved by definition. Quincy may still
propose a story from a conversation, but it lands as `inferred` and shows up as
a card you accept, the same way a draft does.

The gap list ("themes with no material yet") is a query over themes with zero
stories, not a note anyone maintains.

Note on the name: Heartbeat here is the maintenance loop. If Quincy later grows
a proactive check-in that decides whether to message you unprompted, that is a
second responsibility on the same schedule, not a second job.

## Reading the brain

At current scale there is no retrieval, and that is the correct design, not a
shortcut.

`identity`, `voice`, `instruction` and the active `policy` go into the system
prompt in full. Together they are a few thousand tokens.

For stories, the **index** goes into the prompt: title, `point`, and `useFor`
per story, roughly 50 tokens each. Fourteen stories is about 700 tokens. The
model sees the whole catalogue at once and pulls the full narrative, quotes and
proof through a tool call when it decides to use one.

This beats embeddings at this size, costs no vector index, and leaves a readable
trail of why a story was chosen.

## Not building yet

| Deferred | Trigger to revisit |
| --- | --- |
| pgvector + embeddings | The brain stops fitting in the prompt |
| Hybrid search with RRF | Same |
| Typed graph links, orphan detection | Pages start referencing each other |
| Per-page markdown export | Someone asks to leave |

For calibration: gbrain, the most complete open implementation of this pattern,
defaults to embedded PGLite and only suggests a managed Postgres at 1000+ files.
Quincy will have roughly 20 pages per user. Building retrieval now is building
for a scale three years out.

## Where these decisions came from

- **Compiled truth + append-only timeline**, the split between current synthesis
  and evidence: gbrain's page model (`pages.compiled_truth` + `timeline_entries`).
- **Writes through a narrow API**: gbrain's `src/core/operations.ts`, and the
  BRAIN.md convention of routing every write through one CLI.
- **Background compilation rather than inline**: converged across gbrain's
  nightly cycle and Letta's sleep-time.
- **Structured data rendered to prose**: the tell is broken pluralisation.
  "Publish around 1 posts/day" is a string template with a numeric slot, which
  means the fields are the source and the paragraph is only the view.
- **Hard caps on rule lists**: a counter like "1 / 15 rules" is what stops a
  rule list from becoming an essay nobody obeys.
- **Tenant-scoped keys**: not borrowed. Learned here, in commit 5a6e9c7, where a
  primary key with no user in it put two accounts on one row.
