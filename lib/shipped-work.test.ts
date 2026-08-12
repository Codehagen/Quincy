import { describe, expect, it } from "vitest"

import {
  assembleDescription,
  descriptionBlocks,
  MAX_DESCRIPTION_CHARS,
  flattenBlocks,
  flattenMarkdown,
  parseShippedPayload,
  shippedGate,
} from "./shipped-work"

/**
 * The pure half of plans/021 — everything that decides what happens before a
 * model or a database is involved.
 *
 * scripts/verify-shipped-work.ts proves the endpoint. This proves the
 * decisions, and the two do not overlap: a route test that posts a
 * correctly-shaped merge exercises exactly one path through `shippedGate` and
 * tells you nothing about the six it declined to take.
 *
 * The fixture is PR #23 of this repository, with its real numbers. A fabricated
 * payload would agree with whatever the parser happens to do; a real one
 * disagrees when GitHub's shape is not what the parser assumed.
 */

function payload(overrides: Record<string, unknown> = {}) {
  // Destructured out, because a top-level spread would replace the whole
  // `pull_request` object with the partial rather than merging into it — which
  // is a fixture bug that makes every override look like a malformed payload.
  const { pull_request: pullOverrides, ...rest } = overrides

  return {
    action: "closed",
    installation: { id: 12345678 },
    ...rest,
    pull_request: {
      node_id: "PR_kwDOPvHwEs6h2xYz",
      number: 23,
      title: "Say it out loud and come back to angles",
      body: "Voice notes become riffs.\n\nThe first background job that is not a cron.\n\n## Verification\n\nLint and typecheck clean.",
      html_url: "https://github.com/Codehagen/Quincy/pull/23",
      merged: true,
      draft: false,
      merged_at: "2026-08-08T13:32:43Z",
      additions: 6343,
      deletions: 103,
      changed_files: 29,
      commits: 7,
      labels: [{ name: "feature" }],
      user: { login: "Codehagen" },
      base: {
        ref: "main",
        repo: {
          full_name: "Codehagen/Quincy",
          default_branch: "main",
          private: true,
        },
      },
      ...((pullOverrides as object) ?? {}),
    },
  }
}

describe("parseShippedPayload", () => {
  it("reads a real merged pull request", () => {
    const parsed = parseShippedPayload(payload())

    expect(parsed).not.toBeNull()
    expect(parsed?.nodeId).toBe("PR_kwDOPvHwEs6h2xYz")
    expect(parsed?.installationId).toBe(12345678)
    expect(parsed?.merged).toBe(true)
    expect(parsed?.repository).toBe("Codehagen/Quincy")
    expect(parsed?.additions).toBe(6343)
    expect(parsed?.mergedAt?.toISOString()).toBe("2026-08-08T13:32:43.000Z")
  })

  /**
   * Lower-cased on the way in, because GitHub logins are case-insensitive and
   * `shippedGate` compares exactly. Storing "Codehagen" and receiving
   * "codehagen" would drop every merge, and the failure looks identical to the
   * app not being installed — which is the worst kind of bug to debug.
   */
  it("lower-cases the author login", () => {
    expect(parseShippedPayload(payload())?.authorLogin).toBe("codehagen")
  })

  it("refuses a body with no pull request on it", () => {
    expect(parseShippedPayload({ action: "closed" })).toBeNull()
    expect(parseShippedPayload(null)).toBeNull()
    expect(parseShippedPayload("a string")).toBeNull()
  })

  /**
   * Both are structural. Without a node id there is no dedup key and a
   * redelivery would make a second riff; without an installation id there is
   * nobody to attribute the merge to.
   */
  it("refuses a payload with no node id or no installation", () => {
    expect(
      parseShippedPayload(payload({ pull_request: { node_id: "" } }))
    ).toBeNull()
    expect(parseShippedPayload({ ...payload(), installation: {} })).toBeNull()
  })

  it("survives a payload with every optional field missing", () => {
    const parsed = parseShippedPayload({
      installation: { id: 1 },
      pull_request: { node_id: "PR_1" },
    })

    expect(parsed?.title).toBe("")
    expect(parsed?.additions).toBe(0)
    expect(parsed?.mergedAt).toBeNull()
    expect(parsed?.labels).toEqual([])
  })

  it("does not accept an unparseable merged_at as a date", () => {
    const parsed = parseShippedPayload(
      payload({ pull_request: { merged_at: "not a date" } })
    )

    expect(parsed?.mergedAt).toBeNull()
  })
})

