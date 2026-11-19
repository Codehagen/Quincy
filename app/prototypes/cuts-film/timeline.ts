// Times the film's modules share, in a module with no imports so any of them can read these at load time.

/** No music bed (no licensed track): holds are free within the skill's ranges. Kept for the scripts. */
export const BAR = 1967

/** Each beat's length in ms, in order. Scenes overlap by OVERLAP while one hands over to the next. */
export const DUR = { drop: 2400, ask: 3200, cut: 5300, check: 3300, three: 5600, pick: 5200, end: 3400 } as const
export const OVERLAP = 150

export const ORDER = ["drop", "ask", "cut", "check", "three", "pick", "end"] as const
export type BeatId = (typeof ORDER)[number]

/** Each beat's start on the film's clock. */
export const AT = ORDER.reduce(
  (acc, id, i) => ({ ...acc, [id]: i === 0 ? 0 : acc[ORDER[i - 1]!] + DUR[ORDER[i - 1]!] - OVERLAP }),
  {} as Record<BeatId, number>
)
export const FILM_END = AT.end + DUR.end

/** The request the person types, and when (ms on the film's clock). */
export const ASK_TEXT = "Tighten this and add captions"
export const TYPE_AT = AT.ask + 650
/** 40–90 ms a letter, a little longer after a space: the same every run. */
export const TYPE_TIMES = (() => {
  let clock = TYPE_AT
  return [...ASK_TEXT].map((ch, i) => (clock += 40 + ((i * 37 + 11) % 7) * 7 + (ASK_TEXT[i - 1] === " " ? 35 : 0) + (ch === " " ? 10 : 0)))
})()
export const SEND_AT = TYPE_TIMES.at(-1)! + 260
/** The run starts as the message lands. */
export const RUN_AT = SEND_AT + 450

/** The take opens on the lane. */
export const DROP_AT = 300
/** The captions land on the lane and burn into the preview. */
export const CAPTIONS_AT = AT.check + 350
