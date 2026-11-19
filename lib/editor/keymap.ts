/**
 * Every key the Cuts editor answers, in one table.
 *
 * The table drives three things that used to drift apart: the keydown
 * handler in studio.tsx, the shortcut shown in a toolbar tooltip, and the
 * sheet `?` opens. A key that does something and is not in the sheet is a
 * key nobody finds; a key in the sheet that does nothing is worse.
 *
 * The bindings follow the conventions people bring from other video editors
 * (shuttle on J K L, marks on I and O, a frame per arrow), because a person
 * who has cut video before reaches for those first and an editor that ignores
 * them feels like a toy. Who owns a press at all (a text field, the chat, a
 * focused control) is decided before this, in components/editor/editor-keys.ts.
 *
 * `mod` is ⌘ on Apple and Ctrl elsewhere; the handler accepts either, and the
 * hint (`Kbd`) shows the right one.
 */

export type KeyAction =
  | "toggle-play"
  | "pause"
  | "play-forward"
  | "back-second"
  | "frame-back"
  | "frame-forward"
  | "second-back"
  | "second-forward"
  | "previous-cut"
  | "next-cut"
  | "go-start"
  | "go-end"
  | "slower"
  | "faster"
  | "split"
  | "mark-in"
  | "mark-out"
  | "clear-marks"
  | "delete-range"
  | "trim-start"
  | "trim-end"
  | "delete"
  | "add-zoom"
  | "undo"
  | "redo"
  | "deselect"
  | "timeline-in"
  | "timeline-out"
  | "timeline-fit"
  | "shortcuts"
  | "add-marker"
  | "copy"
  | "paste"
  | "duplicate"
  | "select-all"

export type KeyGroup = "Playback" | "Editing" | "View"

export type KeyBinding = {
  action: KeyAction
  /** `KeyboardEvent.key`. Letters match either case. */
  key: string
  /** ⌘ on Apple, Ctrl elsewhere. */
  mod?: boolean
  /**
   * true or false must match; left out, Shift is ignored. Left out for keys
   * whose character already needs Shift on some layouts (`?`, `<`, `+`).
   */
  shift?: boolean
  alt?: boolean
}

export type KeyEntry = {
  action: KeyAction
  label: string
  group: KeyGroup
  /** The keys shown, first one first. Each is a chord, as `Kbd` takes it. */
  hints: readonly (readonly string[])[]
  bindings: readonly KeyBinding[]
}

const b = (
  action: KeyAction,
  key: string,
  extra: Omit<KeyBinding, "action" | "key"> = {}
): KeyBinding => ({ action, key, ...extra })