describe("shippedGate", () => {
  it("accepts a merge by the connected user into the default branch", () => {
    const parsed = parseShippedPayload(payload())!
    expect(shippedGate(parsed, "codehagen")).toEqual({ ok: true })
  })

  it("refuses a pull request that was closed without merging", () => {
    const parsed = parseShippedPayload(
      payload({ pull_request: { merged: false } })
    )!

    expect(shippedGate(parsed, "codehagen")).toMatchObject({
      ok: false,
      reason: "not-merged",
    })
  })

  it("refuses any action other than closed", () => {
    const parsed = parseShippedPayload({
      ...payload(),
      action: "opened",
    })!

    expect(shippedGate(parsed, "codehagen")).toMatchObject({
      reason: "not-merged",
    })
  })

  /**
   * A stacked pull request landing in its parent feature branch is real work
   * and is not a thing that shipped.
   */
  it("refuses a merge into a branch that is not the default", () => {
    const parsed = parseShippedPayload(
      payload({
        pull_request: {
          base: {
            ref: "feat/parent",
            repo: {
              full_name: "Codehagen/Quincy",
              default_branch: "main",
              private: true,
            },
          },
        },
      })
    )!

    expect(shippedGate(parsed, "codehagen")).toMatchObject({
      reason: "not-default-branch",
    })
  })

  /**
   * Tolerant when GitHub sends no `default_branch`. Refusing on a missing field
   * would drop real merges to guard against a case that has never occurred.
   */
  it("allows a merge when GitHub reports no default branch", () => {
    const parsed = parseShippedPayload(
      payload({
        pull_request: {
          base: { ref: "main", repo: { full_name: "x/y" } },
        },
      })
    )!

    expect(shippedGate(parsed, "codehagen")).toEqual({ ok: true })
  })

  /**
   * The whole privacy rule of this integration, and the analogue of plan 019's
   * speaker match. Drafting a post in your voice about a colleague's work,
   * under your name, is the failure this one comparison prevents.
   */
  it("refuses a merge by somebody else", () => {
    const parsed = parseShippedPayload(
      payload({ pull_request: { user: { login: "a-colleague" } } })
    )!

    expect(shippedGate(parsed, "codehagen")).toMatchObject({
      reason: "not-author",
    })
  })

  /**
   * An organisation installation before the user has said which account is
   * theirs. Refusing everything is the only safe reading — the alternative is
   * guessing, and a wrong guess writes a post about someone else's work.
   */
  it("refuses everything when no login has been set", () => {
    const parsed = parseShippedPayload(payload())!

    expect(shippedGate(parsed, "")).toMatchObject({ reason: "no-login" })
  })

  it("refuses a draft", () => {
    const parsed = parseShippedPayload(
      payload({ pull_request: { draft: true } })
    )!

    expect(shippedGate(parsed, "codehagen")).toMatchObject({ reason: "draft" })
  })
})

describe("descriptionBlocks", () => {
  it("puts the title first and splits the body on blank lines", () => {
    const blocks = descriptionBlocks({
      title: "Say it out loud",
      body: "One.\n\nTwo.\n\n\nThree.",
    })

    expect(blocks).toEqual(["Say it out loud", "One.", "Two.", "Three."])
  })

  /**
   * A repository with a pull-request template puts its instructions in an HTML
   * comment. A model handed them selects the template's prose about how to
   * write a description, which is the most confidently wrong output this
   * pipeline can produce.
   */
  it("drops HTML comments before splitting", () => {
    const blocks = descriptionBlocks({
      title: "T",
      body: "<!-- Describe your change\n\nand link an issue -->\n\nThe real paragraph.",
    })

    expect(blocks).toEqual(["T", "The real paragraph."])
  })

  it("handles an empty body and an empty title", () => {
    expect(descriptionBlocks({ title: "T", body: "" })).toEqual(["T"])
    expect(descriptionBlocks({ title: "", body: "Body." })).toEqual(["Body."])
    expect(descriptionBlocks({ title: "", body: "" })).toEqual([])
  })

  /**
   * Truncated from the tail, which is the opposite of a voice note — prose
   * written to be skimmed opens with the argument, so keeping the head keeps
   * the point. Asserted on the *body* rather than the joined output because the
   * title is prepended after the slice.
   */
  it("truncates an enormous body from the tail", () => {
    const body = `${"a".repeat(MAX_DESCRIPTION_CHARS)}\n\nTHE END`
    const blocks = descriptionBlocks({ title: "T", body })

    expect(blocks.join("\n\n")).not.toContain("THE END")
    expect(blocks[1]?.length).toBe(MAX_DESCRIPTION_CHARS)
  })
})

