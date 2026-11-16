import { RIFFS } from "./data"
import { RiffsScreen } from "./riffs-screen"

/**
 * Riffs, rebuilt from the kit only (docs/design, components/kit). Fixture
 * data, no database, no server actions: see data.ts and actions.ts.
 *
 * `?empty` opens it with nothing waiting, to see the empty state without
 * dismissing every riff first.
 */
export const metadata = {
  title: "Riffs (kit test)",
  robots: { index: false, follow: false },
}

export default async function KitTestRiffsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { empty } = await searchParams
  return <RiffsScreen initial={empty !== undefined ? [] : RIFFS} />
}
