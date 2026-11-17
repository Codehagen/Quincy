import { Perched } from "@/components/kit"

import { Crop, Sheet } from "./crop"

/* It brings you ideas: three from one merge, the one with a number picked. */

const IDEAS = [
  { title: "The six questions we stopped asking", from: "#212 · Story · Thread" },
  { title: "41% → 68% in a week", from: "#212 · Number · Short post" },
  { title: "Onboarding is a list of things you’re afraid to skip", from: "#212 · Opinion · Short post" },
] as const

export function IdeasPicture() {
  return (
    <Crop label="Three ideas from pull request 212. The second, which has a number, is picked, with Draft this idea beside it.">
      <div className="mx-auto max-w-[41rem]">
        <Perched state="found" at="62%">
          <Sheet>
            <p className="text-kit-small text-kit-ink-muted">3 ideas from #212</p>
            <ul className="mt-kit-related flex flex-col gap-1">
              {IDEAS.map((idea, i) => (
                <li
                  key={idea.title}
                  data-on={i === 1 || undefined}
                  className="flex items-center justify-between gap-kit-related rounded-kit-control px-3 py-2.5 data-on:bg-kit-well sm:px-4"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className={i === 1 ? "font-kit-strong" : "text-kit-ink-muted"}>{idea.title}</span>
                    <span className="text-kit-small text-kit-ink-muted">{idea.from}</span>
                  </span>
                  {i === 1 ? (
                    <span className="hidden h-8 flex-none items-center rounded-kit-control-inner bg-kit-control px-3 text-kit-small font-kit-strong shadow-kit-control sm:inline-flex">
                      Draft this idea
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </Sheet>
        </Perched>
      </div>
    </Crop>
  )
}
