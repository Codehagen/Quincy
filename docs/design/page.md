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
Stages), `width` (`page`, the default, or `wide`; below).

It sets: width `max-w-kit-page` (720, or `max-w-kit-wide` 1280 with
`width="wide"`), side gutter `kit-page-gutter` (16 on a
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

The props are typed by hand on purpose. Next's global `PageProps<"/ideas">`
is the same type, but it exists only after route types are generated
(`next dev`, `next build` or `next typegen` write `.next/types`), and
`pnpm typecheck` is plain `tsc`: on a fresh clone, or for a route added since
the last dev run, `PageProps` fails to typecheck. Use it only in a route
where you have run `pnpm next typegen`.

### Width

```
Which frame?
 ├── A queue worked through daily, item by item, by key (Ideas)
 │     → no KitPage: WorkspacePage, full bleed and full height ("Workspace", below)
 └── Every other page → KitPage
      ├── Default, every page                                 → width="page" (720)
      └── List and detail that should use a wide screen      → width="wide" (1280)
```

`wide` raises the column's cap to `--container-kit-wide` (80rem) and
changes nothing else: gutter, top, floor and gaps are the same. It is for
list and detail only (below, "Wide"). A page of prose, a form, or single
objects stays `page`: on a wide column every Stage is as wide as the page,
and a line of prose that long is not read.

```tsx
// Correct — the screen lays its list and detail side by side when the stage allows
<KitPage title="Drafts" summary={summary} width="wide">…</KitPage>

// Incorrect — a wide page with nothing to put beside anything: a 1216px Card of prose
<KitPage title="Settings" width="wide">…</KitPage>
```

## List and detail

A list of things and the one that is open (Ideas, Drafts).

```
Where does the open item go?
 ├── Default → the SAME Stage: list Card, then the detail Card stacked under it
 ├── On a width="wide" page, on a stage ≥ --container-kit-split (66rem)
 │   → the same Stage, the list in a left column, the detail beside it ("Wide")
 ├── Does the detail need its own lead (a different kind of object, such as a
 │   draft opened from a riff)? → its own Stage, directly after the list's
 └── Otherwise never beside the list. Two unrelated objects side by side is a split stage
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

### Wide

On a `width="wide"` page, list and detail stand side by side once the Stage
is at least `--container-kit-split` (66rem, 1056px). Under it, the single
column above, unchanged. The test is a container query on the Stage
(`@kit-split/kit-stage:`), not the viewport: the sidebar takes 208 of the
window, and what matters is the room the Stage actually has.

- **Two columns.** The list in `--container-kit-list` (24rem, 384), then
  `kit-page-gutter` (32), then the detail in the rest. At the breakpoint the
  detail column is 640, so a `with-margin` detail keeps about the 460 it
  has on a 720 page: the split never makes the detail narrower than the
  single column it replaces. At the 1280 cap the column is about 800 and the
  card about 620, which holds prose near 70 characters, so the detail needs
  no measure of its own.
- **Each column is a `kit-stage` container** from the breakpoint on
  (`[container:kit-stage/inline-size]`). The list column is under 32rem, so
  the List drops the margin column and fills it, with no change to its
  `width` prop; the detail column is over it, so a `with-margin` detail
  keeps its notes.
- **The list column sticks** (`top-kit-group`) and, past the window's height,
  scrolls inside itself. The scroll pads 12 and takes it back with a negative
  margin, so the List's ring and shadow are not clipped.
- **The UndoBar and a refusal stand under the list**, in the list column and
  outside its scroll, stacked with `STAGE_STACK` so a closed UndoBar folds as
  it does in a Stage. Under the breakpoint they stay under the detail. Where
  they stand is the one thing decided in script, by measuring the Stage
  against the same variable; the columns are CSS, so the first paint is
  already right.
- **Focus and the reveal are unchanged.** Picking a row keeps focus on the
  row; `useRevealOnNarrow` never scrolls here, since the Stage is wide. A
  row picked while the page is scrolled past the detail's top brings that
  top back (`block: "start"`, not smooth under reduced motion).

```tsx
// Correct — one Stage; a column per side from the breakpoint on
<Stage lead="This is what came back.">
  <div className="flex flex-col gap-kit-stack self-stretch @kit-split/kit-stage:grid @kit-split/kit-stage:grid-cols-[var(--container-kit-list)_minmax(0,1fr)] @kit-split/kit-stage:items-start @kit-split/kit-stage:gap-x-kit-page-gutter">
    <div className={`${STAGE_STACK} @kit-split/kit-stage:sticky @kit-split/kit-stage:top-kit-group @kit-split/kit-stage:[container:kit-stage/inline-size]`}>
      <List width="with-margin">…</List>
    </div>
    <div className="min-w-0 @kit-split/kit-stage:[container:kit-stage/inline-size]">
      <Card key={open.id} ref={detailRef} width="with-margin">…</Card>
    </div>
  </div>
</Stage>

// Incorrect — a viewport breakpoint and a guessed column: wrong with the sidebar open
<div className="xl:grid xl:grid-cols-[380px_1fr]">…</div>
```

No page is `wide` today: Ideas was, until it became a workspace
(2026-11-16, below). Drafts has the same list and open shape and would take
this treatment; it is still `page`.

## Workspace

A page you work through rather than read (docs/design/workspace.md): a
toolbar, a dense list, the open item in a pane beside it, a foot of keys.
It replaces KitPage whole: no 28px title, no Stage leads, no 720 column.
Ideas is the first (components/riffs/ideas-workspace.tsx).

`WorkspacePage` (components/kit/workspace-page.tsx) is its frame, chosen
over a `width="full"` on KitPage because nothing of KitPage survives: not
the title, not the gutter, not the top and bottom air, not the gaps.

- **Full bleed, full height.** It fills `<main>`, which AppShell gives a
  definite height, so each Panel scrolls inside itself and the toolbars and
  the foot never scroll away. The page never scrolls as a whole.
- **One Announcer, `data-letter-keys`, and a size container**
  (`kit-workspace`), so a pane's width is `cqi` of the workspace, never `vw`.
- **The shell's corner.** With the sidebar hidden, the first Toolbar starts
  its controls past the Show control (`--kit-shell-inset`).
- **The fold is the page's.** Under ~900px of workspace (or where the
  detail pane would leave the title column under 320) the page renders one
  column whose rows open in place, from the same store. Measured on the
  frame (`ref`), never the viewport.

```tsx
// Correct — the frame, then its rows: toolbars, panes, foot
<WorkspacePage ref={ref}>
  <Toolbar label="Ideas" divided={false}><ToolbarTitle>Ideas</ToolbarTitle>…</Toolbar>
  <Toolbar label="Filters" size="filter">…</Toolbar>
  <WorkspacePanes>
    <Panel label="Ideas"><PanelBody><DataList …/></PanelBody></Panel>
    <Panel label="Open idea" width="clamp(440px, 36cqi, 560px)" edge="start">…</Panel>
  </WorkspacePanes>
  <KeyBar keys={KEYS} />
</WorkspacePage>

// Incorrect — a workspace inside a KitPage: a 28px title over a toolbar, and a page that scrolls the panes away
<KitPage title="Ideas" width="wide"><Toolbar …/>…</KitPage>
```
