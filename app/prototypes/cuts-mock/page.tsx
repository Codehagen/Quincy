import { CutsMock } from "./mock"

/**
 * /prototypes/cuts-mock — the Cuts editor on a fixture take, for tuning its
 * motion (plans/036, phase F). No session, no database, no model: the
 * network is answered in the page. The editor mounts on the client only
 * (mock.tsx), so the fixture's random ids never cross hydration.
 */
export const metadata = {
  title: "Cuts mock",
  robots: { index: false, follow: false },
}

export default function CutsMockPage() {
  return <CutsMock />
}