describe("flattenMarkdown", () => {
  /**
   * The exact constructs the first live merge produced. Taken from the stored
   * scrap of `rif_gh_si-KQpuqSlXGd7tpHnMEQxQ` rather than invented, so the test
   * describes what GitHub actually sends.
   */
  it("removes the markup the first live merge arrived with", () => {
    expect(flattenMarkdown("`AGENTS.md` says brass means one thing: **live**.")).toBe(
      "AGENTS.md says brass means one thing: live."
    )
    expect(flattenMarkdown("## Three things that were working by coincidence")).toBe(
      "Three things that were working by coincidence"
    )
    expect(
      flattenMarkdown("- **`bg-primary/80` was tuned against brass.** It moved 0.052.")
    ).toBe("bg-primary/80 was tuned against brass. It moved 0.052.")
    expect(flattenMarkdown("reads as *disabled*, not hovered")).toBe(
      "reads as disabled, not hovered"
    )
  })

  /**
   * The regression this codebase is most exposed to. It is full of snake_case
   * identifiers, and a loose italic rule renames them inside a quotation — a
   * silent corruption of something presented as the user's own words.
   */
  it("leaves snake_case identifiers alone", () => {
    expect(flattenMarkdown("MAX_SCRAP_CHARS bounds source_item.last_item_at")).toBe(
      "MAX_SCRAP_CHARS bounds source_item.last_item_at"
    )
  })

  it("does not treat a CSS custom property as a list marker", () => {
    expect(flattenMarkdown("--primary and --signal held the same value")).toBe(
      "--primary and --signal held the same value"
    )
  })

  it("keeps link text and drops the URL", () => {
    expect(flattenMarkdown("see [the plan](https://example.com/x) for why")).toBe(
      "see the plan for why"
    )
    expect(flattenMarkdown("![a screenshot](https://example.com/a.png)")).toBe("")
  })

  it("drops table rows, which flatten into gibberish", () => {
    expect(
      flattenMarkdown("Results:\n| a | b |\n|---|---|\n| 1 | 2 |\nand so on")
    ).toBe("Results: and so on")
  })

  it("joins a soft-wrapped paragraph into one line", () => {
    expect(flattenMarkdown("one line\nand its continuation\nand more")).toBe(
      "one line and its continuation and more"
    )
  })

  it("unwraps bold without leaving a stray asterisk", () => {
    expect(flattenMarkdown("**82%** of the ceiling")).toBe("82% of the ceiling")
    expect(flattenMarkdown("__also bold__ here")).toBe("also bold here")
  })

  /**
   * The regression that reached production data.
   *
   * `scripts/backfill-shipped-scraps.ts` mapped this function over pre-split
   * paragraphs, so a fence never met the whole-body strip. The inline-code rule
   * then matched from the *second* backtick of ``` and left ``ts in two stored
   * rows. Idempotence is the property that would have caught it: a transform
   * whose second pass differs from its first is one whose output depends on how
   * many times a script ran.
   */
  it("is idempotent, including on a fence it has to remove itself", () => {
    const inputs = [
      "```ts\nconst a = 1\n```",
      "`AGENTS.md` says **live**",
      "## A heading",
      "- **`bg-primary/80`** was tuned",
      "see [the plan](https://example.com) for why",
      "| a | b |\n|---|---|",
      "MAX_SCRAP_CHARS and --primary",
    ]

    for (const input of inputs) {
      const once = flattenMarkdown(input)
      expect(flattenMarkdown(once), `not stable for ${JSON.stringify(input)}`).toBe(once)
    }
  })

  /**
   * This repository's own pull request bodies use a double fence to quote code
   * that contains a backtick. A single-backtick rule matches the inner pair and
   * leaves strays, which is how a second backfill pass kept shaving characters
   * off stored text after the first had "finished".
   */
  it("unwraps inline code at any fence width", () => {
    expect(flattenMarkdown("the cards showed `` `AGENTS.md` ``, and more")).toBe(
      "the cards showed AGENTS.md , and more"
    )
    expect(flattenMarkdown("`a` then `b`")).toBe("a then b")
  })

  /**
   * Three backticks are a code fence, wherever they appear, so the span goes
   * rather than losing its markers. That rule runs before the inline unwrap and
   * therefore wins — which is the right precedence: a triple-fenced span is a
   * code sample, and plans/021 decision 1 keeps code out of the material.
   */
  it("treats a triple-backtick span as a fence and drops it", () => {
    expect(
      flattenMarkdown("a `single` and a ``double`` and a ```triple```")
    ).toBe("a single and a double and a")
  })

  it("leaves an unpaired backtick alone rather than guessing", () => {
    expect(flattenMarkdown("a stray ` backtick")).toBe("a stray ` backtick")
  })

  it("removes a complete fence when handed one directly", () => {
    expect(flattenMarkdown("```ts\nconst a = 1\n```")).toBe("")
    expect(flattenMarkdown("before ```x``` after")).toBe("before  after".replace(/\s+/g, " "))
  })
})

