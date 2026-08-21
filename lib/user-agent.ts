/**
 * "Chrome on macOS", from a user-agent string.
 *
 * Deliberately shallow. A full parser is a dependency that ships a database of
 * strings and needs updating, and the only question this answers is "which of
 * these rows is the laptop I left at the office" — for which browser and
 * operating system are enough, and a wrong guess costs nothing.
 *
 * Order matters in both lists: every Chromium browser claims to be Safari and
 * most claim to be Chrome, so the specific names have to be tested before the
 * generic ones. Edge before Chrome, Chrome before Safari.
 */

const BROWSERS: [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\bOPR\/|\bOpera\//, "Opera"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/\bCriOS\//, "Chrome"],
  [/\bChrome\//, "Chrome"],
  [/\bSafari\//, "Safari"],
]

const SYSTEMS: [RegExp, string][] = [
  // iPadOS reports "Macintosh" on desktop-mode Safari, so iPad has to be
  // tested by its own token first or every iPad reads as a Mac.
  [/\biPad\b/, "iPad"],
  [/\biPhone\b/, "iPhone"],
  [/\bAndroid\b/, "Android"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bWindows\b/, "Windows"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bLinux\b/, "Linux"],
]

export function describeUserAgent(agent: string | null | undefined): string {
  if (!agent) {
    // A session with no user agent is real — a script signing in, or an older
    // row. "Unknown browser" is true; inventing a name would not be.
    return "Unknown browser"
  }

  const browser = BROWSERS.find(([pattern]) => pattern.test(agent))?.[1]
  const system = SYSTEMS.find(([pattern]) => pattern.test(agent))?.[1]

  if (browser && system) return `${browser} on ${system}`
  if (browser) return browser
  if (system) return system

  return "Unknown browser"
}
