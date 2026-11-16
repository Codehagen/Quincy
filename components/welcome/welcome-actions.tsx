"use client"

import * as React from "react"

import {
  answerMaterial,
  answerQuestion,
  enrichHuman,
  finishFirstRun,
  readCorpus,
  skipFirstRun,
} from "@/app/(welcome)/welcome/actions"
// The same action /riffs uses. A second one that skipped its entitlement gate
// or its idempotency, reachable by an account two minutes old, is exactly the
// cost bug AGENTS.md's money section describes.
import { draftAngle } from "@/app/(app)/riffs/actions"

/**
 * What first run does to the world, as one object, the way Studio's draft card
 * takes `StudioDraftActions`. The page uses the server actions; the prototype
 * harness (app/prototypes/welcome) hands in an in-memory set, so every state
 * of the flow can be walked without a write, an X read or a model call.
 */
export type WelcomeActions = {
  answerQuestion: typeof answerQuestion
  answerMaterial: typeof answerMaterial
  readCorpus: typeof readCorpus
  enrichHuman: typeof enrichHuman
  finishFirstRun: typeof finishFirstRun
  skipFirstRun: typeof skipFirstRun
  draftAngle: typeof draftAngle
}

export const serverWelcomeActions: WelcomeActions = {
  answerQuestion,
  answerMaterial,
  readCorpus,
  enrichHuman,
  finishFirstRun,
  skipFirstRun,
  draftAngle,
}

const ActionsContext = React.createContext<WelcomeActions>(serverWelcomeActions)

export function WelcomeActionsProvider({
  actions,
  children,
}: {
  actions: WelcomeActions
  children: React.ReactNode
}) {
  return <ActionsContext.Provider value={actions}>{children}</ActionsContext.Provider>
}

export function useWelcomeActions() {
  return React.useContext(ActionsContext)
}

/**
 * Where a composer that belongs to a later step goes: the bar under the
 * conversation, as in Studio. FirstRun owns the bar and its own composer for
 * the questions; the material step portals its composer into the same place,
 * so there is one composer on screen, always at the bottom.
 */
export const ComposerSlot = React.createContext<HTMLElement | null>(null)
