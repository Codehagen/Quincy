import { Literata } from "next/font/google"

/**
 * Piece 15 only: a reading serif for an essay column. Literata was drawn for
 * long reading on screens, which is the register an argument someone signed
 * needs, and nothing a pitch would reach for. Loaded once, here, so no other
 * module calls the loader with different options.
 */
export const literata = Literata({
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--lab-c-literata",
})
