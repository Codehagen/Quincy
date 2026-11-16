import { KitRoot, Text } from "@/components/kit"

import { SectionBlock } from "./doc"
import { SECTIONS } from "./sections"
import { Toc } from "./toc"

/**
 * The component lab: every kit component live, after benji.org/stageshow.
 * The rules live in docs/design/; this page shows them. Built from the kit
 * itself, so a drift in the kit shows up here first.
 */
export const metadata = {
  title: "Kit",
  robots: { index: false, follow: false },
}

const ENTRIES = SECTIONS.map(({ id, title, group }) => ({ id, title, group }))

export default function KitPage() {
  return (
    <KitRoot>
      <aside className="fixed top-24 left-8 hidden w-40 lg:block">
          <Toc entries={ENTRIES} />
        </aside>
        <main className="mx-auto flex max-w-kit-doc flex-col gap-16 px-4 pt-24 pb-32">
          <header className="flex flex-col gap-2">
            <Text as="h1" weight="strong">
              Quincy kit
            </Text>
            <Text tone="muted">
              The components of plan 029, live. Each one on its stage, with the
              mistake it is most often used for beside the fix.
            </Text>
          </header>
          {SECTIONS.map((s) => (
            <SectionBlock key={s.id} section={s} />
          ))}
        </main>
    </KitRoot>
  )
}
