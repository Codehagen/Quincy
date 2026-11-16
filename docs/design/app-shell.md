# App shell: the frame around every app page

`AppShell` (`components/quincy/shell/`, exported from `@/components/quincy`)
is the frame every page in `app/(app)` sits in. `app/(app)/layout.tsx`
renders it once. It is KitRoot, the sidebar, the phone's bar, the billing
banner, and the `<main>` landmark the page fills. A desktop has no bar. A page owns none of it: a kit page renders `KitPage` (page.md) as its
own column inside `<main>`; a page not moved yet renders itself.

The shape is **Desk**, chosen in the shell lab (`/prototypes/shell-lab`) on
2026-11-16: no bar over the page by default, one flat list of places, the
setup pages in the account menu, the conversation history in Studio.

## Parts

| Part | What it is |
| --- | --- |
| `AppShell` | `defaultOpen` (from the `sidebar_state` cookie, so a collapsed sidebar never flashes open), `conversations` (Studio's history), `user`, `waiting`, `banner`, `children` |
| `AppSidebar` | the same contents on a desktop and in the phone's sheet: `QuincyMark`, the `NAV` rows, then the `AccountMenu` in the foot |
| `NAV` | the sidebar, flat, each row with its icon: Studio, Ideas, Drafts, Lineup, Numbers, Sources, Cuts (Beta) |
| `SETUP_NAV`, `ACCOUNT_NAV` | the account menu's links: Brain, Channels, Rhythm (touched once, then left), then Credits, Billing, Settings |
| `isActive`, `navItemFor`, `CONVERSATIONS_HREF` | the route model in `nav.ts`: adding a surface is one line. A plain module, so a server component and a test can read it. `nav.test.ts` fails when a page in `app/(app)` has no way in |
| `AccountMenu` | who you are; the setup and account links; theme (System, Light, Dark, and D from anywhere); Why Quincy works this way; sign out |
| History | Studio's control, not a sidebar list: an IconButton ("Conversations") whose Menu holds the recent threads and All conversations. On a desktop it is `ConversationHistory` in Studio's composer toolbar (the Composer's `tools` slot, after attach), opening upward; on a phone it is in the bar. Studio routes only (`/studio`, `/c/…`, `/conversations`) |
| Show sidebar | the one control over the page on a desktop: an IconButton in the content column's top-left corner, only while the sidebar is hidden |

## Rules

- **A tool's sidebar row opens the tool on the most recent work (Cuts
  opens the latest cut; Studio opens a fresh composer with history one
  click away); the index sits one click behind it.**
  Why: the row should take you into the room, not to a list of rooms. This
  holds for every tool row, not only Cuts.
  <!-- 2026-11-16: "Ok, så for cuts skal vi da ikke komme rett inn i studioet da?" -->
- **The sidebar is the frame, not an object.** 208px (`kit-sidebar`). Rows
  sit straight on the ground (`NavRow density="compact"`: 36px under a fine
  pointer, 44 under a coarse one) with no List around them; a white object
  there would compete with the one object on every page. Its edge is a
  `kit-hairline` line, not a shadow, drawn by an `::after` on the column's
  right edge rather than a border: a border took 1px out of the 208 (the
  contents overflowed by it) and popped on at frame 0 of the slide. The friend sits on the rows'
  icon column (`kit-shell-mark` = the shell's 8 + a row's 16).
- **No bar on a desktop.** Nothing sits in a row above the page; the
  billing banner, when there is one, is the first thing in the content
  column. A phone always has the bar (`kit-shell-bar`, 52): the menu button,
  the page's name centred, and in Studio the history.
- **The history sits with the conversation.** On a desktop it is in Studio's
  composer toolbar, beside attach, and its menu opens upward. The kit
  Composer takes it through `tools`, so the kit knows nothing of history.
  `ConversationHistory` reads the threads the shell loaded (a context in
  AppShell) and renders nothing outside the shell (the kit lab) or off
  Studio's routes. It is hidden under md, because the phone's bar already
  has it. `/conversations` has no composer and no history control on a
  desktop: the page is the list, so a menu of the same list would be a
  second copy of it.
- **Show sidebar is a corner, not a row.** While the desktop sidebar is
  hidden, its IconButton is absolute in the content column's top-left
  (`kit-shell-pad` in), over the page. Pages centre their column inside a
  gutter, so the corner is free. The column then sets `--kit-shell-inset`
  (the bar's 52), and the banner starts its words at
  `max(page gutter, --kit-shell-inset)`, so the control never sits on them.
- **⌘B / Ctrl+B** shows and hides the desktop sidebar (`aria-keyshortcuts`;
  the handler takes both modifiers, ignores a held key and any ⌘B an editor
  already handled). The Show control's tooltip carries the shortcut, read
  with `Kbd` (`mod`), never a hardcoded ⌘.
- **Desktop (≥ 768px)**: collapsing slides the column shut (a `width`
  transition, `--kit-duration-state`, `ease-kit-move`; none under reduced
  motion) and makes it `inert`, so Tab never walks into a panel you cannot
  see. The state is the cookie. Focus never falls to `<body>`: shutting from
  inside the sidebar lands on Show sidebar; opening from Show sidebar lands
  on the current row, with `preventScroll` (focusing inside a ~0px
  overflow-hidden column otherwise scrolls it sideways).
  `width`, not a transform, on purpose: the page has to take the room, and
  a transform slide either leaves a 208px gap beside the page until the
  end or lays the page out at its final width and clips it during the
  slide. Measured on a conversation (2026-11-16): 60fps, p95 frame 17.7ms,
  so the per-frame reflow is affordable; the duration is the short one to
  keep the frame count low.
- **Phone**: a Base UI Dialog sheet from the left over the kit `SCRIM`, with
  `shadow-kit-lifted` and `PORTAL_TYPE` (it is portalled out of KitRoot, and
  would otherwise read in Geist). It traps focus, closes on Escape, on the
  scrim, and on any navigation (an effect keyed on the path, so the account
  menu's links close it too). Escape and the scrim return focus to the menu
  button; a navigation moves it to `<main>` (tabIndex −1), so the next Tab
  starts in the new page. Reduced motion: a fade, no slide. Never persisted.
- **Where you are, on a setup or account page.** No sidebar row is lit, so
  the account trigger takes the selected grey. Visible only: `aria-current`
  on a menu button would announce the button as the page. The page's
  heading and the menu row's `aria-current="page"` say it to a screen
  reader.
- **History rows** have a fixed width capped by the viewport
  (`min(18rem, 100vw − 2rem)` with the panel's padding), a truncating title
  and its time at the end: the clock for today, otherwise the
  /conversations buckets (Yesterday, 3 days ago, 4 Nov). Two threads with
  one title read apart.
- **Sign out can fail.** better-auth answers with `{ error }` or throws; the
  row then reads "Could not sign out. Try again" in the kit's danger text
  (with a `role="status"` line for screen readers) and stays pressable.
  Only a success navigates.
- **Signed out, you come back to the page you asked for.** The proxy
  redirects a visitor with no cookie to `/login?next=<path+query>`. A dead
  cookie passes the proxy and is refused by the layout, which reads the
  path from the `x-quincy-path` request header the proxy sets. `/login`
  passes `next` through `safeNextPath` (lib/auth-validation.ts), which
  resolves it with the URL parser and refuses anything off-origin.
- **Skip link first.** "Skip to the page" is the first Tab stop and moves
  focus into `<main>`.
- **Labels follow plans/029 "Words"**: the row is **Ideas** and the route is
  `/ideas` (it was `/riffs`, which redirects). Cuts has its row, marked
  "Beta" (`badge`), while `/cuts` is unfinished.
- **Rows only go places.** Deleting a conversation is a HoldButton on the
  thread, never a row in the sidebar or the history menu (removing.md).

Tokens: `kit-sidebar` (208), `kit-shell-bar` (52: a 36px IconButton and 8 on
each side), `kit-shell-pad` (8), `kit-shell-mark` (24), `kit-scrim`.

## Open

- **`waiting` is not loaded.** `NavRow waiting` draws a dot (and ", 2
  waiting" in the row's name) on a row with things waiting, and opening the
  page clears it. The layout passes nothing yet, because nothing counts
  waiting work per route. Wire it when that reader exists; never show a
  count from nowhere.
- **Hiding the sidebar with a pointer.** An open desktop sidebar has no
  control to hide it; only ⌘B / Ctrl+B does (Desk). Showing it again has a
  button.
- The account trigger's selected grey is `ListRow selected="visual"`: the
  look without `aria-current`. The history menu is `MenuPanel width="wide"`.
- /conversations lights nothing in the sidebar (it is the index, not
  Studio); the phone bar names it "Conversations".
