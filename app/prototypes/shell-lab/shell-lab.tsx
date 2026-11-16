"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"

import { KitRoot, Mono, Segmented, Tab, TabList, TabPanel, Tabs, Text } from "@/components/kit"
/* eslint-disable no-restricted-imports -- A lab that judges the app against
   the landing's pictures has to draw them, and the brief asks for the
   showcase frames by import. Same exemption as app/prototypes/lab/landing;
   add this folder to eslint.config.mjs's showcase ignores if it stays. */
import { HeldPicture } from "@/components/showcase/demos/held-picture"
import { HeroPicture } from "@/components/showcase/demos/hero-picture"
import { TextsPicture } from "@/components/showcase/demos/texts-picture"
/* eslint-enable no-restricted-imports */

import { DIRECTIONS, type Direction, type Reference } from "./directions"
import { DesktopFrame, PhoneFrame } from "./frames"

/**
 * The question (owner, 2026-11-16): the landing is now the visual
 * reference, so what shell makes the app look like the app in its
 * pictures? Four directions, each beside the picture it has to match.
 *
 * The frames are live: rows switch pages, menus open, the phone's sheets
 * slide. One route per direction is shared by its desktop and its phone, so
 * a page chosen on one shows on the other: the same agent state, two
 * windows onto it.
 */

const REFERENCES: Record<Reference, { name: string; file: string; Picture: () => React.ReactNode }> = {
  hero: { name: "The landing’s hero", file: "hero-picture.tsx", Picture: HeroPicture },
  held: { name: "The held draft", file: "held-picture.tsx", Picture: HeldPicture },
  texts: { name: "The thread", file: "texts-picture.tsx", Picture: TextsPicture },
}

type Layout = "beside" | "alone"

function Label({ children, file }: { children: React.ReactNode; file?: string }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2.5">
      <span className="font-kit-strong">{children}</span>
      {file ? <Mono>{file}</Mono> : null}
    </span>
  )
}

function Reference({ which }: { which: Reference }) {
  const ref = REFERENCES[which]
  return (
    <figure className="flex min-w-0 flex-col gap-3">
      <figcaption>
        <Label file={`showcase/demos/${ref.file}`}>Reference · {ref.name}</Label>
      </figcaption>
      <ref.Picture />
    </figure>
  )
}

function DirectionView({
  d,
  layout,
  route,
  go,
}: {
  d: Direction
  layout: Layout
  route: string
  go: (href: string) => void
}) {
  const beside = layout === "beside"
  return (
    <div className="flex flex-col gap-12 pt-4">
      <dl className="grid gap-x-8 gap-y-5 md:grid-cols-3">
        <div className="flex flex-col gap-1">
          <dt className="font-kit-strong">Bets on</dt>
          <dd className="text-kit-ink-muted">{d.bet}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="font-kit-strong">Gives up</dt>
          <dd className="text-kit-ink-muted">{d.givesUp}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="font-kit-strong">Look at</dt>
          <dd className="text-kit-ink-muted">{d.reference.look}</dd>
        </div>
      </dl>

      <section aria-label="Desktop" className={`grid items-start gap-x-8 gap-y-6 ${beside ? "xl:grid-cols-2" : ""}`}>
        <figure className="flex min-w-0 flex-col gap-3">
          <figcaption>
            <Label file="1280 × 800">Desktop</Label>
          </figcaption>
          <DesktopFrame url={`hirequincy.com${route}`}>
            <d.Desktop route={route} go={go} />
          </DesktopFrame>
        </figure>
        {beside ? <Reference which={d.reference.desktop} /> : null}
      </section>

      <section aria-label="Phone" className={`grid items-start gap-x-12 gap-y-6 ${beside ? "md:grid-cols-[auto_1fr]" : ""}`}>
        <figure className="flex flex-col items-start gap-3">
          <figcaption>
            <Label file="402 pt">Phone</Label>
          </figcaption>
          <PhoneFrame>
            <d.Phone route={route} go={go} />
          </PhoneFrame>
        </figure>
        {beside ? <Reference which={d.reference.phone} /> : null}
      </section>

      <section aria-labelledby={`${d.id}-changes`} className="flex max-w-[50rem] flex-col gap-3">
        <h2 id={`${d.id}-changes`} className="font-kit-strong">
          What it changes in components/quincy/shell/
        </h2>
        <ul className="flex flex-col gap-2.5">
          {d.changes.map(([file, change]) => (
            <li key={file} className="grid gap-x-6 gap-y-0.5 sm:grid-cols-[13rem_1fr]">
              <Mono tone="ink">{file}</Mono>
              <span className="text-kit-ink-muted">{change}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export function ShellLab() {
  const params = useSearchParams()
  const asked = params.get("d")
  const [id, setId] = React.useState(
    DIRECTIONS.some((d) => d.id === asked) ? asked! : DIRECTIONS[0].id,
  )
  const [layout, setLayout] = React.useState<Layout>("beside")
  // Kept here, not in the panel: a closed tab unmounts, and coming back to a
  // direction should find the page you left it on.
  const [routes, setRoutes] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(DIRECTIONS.map((d) => [d.id, d.home])),
  )

  const select = React.useCallback((next: string) => {
    setId(next)
    const url = new URL(location.href)
    url.searchParams.set("d", next)
    history.replaceState(null, "", url)
  }, [])

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const n = parseInt(e.key, 10)
      if (n >= 1 && n <= DIRECTIONS.length) select(DIRECTIONS[n - 1].id)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [select])

  return (
    <KitRoot>
      <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-8 px-4 pt-8 pb-24 sm:px-8">
        <header className="flex max-w-[45rem] flex-col gap-1">
          <Text as="h1" weight="strong">
            Shell lab
          </Text>
          <Text tone="muted">
            Four shells for the app, each beside the landing picture it has to match. The frames
            are live: rows switch pages, menus open, the phone’s sheets slide, and a page picked
            on the desktop shows on the phone. Press 1–4 to switch.
          </Text>
        </header>

        <Tabs value={id} onValueChange={select}>
          <div className="flex w-full flex-wrap items-center justify-between gap-4">
            <div className="max-w-full overflow-x-auto">
              <TabList aria-label="Direction">
                {DIRECTIONS.map((d, i) => (
                  <Tab key={d.id} value={d.id}>
                    {`${i + 1} ${d.name}`}
                  </Tab>
                ))}
              </TabList>
            </div>
            <div className="hidden xl:block">
              <Segmented
                aria-label="Layout"
                value={layout}
                onValueChange={setLayout}
                options={[
                  { value: "beside", label: "Beside the picture" },
                  { value: "alone", label: "Direction alone" },
                ]}
              />
            </div>
          </div>
          {DIRECTIONS.map((d) => (
            <TabPanel key={d.id} value={d.id}>
              <DirectionView
                d={d}
                layout={layout}
                route={routes[d.id]}
                go={(href) => setRoutes((r) => ({ ...r, [d.id]: href }))}
              />
            </TabPanel>
          ))}
        </Tabs>
      </div>
    </KitRoot>
  )
}
