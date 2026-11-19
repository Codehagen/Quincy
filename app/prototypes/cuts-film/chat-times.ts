// When each thing lands in the chat margin, on the film's clock (ms).
import { RUN_DONE } from "./main-run"
import { typeTimes } from "./motion"
import { RUN3_DONE } from "./three-run"
import { AT, RUN_AT, SEND_AT } from "./timeline"

export const READ_AT = AT.drop + 700
export const READ_DONE = AT.drop + 1700
export const BUBBLE_AT = SEND_AT + 40
export const FOLD_AT = RUN_DONE + 260
export const CAPTIONED_AT = AT.check + 200
export const LOOK_AT = AT.check + 1000
export const FRAME_AT = (i: number) => LOOK_AT + 200 + i * 160
export const LOOKED_AT = AT.check + 2400
export const ASK3_AT = AT.three + 300
export const CUTS_DONE_AT = RUN3_DONE + 150
export const SAY_AT = AT.pick + 600
export const SAY = "Post A first. It opens on you mid-sentence, not on a pause, and the captions carry it with the sound off."
export const SAY_TIMES = typeTimes(SAY, SAY_AT, 2)
/** After the camera is back on the spines (camera.tsx). */
export const BACK_TO_SPINES = SAY_TIMES.at(-1)! + 250
export const RECOMMEND_AT = BACK_TO_SPINES + 800
export { RUN_AT }
