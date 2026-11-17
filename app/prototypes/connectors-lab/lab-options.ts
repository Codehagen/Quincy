/** The lab's undecided numbers (control-panel.tsx), read by both directions. */
export type LabOptions = {
  /** 1 · Grid: columns at full width. The grid drops to fewer as the page narrows; a phone is one. */
  cols: 2 | 3 | 4
  /** Card padding and gaps: comfortable (the reference's air) or compact. */
  density: "comfortable" | "compact"
  /** The one operational number on a connected card. */
  metric: "on" | "off"
  /** What a card not connected hands over, as chips. */
  tags: "on" | "off"
  /** panel: the cards inside one white object (the reference); ground: each card lifted on the page. */
  frame: "panel" | "ground"
  /** Connected status: the live dot and the word, or the word alone (the old rule: a connection is permission). */
  mark: "dot" | "words"
  /** The header's pill: ink (the reference), or quiet (the kit: the action belongs to an object). */
  header: "ink" | "quiet"
  /** Show a small "proposed" next to every control with nothing behind it yet. */
  proposed: "show" | "hide"
  /** Lab only: the server action or route behind each verb, in mono under the verbs. */
  wiring: "on" | "off"
}

export const DEFAULT_OPTIONS: LabOptions = {
  cols: 3,
  density: "comfortable",
  metric: "on",
  tags: "on",
  frame: "panel",
  mark: "words",
  header: "ink",
  proposed: "show",
  wiring: "off",
}
