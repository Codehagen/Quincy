import { Caveat, Inter } from "next/font/google"

/**
 * The lab's two faces, loaded once. Turbopack fails the build when the same
 * Google font is loaded from several modules with different options, so every
 * group re-exports from here instead of calling the loader itself.
 */
export const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--lab-inter",
})

/** Margin notes only. A pen, not a typeface. */
export const caveat = Caveat({
  subsets: ["latin"],
  display: "swap",
  variable: "--lab-caveat",
})
