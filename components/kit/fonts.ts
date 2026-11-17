import { Caveat, Inter } from "next/font/google"

/**
 * The kit's two faces. Loaded here, not in `app/layout.tsx`, so they reach
 * only the routes that render the kit: next/font preloads a face on every
 * route whose module graph imports it, and a Geist page should not pay for
 * Inter and Caveat it never paints.
 *
 * `<KitRoot>` puts both `variable` classes on its own element. The
 * `font-kit-sans` / `font-kit-hand` utilities (globals.css, `@theme inline`)
 * read `--kit-font-inter` / `--kit-font-caveat` there. Outside a KitRoot they
 * fall back to the system stack instead of breaking.
 *
 * Both are variable fonts with no `weight` given, so 460 and 560 are real
 * instances, not rounded to 400 and 600.
 */
export const kitSans = Inter({
  subsets: ["latin"],
  // The real italic: globals.css sets font-synthesis: none, so without it
  // every <em> renders upright.
  style: ["normal", "italic"],
  display: "swap",
  variable: "--kit-font-inter",
})

/** Margin notes only. */
export const kitHand = Caveat({
  subsets: ["latin"],
  display: "swap",
  variable: "--kit-font-caveat",
})