export const KEYMAP: readonly KeyEntry[] = [
  // ── Playback ──────────────────────────────────────────────────────────
  {
    action: "toggle-play",
    label: "Play or pause",
    group: "Playback",
    hints: [["Space"]],
    bindings: [b("toggle-play", " ", { mod: false })],
  },
  {
    action: "play-forward",
    label: "Play; press again to go faster",
    group: "Playback",
    hints: [["L"]],
    bindings: [b("play-forward", "l", { mod: false, alt: false })],
  },
  {
    action: "pause",
    label: "Pause",
    group: "Playback",
    hints: [["K"]],
    bindings: [b("pause", "k", { mod: false, alt: false })],
  },
  {
    action: "back-second",
    label: "Pause and step back a second",
    group: "Playback",
    hints: [["J"]],
    bindings: [b("back-second", "j", { mod: false, alt: false })],
  },
  {
    action: "frame-back",
    label: "Back one frame",
    group: "Playback",
    hints: [["←"]],
    bindings: [
      b("frame-back", "ArrowLeft", { mod: false, shift: false, alt: false }),
    ],
  },
  {
    action: "frame-forward",
    label: "Forward one frame",
    group: "Playback",
    hints: [["→"]],
    bindings: [
      b("frame-forward", "ArrowRight", {
        mod: false,
        shift: false,
        alt: false,
      }),
    ],
  },
  {
    action: "second-back",
    label: "Back one second",
    group: "Playback",
    hints: [["shift", "←"]],
    bindings: [b("second-back", "ArrowLeft", { mod: false, shift: true })],
  },
  {
    action: "second-forward",
    label: "Forward one second",
    group: "Playback",
    hints: [["shift", "→"]],
    bindings: [b("second-forward", "ArrowRight", { mod: false, shift: true })],
  },
  {
    action: "previous-cut",
    label: "Previous cut",
    group: "Playback",
    hints: [["↑"]],
    bindings: [b("previous-cut", "ArrowUp", { mod: false })],
  },
  {
    action: "next-cut",
    label: "Next cut",
    group: "Playback",
    hints: [["↓"]],
    bindings: [b("next-cut", "ArrowDown", { mod: false })],
  },
  {
    action: "go-start",
    label: "Go to the start",
    group: "Playback",
    hints: [["Home"]],
    bindings: [b("go-start", "Home", { mod: false })],
  },
  {
    action: "go-end",
    label: "Go to the end",
    group: "Playback",
    hints: [["End"]],
    bindings: [b("go-end", "End", { mod: false })],
  },
  {
    action: "slower",
    label: "Play slower",
    group: "Playback",
    hints: [["<"]],
    bindings: [b("slower", "<", { mod: false })],
  },
  {
    action: "faster",
    label: "Play faster",
    group: "Playback",
    hints: [[">"]],
    bindings: [b("faster", ">", { mod: false })],
  },

  // ── Editing ───────────────────────────────────────────────────────────
  {
    action: "split",
    label: "Split at the playhead",
    group: "Editing",
    hints: [["S"], ["mod", "K"]],
    bindings: [
      b("split", "s", { mod: false, alt: false }),
      b("split", "k", { mod: true }),
    ],
  },
  {
    action: "mark-in",
    label: "Mark in",
    group: "Editing",
    hints: [["I"]],
    bindings: [b("mark-in", "i", { mod: false, alt: false })],
  },
  {
    action: "mark-out",
    label: "Mark out",
    group: "Editing",
    hints: [["O"]],
    bindings: [b("mark-out", "o", { mod: false, alt: false })],
  },
  {
    action: "delete-range",
    label: "Cut out what is marked, and close the gap",
    group: "Editing",
    hints: [["X"]],
    bindings: [b("delete-range", "x", { mod: false, alt: false })],
  },
  {
    action: "clear-marks",
    label: "Clear the marks",
    group: "Editing",
    hints: [["alt", "X"]],
    // Option+X types a character on a Mac, so match the physical key too.
    bindings: [
      b("clear-marks", "x", { mod: false, alt: true }),
      b("clear-marks", "≈", { alt: true }),
    ],
  },
  {
    action: "trim-start",
    label: "Trim the clip's start to the playhead",
    group: "Editing",
    hints: [["Q"]],
    bindings: [b("trim-start", "q", { mod: false, alt: false })],
  },
  {
    action: "trim-end",
    label: "Trim the clip's end to the playhead",
    group: "Editing",
    hints: [["W"]],
    bindings: [b("trim-end", "w", { mod: false, alt: false })],
  },
  {
    action: "delete",
    label: "Delete the selection (the cut closes up)",
    group: "Editing",
    hints: [["⌫"]],
    bindings: [
      b("delete", "Backspace", { mod: false }),
      b("delete", "Delete", { mod: false }),
    ],
  },
  {
    action: "add-zoom",
    label: "Add a zoom at the playhead",
    group: "Editing",
    hints: [["Z"]],
    bindings: [b("add-zoom", "z", { mod: false, shift: false, alt: false })],
  },
  {
    action: "add-marker",
    label: "Add a marker (again to take it away)",
    group: "Editing",
    hints: [["M"]],
    bindings: [b("add-marker", "m", { mod: false, alt: false })],
  },
  {
    action: "copy",
    label: "Copy the selected clip",
    group: "Editing",
    hints: [["mod", "C"]],
    bindings: [b("copy", "c", { mod: true, shift: false })],
  },
  {
    action: "paste",
    label: "Paste at the playhead",
    group: "Editing",
    hints: [["mod", "V"]],
    bindings: [b("paste", "v", { mod: true, shift: false })],
  },
  {
    action: "duplicate",
    label: "Duplicate the selected clip",
    group: "Editing",
    hints: [["mod", "D"]],
    bindings: [b("duplicate", "d", { mod: true, shift: false })],
  },
  {
    action: "select-all",
    label: "Select every clip in the cut",
    group: "Editing",
    hints: [["mod", "A"]],
    bindings: [b("select-all", "a", { mod: true, shift: false })],
  },
  {
    action: "undo",
    label: "Undo",
    group: "Editing",
    hints: [["mod", "Z"]],
    bindings: [b("undo", "z", { mod: true, shift: false })],
  },
  {
    action: "redo",
    label: "Redo",
    group: "Editing",
    hints: [
      ["shift", "mod", "Z"],
      ["mod", "Y"],
    ],
    bindings: [
      b("redo", "z", { mod: true, shift: true }),
      b("redo", "y", { mod: true }),
    ],
  },
  {
    action: "deselect",
    label: "Clear the selection and the marks",
    group: "Editing",
    hints: [["esc"]],
    bindings: [b("deselect", "Escape")],
  },

  // ── View ──────────────────────────────────────────────────────────────
  {
    action: "timeline-in",
    label: "Zoom the timeline in",
    group: "View",
    hints: [["="]],
    bindings: [
      b("timeline-in", "=", { mod: false }),
      b("timeline-in", "+", { mod: false }),
    ],
  },
  {
    action: "timeline-out",
    label: "Zoom the timeline out",
    group: "View",
    hints: [["−"]],
    bindings: [
      b("timeline-out", "-", { mod: false }),
      b("timeline-out", "_", { mod: false }),
    ],
  },
  {
    action: "timeline-fit",
    label: "Fit the whole cut",
    group: "View",
    hints: [["shift", "Z"]],
    bindings: [b("timeline-fit", "z", { mod: false, shift: true })],
  },
  {
    action: "shortcuts",
    label: "Show these shortcuts",
    group: "View",
    hints: [["?"]],
    bindings: [b("shortcuts", "?", { mod: false })],
  },
]

export type KeyEventLike = {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

function matches(binding: KeyBinding, event: KeyEventLike): boolean {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  const want =
    binding.key.length === 1 ? binding.key.toLowerCase() : binding.key
  if (key !== want) return false

  const mod = event.metaKey || event.ctrlKey
  if (binding.mod !== undefined && binding.mod !== mod) return false
  if (binding.shift !== undefined && binding.shift !== event.shiftKey)
    return false
  if (binding.alt !== undefined && binding.alt !== event.altKey) return false
  return true
}

/** What a key press means to the editor, or null when it means nothing. */
export function keyActionFor(event: KeyEventLike): KeyAction | null {
  for (const entry of KEYMAP) {
    for (const binding of entry.bindings) {
      if (matches(binding, event)) return entry.action
    }
  }
  return null
}

/** The first hint for an action, for a tooltip. */
export function hintFor(action: KeyAction): readonly string[] | undefined {
  return KEYMAP.find((entry) => entry.action === action)?.hints[0]
}

export const KEY_GROUPS: readonly KeyGroup[] = ["Playback", "Editing", "View"]
