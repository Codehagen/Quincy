"use client"

import * as React from "react"

import { Text } from "@/components/kit"

type Entry = { id: string; title: string; group: string }

/**
 * The quiet table of contents: grey links, the current one in ink. "Current"
 * is the last section whose top has passed a line 30% down the viewport,
 * which is where the eye reads, not the top edge.
 */
export function Toc({ entries }: { entries: readonly Entry[] }) {
  const [current, setCurrent] = React.useState(entries[0]?.id ?? "")

  React.useEffect(() => {
    const els = entries
      .map((e) => document.getElementById(e.id))
      .filter((el): el is HTMLElement => el !== null)
    const update = () => {
      const line = window.innerHeight * 0.3
      let next = els[0]?.id ?? ""
      for (const el of els) {
        if (el.getBoundingClientRect().top <= line) next = el.id
      }
      setCurrent(next)
    }
    update()
    window.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [entries])

  const groups: { name: string; items: Entry[] }[] = []
  for (const e of entries) {
    const g = groups.find((x) => x.name === e.group)
    if (g) g.items.push(e)
    else groups.push({ name: e.group, items: [e] })
  }

  return (
    <nav aria-label="On this page" className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g.name} className="flex flex-col gap-1.5">
          <Text variant="small" weight="strong" as="span">
            {g.name}
          </Text>
          <ul className="flex flex-col gap-1">
            {g.items.map((e) => (
              <li key={e.id}>
                <a
                  href={`#${e.id}`}
                  aria-current={current === e.id ? "location" : undefined}
                  className="text-kit-small text-kit-ink-muted outline-hidden transition-[color] duration-(--kit-duration-state) ease-kit-out hover:text-kit-ink focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-focus aria-[current=location]:text-kit-ink motion-reduce:transition-none"
                >
                  {e.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}
