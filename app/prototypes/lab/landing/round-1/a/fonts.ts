import { Instrument_Serif, Newsreader } from "next/font/google"

/**
 * Group a's two extra faces. The person's own words get a book serif, so
 * what they said and what Quincy wrote never look like the same hand.
 * Instrument Serif is the one display face (piece 04 only).
 */
export const aNewsreader = Newsreader({
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--lab-a-newsreader",
})

export const aInstrument = Instrument_Serif({
  subsets: ["latin"],
  display: "swap",
  weight: "400",
  style: ["normal", "italic"],
  variable: "--lab-a-instrument",
})
