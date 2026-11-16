import type { Round } from "./types"
import { pieces as a } from "./round-1/a"
import { pieces as b } from "./round-1/b"
import { pieces as c } from "./round-1/c"
import { pieces as d } from "./round-1/d"
import { pieces as a2 } from "./round-2/a"
import { pieces as b2 } from "./round-2/b"
import { pieces as c2 } from "./round-2/c"
import { pieces as d2 } from "./round-2/d"

/**
 * Newest round first. Earlier rounds stay on the page: the lab is the record of
 * what was kept and what was thrown away, and the skill that comes out of it
 * is written from both.
 */
export const ROUNDS: Round[] = [
  {
    id: "round-2",
    title: "Round 2 — narrow",
    note: "Made from 01, 02, 05, 07, 08, 13, 17, 19. One grey stage, one white card; Quincy as a human editor (margin notes, highlighter, three beats); real surfaces of the product rather than pictures of it. Writing (21–25), planning (26–30), capture (31–35), chrome (36–40). Brief: round-2/BRIEF.md.",
    pieces: [...a2, ...b2, ...c2, ...d2].sort((x, y) => x.n - y.n),
  },
  {
    id: "round-1",
    title: "Round 1 — stageshow",
    note: "Reference: benji.org/stageshow. Near-white ground, quiet grey stages, Inter at 14px with hierarchy by weight and grey, real product UI cropped by the frame, one accent per piece, every motion has a cause. Four axes: reading and annotation (01–05), hero demos with a window and a cursor (06–10), feature tiles and bento (11–15), single controls you can touch (16–20). Nothing inherited from the current app.",
    pieces: [...a, ...b, ...c, ...d].sort((x, y) => x.n - y.n),
  },
]