describe("flattenBlocks", () => {
  /**
   * The whole-body path, which is what every caller should use. Asserted
   * idempotent for the same reason as above: this is the function a backfill
   * runs, and a backfill may run twice.
   */
  it("is idempotent over a body containing a fence and a table", () => {
    const body =
      "Intro.\n\n```ts\nconst a = 1\n\nconst b = 2\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nOutro with `code` and **bold**."

    const once = flattenBlocks(body).join("\n\n")
    const twice = flattenBlocks(once).join("\n\n")

    expect(once).toBe("Intro.\n\nOutro with code and bold.")
    expect(twice).toBe(once)
  })
})

describe("descriptionBlocks with real markdown", () => {
  it("removes fenced code entirely, including its blank lines", () => {
    const blocks = descriptionBlocks({
      title: "T",
      body: "Before.\n\n```ts\nconst a = 1\n\nconst b = 2\n```\n\nAfter.",
    })

    expect(blocks).toEqual(["T", "Before.", "After."])
  })

  it("keeps the paragraph breaks that the card renders", () => {
    const blocks = descriptionBlocks({
      title: "Brass was on every button",
      body: "`AGENTS.md` says brass means **live**.\n\n## A heading\n\n- one item\n- two items",
    })

    expect(blocks).toEqual([
      "Brass was on every button",
      "AGENTS.md says brass means live.",
      "A heading",
      "one item two items",
    ])
  })
})

describe("assembleDescription", () => {
  const blocks = ["zero", "one", "two", "three"]

  it("reassembles the picked blocks verbatim, in written order", () => {
    expect(assembleDescription(blocks, [2, 0])).toBe("zero\n\ntwo")
  })

  /**
   * The guarantee the whole module rests on: every character comes out of
   * `blocks`, so a model that paraphrased or invented a number cannot get it
   * past here. These are the inputs a model never produces in development and
   * eventually produces in production.
   */
  it("ignores indices that are duplicated, negative, fractional or past the end", () => {
    expect(assembleDescription(blocks, [1, 1, -1, 2.5, 99, 3])).toBe(
      "one\n\nthree"
    )
  })

  it("returns nothing for an empty pick, which is the expected answer", () => {
    expect(assembleDescription(blocks, [])).toBe("")
  })

  it("returns nothing when the model did not return a list at all", () => {
    expect(assembleDescription(blocks, "1,2")).toBe("")
    expect(assembleDescription(blocks, null)).toBe("")
    expect(assembleDescription(blocks, undefined)).toBe("")
  })

  it("coerces numeric strings, which the gateway sometimes returns", () => {
    expect(assembleDescription(blocks, ["1", "2"])).toBe("one\n\ntwo")
  })

  /**
   * Capped after sorting, so the cap keeps the start of the passage rather than
   * an arbitrary eight of it.
   */
  it("caps the passage at eight blocks, keeping the earliest", () => {
    const many = Array.from({ length: 20 }, (_, i) => `b${i}`)
    const picked = assembleDescription(
      many,
      Array.from({ length: 20 }, (_, i) => 19 - i)
    )

    expect(picked.split("\n\n")).toHaveLength(8)
    expect(picked.startsWith("b0")).toBe(true)
  })
})
