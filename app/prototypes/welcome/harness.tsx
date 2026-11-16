"use client"

import * as React from "react"

import type { CorpusReceipt, InterviewState, Suggestion } from "@/lib/onboarding"
import { humanAddition, materialAsk, QUESTIONS } from "@/lib/onboarding"
import { FirstRun } from "@/components/welcome/first-run"
import {
  WelcomeActionsProvider,
  type WelcomeActions,
} from "@/components/welcome/welcome-actions"
import { WelcomeFrame } from "@/components/welcome/welcome-frame"
import type { Wiring } from "@/components/welcome/wiring"

import {
  ANSWERS,
  channels,
  FIRST_NAME,
  RECEIPT,
  SUGGESTIONS,
  type HarnessState,
} from "./data"

/**
 * First run, every state, with no server behind it.
 *
 * The real FirstRun in the real frame, handed an in-memory set of actions
 * (WelcomeActions) in place of the server ones. Answering, the X read, the
 * material ask and the angles all move this harness's state the way the
 * server's would move the page's props, so the flow can be walked end to end
 * without a write, an X read or a model call.
 *
 *   ?state=intro      a fresh account: the opening types, then question one
 *   ?state=interview  two answered, the last question open
 *   ?state=wiring     the questions done, nothing connected
 *   ?state=reading    X just connected: the read starts itself
 *   ?state=failed     X connected, and the read fails
 *   ?state=read       the read landed: the portrait and the material ask
 *   ?state=thin       a corpus too thin to say anything about
 *   ?state=ideas      the material given, the angles to pick from
 */

type WiringProps = React.ComponentProps<typeof Wiring>

type World = {
  answered: InterviewState["answered"]
  xConnected: boolean
  corpusItems: number
  receipt: CorpusReceipt | null
  hasMaterial: boolean
  suggestions: Suggestion[]
}

function initial(state: HarnessState): World {
  const base: World = {
    answered: [],
    xConnected: false,
    corpusItems: 0,
    receipt: null,
    hasMaterial: false,
    suggestions: [],
  }
  switch (state) {
    case "intro":
      return base
    case "interview":
      return { ...base, answered: ANSWERS.slice(0, 2) }
    case "wiring":
      return { ...base, answered: ANSWERS }
    case "reading":
    case "failed":
      return { ...base, answered: ANSWERS, xConnected: true }
    case "read":
      return { ...base, answered: ANSWERS, xConnected: true, corpusItems: 87, receipt: RECEIPT }
    case "thin":
      return { ...base, answered: ANSWERS, xConnected: true, corpusItems: 6 }
    case "ideas":
      return {
        ...base,
        answered: ANSWERS,
        xConnected: true,
        corpusItems: 87,
        receipt: RECEIPT,
        hasMaterial: true,
        suggestions: SUGGESTIONS,
      }
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function Harness({ state }: { state: HarnessState }) {
  const [world, setWorld] = React.useState(() => initial(state))

  const actions = React.useMemo<WelcomeActions>(
    () => ({
      async answerQuestion(id, answer) {
        await wait(700)
        const question = QUESTIONS.find((q) => q.id === id)
        if (!question) return { ok: false, message: "That is not one of the questions." }
        setWorld((w) => ({
          ...w,
          answered: [...w.answered, { id: question.id, page: question.page, answer }],
        }))
        return { ok: true }
      },
      async answerMaterial(text, force) {
        await wait(1600)
        if (!force && text.trim().split(/\s+/).length < 8) {
          return {
            ok: false,
            reason: "thin",
            answered: text,
            followUp: "Say a bit more. What was the hard part, and who noticed first?",
          }
        }
        setWorld((w) => ({ ...w, hasMaterial: true, suggestions: SUGGESTIONS }))
        return { ok: true }
      },
      async readCorpus() {
        await wait(2400)
        if (state === "failed") {
          return { ok: false, message: "X did not answer in time." }
        }
        setWorld((w) => ({ ...w, corpusItems: 87, receipt: RECEIPT }))
        return {
          ok: true,
          postsRead: 87,
          receipt: RECEIPT,
          addition: humanAddition(RECEIPT),
          truncated: false,
        }
      },
      async enrichHuman() {
        await wait(600)
        return { ok: true }
      },
      async finishFirstRun() {},
      async skipFirstRun() {},
      async draftAngle() {
        await wait(900)
        // A refusal, so the harness stays put: nothing is written here.
        return {
          ok: false,
          reason: "gone",
          message: "This is the prototype, so nothing was written.",
        }
      },
    }),
    [state],
  )

  const next = QUESTIONS[world.answered.length] ?? null

  const wiring: WiringProps | null = next
    ? null
    : {
        wiring: {
          channels: channels(world.xConnected),
          corpusOfferable: world.xConnected,
          corpusItems: world.corpusItems,
        },
        corpusItems: world.corpusItems,
        receipt: world.receipt,
        suggestions: world.suggestions,
        hasMaterial: world.hasMaterial,
        materialAsk: materialAsk(world.receipt),
        addition: humanAddition(world.receipt),
        githubConnected: false,
        githubInstallUrl: "https://github.com/apps",
        circlebackConnected: false,
      }

  return (
    <WelcomeActionsProvider actions={actions}>
      <WelcomeFrame>
        <FirstRun
          firstName={FIRST_NAME}
          answered={world.answered}
          next={next}
          wiring={wiring}
        />
      </WelcomeFrame>
    </WelcomeActionsProvider>
  )
}
