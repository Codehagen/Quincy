import { describe, expect, it } from "vitest"
import { editorOwnsKey, type KeyTarget } from "./editor-keys"

/** A node with the attributes and roles `closest` can match, and a parent. */
function node(
  tagName: string,
  matches: string[] = [],
  parent: KeyTarget | null = null,
  isContentEditable = false
): KeyTarget {
  const self: KeyTarget = {
    tagName,
    isContentEditable,
    closest(selector) {
      const wanted = selector.split(",").map((s) => s.trim())
      if (wanted.some((s) => matches.includes(s))) return self
      return parent ? parent.closest(selector) : null
    },
  }
  return self
}

const press = (key: string, mod = false) => ({
  key,
  metaKey: mod,
  ctrlKey: false,
})

describe("editorOwnsKey", () => {
  const body = node("BODY")
  const margin = node("DIV", ["[data-chat-keys]"], body)
  const thread = node("DIV", [], margin)
  const composer = node("TEXTAREA", [], margin)
  const toolbarButton = node("BUTTON", ["button"], body)
  const lanes = node("DIV", ["[data-editor-keys]"], body)
  const clip = node("BUTTON", ["button"], lanes)

  it("plays and splits from the page", () => {
    expect(editorOwnsKey(body, press(" "))).toBe(true)
    expect(editorOwnsKey(body, press("s"))).toBe(true)
  })

  it("leaves Space and S to the chat thread when it has focus", () => {
    expect(editorOwnsKey(thread, press(" "))).toBe(false)
    expect(editorOwnsKey(thread, press("s"))).toBe(false)
    expect(editorOwnsKey(thread, press("Backspace"))).toBe(false)
  })

  it("keeps Escape and undo global, even from the thread", () => {
    expect(editorOwnsKey(thread, press("Escape"))).toBe(true)
    expect(editorOwnsKey(thread, press("z", true))).toBe(true)
    expect(editorOwnsKey(thread, press("Z", true))).toBe(true)
  })

  it("leaves every key to a text field", () => {
    expect(editorOwnsKey(composer, press("s"))).toBe(false)
    expect(editorOwnsKey(composer, press("z", true))).toBe(false)
    expect(editorOwnsKey(node("DIV", [], body, true), press(" "))).toBe(false)
  })

  it("leaves Space to a focused toolbar button, but not to a clip", () => {
    expect(editorOwnsKey(toolbarButton, press(" "))).toBe(false)
    expect(editorOwnsKey(toolbarButton, press("Escape"))).toBe(true)
    expect(editorOwnsKey(clip, press("Backspace"))).toBe(true)
  })

  it("lets a letter through a focused toolbar button, but not its own keys", () => {
    expect(editorOwnsKey(toolbarButton, press("j"))).toBe(true)
    expect(editorOwnsKey(toolbarButton, press("Enter"))).toBe(false)
    expect(editorOwnsKey(toolbarButton, press("ArrowLeft"))).toBe(false)
  })

  it("leaves every key to an open menu", () => {
    const menu = node("DIV", ["[role=menu]"], body)
    const item = node("DIV", ["[role=menuitem]"], menu)
    expect(editorOwnsKey(item, press("s"))).toBe(false)
  })
})
