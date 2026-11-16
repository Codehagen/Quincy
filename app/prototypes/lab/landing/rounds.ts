import type { Round } from "../types"
import { pieces as a } from "./round-1/a"
import { pieces as b } from "./round-1/b"
import { pieces as c } from "./round-1/c"
import { pieces as d } from "./round-1/d"
import { pieces as a2 } from "./round-2/a"
import { pieces as b2 } from "./round-2/b"
import { pieces as r3 } from "./round-3"

export const ROUNDS: Round[] = [
  {
    id: "landing-3",
    title: "Landing, round 3 — one direction",
    note: "Made from 02, 05, 07, 09, 26, 28 and the favourite, 30. Light theme; Pixel friend as the character; editor marks in two or three places only; connectors two-sided (what Quincy reads, where it posts); Quincy comes to you. Five variants of one page.",
    pieces: [...r3].sort((x, y) => x.n - y.n),
  },
  {
    id: "landing-2",
    title: "Landing, round 2 — whole pages",
    note: "Made from 02, 05, 07, 09: the real product is the picture, Quincy's editor marks sit on it, and a work receipt ends on 'held for your read'. Each piece is a full page at 1200px; scroll inside the frame. 21–25 light (wallpaper, phone); 26–30 dark.",
    pieces: [...a2, ...b2].sort((x, y) => x.n - y.n),
  },
  {
    id: "landing-1",
    title: "Landing, round 1 — wide",
    note: "Hero + first section, 20 ways. The first prototype was too close to its reference; this round takes one thing from a reference and pushes it somewhere of Quincy's own. Four directions: the editor's page (01–05), the product as hero (06–10), the argument first (11–15), the week as structure (16–20).",
    pieces: [...a, ...b, ...c, ...d].sort((x, y) => x.n - y.n),
  },
]
