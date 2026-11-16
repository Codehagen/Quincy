# Page: KitPage, searchParams, list and detail

The column every kit page sits in, and how a list and its open item share a
Stage. The frame around it (sidebar, bar, `<main>`) is app-shell.md; Stage,
Card and Window are in layout.md; gaps in spacing.md.

## KitPage

Every kit page in `app/(app)` is `<KitPage title="…">…</KitPage>`; the
AppShell around it already renders KitRoot and `<main>`. A page outside the
frame (a prototype) wraps it in `<KitRoot>` itself. KitPage is not a
landmark and never nests a second `<main>`. Never a hand-made
`<div className="mx-auto max-w-… px-…">`: the column is a token set, and a
page that guesses it drifts from every other page.

Props: `title` (string, the page's one `h1`, rendered at `text-kit-title`),
`summary` (one line of muted copy under the title, against the person's own
baseline, may hold a `Count`), `actions` (at most two controls at the
header's end: a quiet Button or ButtonLink, an IconButton, a Menu; never the
ink action, which belongs to the object it acts on), `children` (the
Stages).

It sets: width `max-w-kit-page` (720), side gutter `kit-page-gutter` (16 on a
phone, 32 from 40rem), `kit-page-top` 64, `kit-page-bottom` 96,
`kit-page-gap` 56 between the title and each Stage, and the landing's object
padding (28 × 24) on every Card from 40rem.

```tsx
// Correct
<KitPage title="Ideas" summary={<><Count value={3} /> ideas waiting. Your usual week clears 5.</>}>
  <Stage lead="Say what happened.">…</Stage>
  <Stage lead="This is what came back.">…</Stage>
</KitPage>

// Incorrect — a guessed column, and a second <main> inside the shell's
<main className="mx-auto max-w-3xl px-4 pt-10 pb-24 sm:px-8"><Text as="h1">Ideas</Text>…</main>
```

**Where KitPage renders.** KitPage is a shared component (no hooks, no
`"use client"`, no server-only imports), so it works from `page.tsx` or from
inside a client screen. One rule decides which, and one rule is fixed:

```
Does the summary change with what the person does on the page (a live Count)?
 ├── No  → KitPage in page.tsx (a server component); the screen is its child
 └── Yes → the client screen renders KitPage itself, so the summary and the
           Stages read one state. page.tsx renders the screen.
Either way: KitPage is never under a <Suspense> that waits on data. The title
renders before the data, so the page never opens blank.
```

Do not split the state to keep KitPage on the server (a provider around
KitPage, a summary island that subscribes to it). It buys a few bytes of
markup and costs a second place for the screen's state to live.

```tsx
// Correct — the summary counts what the screen holds, so the screen owns KitPage
export default function Page() {
  return <RiffsScreen initialRiffs={RIFFS} />
}
// riffs-screen.tsx ("use client")
<KitPage title="Ideas" summary={<><Count value={open} /> ideas waiting.</>}>…</KitPage>

// Incorrect — the title waits on the data
<Suspense fallback={null}><RiffsScreen searchParams={searchParams} /></Suspense>  // and RiffsScreen renders KitPage
```

A client screen that also reads `searchParams` takes the promise as a prop,
renders KitPage at once, and `use()`s the promise in a child inside its own
`<Suspense>`, below the title.

**A page that reads `searchParams`** (Next 16, `cacheComponents` is on):
KitPage and the title stay outside the read, and the promise goes
to a child inside `<Suspense>`. Awaiting it at the top of `page.tsx` is a
build error. The fallback is `null` or a LiveDot line (states.md), never a
Skeleton.

```tsx
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default function Page({ searchParams }: Props) {
  return (
    <KitPage title="Ideas">
      <Suspense fallback={null}><RiffsScreen searchParams={searchParams} /></Suspense>
    </KitPage>
  )
}
```

The props are typed by hand on purpose. Next's global `PageProps<"/riffs">`
is the same type, but it exists only after route types are generated
(`next dev`, `next build` or `next typegen` write `.next/types`), and
`pnpm typecheck` is plain `tsc`: on a fresh clone, or for a route added since
the last dev run, `PageProps` fails to typecheck. Use it only in a route
where you have run `pnpm next typegen`.

## List and detail

A list of things and the one that is open (Ideas, Drafts).

```
Where does the open item go?
 ├── Default → the SAME Stage: list Card, then the detail Card stacked under it
 ├── Does the detail need its own lead (a different kind of object, such as a
 │   draft opened from a riff)? → its own Stage, directly after the list's
 └── Never beside the list. Side by side is a split stage
```

- **Same width.** Both Cards take the same `width`. If the detail carries a
  MarginNote it is `with-margin`, so the list is `with-margin` too, and the
  left and right edges line up.
- **Rows only open.** The list is a `List` of `ListRow`s (lists.md);
  a row never holds a Button. The verbs (Draft, Dismiss) live in the detail.
- **At most 6 rows** before the detail. More is its own page, reached by a
  NavRow, so the detail is never far below the row that opened it. A
  ListHeading is not a row and does not count.
- **The open row is `selected`.** Picking a row keeps focus on the row.
  Never move focus to the detail. On a stage under 32rem the detail can sit
  below the fold, so bring its top into view with `useRevealOnNarrow`: put
  its ref on the detail Card and pass the open item's id. It scrolls only
  when the id changes after load, only on a narrow stage, `block:
  "nearest"`, and without smooth scrolling under reduced motion.
- **Removing the open item** (Dismiss in the detail): the detail goes, the
  row folds away, and an `UndoBar` with the same `width` stands under the
  list (removing.md).
- **Key the detail by the item** (`key={item.id}`), so its local state
  (pending, drafted) resets when another row opens.

```tsx
// Correct
const detailRef = useRevealOnNarrow<HTMLDivElement>(open?.id)
<Stage lead="This is what came back.">
  <List width="with-margin">
    {riffs.map((r) => <ListRow key={r.id} selected={r.id === open?.id} onClick={() => setOpenId(r.id)}>{r.title}</ListRow>)}
  </List>
  {open ? <Card key={open.id} ref={detailRef} width="with-margin">…</Card> : null}
  <UndoBar show={undo != null} width="with-margin" onUndo={restore}>{undo?.sentence}</UndoBar>
</Stage>

// Incorrect — a hand-measured stage width and a hand-rolled scroll flag
useEffect(() => { if (stage.getBoundingClientRect().width < 512) card.scrollIntoView() }, [openId])
```
