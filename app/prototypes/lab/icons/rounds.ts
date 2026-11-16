import type { Round } from "../types"
import { pieces as a } from "./round-1/a"
import { pieces as b } from "./round-1/b"
import { pieces as c } from "./round-1/c"
import { pieces as d } from "./round-1/d"
import { pieces as a2 } from "./round-2/a"
import { pieces as b2 } from "./round-2/b"

export const ROUNDS: Round[] = [
  {
    id: "icons-2",
    title: "Icons, round 2 — narrow",
    note: "Made from 04 (Grid Q: whole pixels, sharper at 16 than at 120) and 20 (the marked friend: a page with eyes, wearing the highlighter). 21–30 push each; 31–40 cross them.",
    pieces: [...a2, ...b2].sort((x, y) => x.n - y.n),
  },
  {
    id: "icons-1",
    title: "Icons, round 1 — wide",
    note: "The mark and favicon. Each piece shows the mark large, at 32/16px, in a browser tab, on light and dark, and as an app icon. Four directions: letterform (01–05), editor's marks (06–10), voice and speech (11–15), abstract and stamp (16–20).",
    pieces: [...a, ...b, ...c, ...d].sort((x, y) => x.n - y.n),
  },
]
