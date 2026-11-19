import { describe, expect, it } from "vitest"

import { KEYMAP, keyActionFor, type KeyEventLike } from "./keymap"

const press = (
  key: string,
  extra: Partial<KeyEventLike> = {}
): KeyEventLike => ({
  key,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...extra,
})

describe("keyActionFor", () => {
  it("reads the editing conventions people bring with them", () => {
    expect(keyActionFor(press(" "))).toBe("toggle-play")
    expect(keyActionFor(press("j"))).toBe("back-second")
    expect(keyActionFor(press("k"))).toBe("pause")
    expect(keyActionFor(press("l"))).toBe("play-forward")
    expect(keyActionFor(press("i"))).toBe("mark-in")
    expect(keyActionFor(press("o"))).toBe("mark-out")
    expect(keyActionFor(press("x"))).toBe("delete-range")
    expect(keyActionFor(press("q"))).toBe("trim-start")
    expect(keyActionFor(press("w"))).toBe("trim-end")
    expect(keyActionFor(press("ArrowLeft"))).toBe("frame-back")
    expect(keyActionFor(press("ArrowRight", { shiftKey: true }))).toBe(
      "second-forward"
    )
    expect(keyActionFor(press("ArrowDown"))).toBe("next-cut")
  })

  it("tells a letter from the same letter with a modifier", () => {
    expect(keyActionFor(press("k", { metaKey: true }))).toBe("split")
    expect(keyActionFor(press("k", { ctrlKey: true }))).toBe("split")
    expect(keyActionFor(press("z"))).toBe("add-zoom")
    expect(keyActionFor(press("Z", { shiftKey: true }))).toBe("timeline-fit")
    expect(keyActionFor(press("z", { metaKey: true }))).toBe("undo")
    expect(keyActionFor(press("z", { metaKey: true, shiftKey: true }))).toBe(
      "redo"
    )
    expect(keyActionFor(press("y", { ctrlKey: true }))).toBe("redo")
    expect(keyActionFor(press("x", { altKey: true }))).toBe("clear-marks")
  })

  it("matches capitals, as Caps Lock sends them", () => {
    expect(keyActionFor(press("S"))).toBe("split")
  })

  it("leaves the browser's own shortcuts alone", () => {
    expect(keyActionFor(press("s", { metaKey: true }))).toBeNull()
    expect(keyActionFor(press("l", { metaKey: true }))).toBeNull()
    expect(keyActionFor(press("r", { metaKey: true }))).toBeNull()
  })
})

describe("KEYMAP", () => {
  it("lists each action once, with a hint and a binding", () => {
    const actions = KEYMAP.map((entry) => entry.action)
    expect(new Set(actions).size).toBe(actions.length)
    for (const entry of KEYMAP) {
      expect(entry.hints.length).toBeGreaterThan(0)
      expect(entry.bindings.length).toBeGreaterThan(0)
      expect(
        entry.bindings.every((binding) => binding.action === entry.action)
      ).toBe(true)
    }
  })

  it("gives no press two meanings", () => {
    // Every binding, pressed exactly as declared, must come back as its own
    // action: an earlier entry catching it would make the later one dead.
    for (const entry of KEYMAP) {
      for (const binding of entry.bindings) {
        const event = press(binding.key, {
          metaKey: binding.mod === true,
          shiftKey: binding.shift === true,
          altKey: binding.alt === true,
        })
        expect(keyActionFor(event), `${binding.key} for ${entry.action}`).toBe(
          entry.action
        )
      }
    }
  })
})
