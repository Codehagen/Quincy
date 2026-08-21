/**
 * Brand tokens as sRGB hex. Email clients do not understand oklch, so the app's
 * ramps cannot be used directly — these are the resolved values.
 *
 * This is the only copy. It lived in three files (both templates and lib/mail)
 * until a contrast fix had to be made in all of them, which is the usual way a
 * duplicated palette announces itself.
 */
export const MAIL_COLORS = {
  brass: "#cf8f3d",
  // Darkened from #93662c, which measured 4.09:1 on `paper` and so failed AA
  // for body-size link text. Only L moved — chroma and hue are untouched, per
  // the ramp rule in AGENTS.md. Now 4.87:1 on paper, 5.49:1 on card.
  brassDeep: "#875a1f",
  paper: "#ede7df",
  card: "#f7f5f2",
  rule: "#d8cfc6",
  muted: "#5e5a55",
  ink: "#33302c",
} as const
