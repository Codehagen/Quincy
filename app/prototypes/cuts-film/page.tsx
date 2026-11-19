// /prototypes/cuts-film — the Cuts launch film as a page. The preview has a player (scrub, play, frame step);
// `?render=1` drops the controls and exposes window.__film for the render scripts; `?t=4200` opens at 4.2 s.
import "./film.css"
import { Player } from "./player"

export const metadata = { title: "Cuts film", robots: { index: false, follow: false } }

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const t = Number(params.t ?? 0) || 0
  const render = params.render === "1"
  return <Player start={t} render={render} />
}
