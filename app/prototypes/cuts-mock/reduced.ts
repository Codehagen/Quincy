/*
 * "Reduce motion" for the mock, without the OS setting.
 *
 * The director decides reduced motion from `useReducedMotion` (kit), which
 * reads `matchMedia("(prefers-reduced-motion: reduce)")`. This answers that
 * one query with a forced value and tells its listeners when it flips, so
 * the real hook and the real director take their reduced path. The CSS half
 * (agent-cursor.css's media block) is mirrored in mock.css under
 * `[data-reduced]`. Installed once, on this page only.
 */

const REDUCED = "(prefers-reduced-motion: reduce)"

let forced = false
let installed = false
const listeners = new Set<() => void>()

function install() {
  if (installed || typeof window === "undefined") return
  installed = true
  const real = window.matchMedia.bind(window)
  window.matchMedia = (query: string) => {
    const list = real(query)
    if (query !== REDUCED) return list
    return {
      get matches() {
        return forced || list.matches
      },
      media: query,
      onchange: null,
      addEventListener: (_: string, fn: () => void) => {
        listeners.add(fn)
        list.addEventListener("change", fn)
      },
      removeEventListener: (_: string, fn: () => void) => {
        listeners.delete(fn)
        list.removeEventListener("change", fn)
      },
      addListener: (fn: () => void) => listeners.add(fn),
      removeListener: (fn: () => void) => listeners.delete(fn),
      dispatchEvent: () => true,
    } as unknown as MediaQueryList
  }
}

export function forceReducedMotion(on: boolean) {
  install()
  if (forced === on) return
  forced = on
  for (const fn of listeners) fn()
}

install()
