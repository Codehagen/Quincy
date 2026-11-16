"use server"

import { createSampleProject } from "@/lib/editor/sample"
import { getSession } from "@/lib/session"

/**
 * Make a project from the bundled sample recording. Spends nothing: see
 * lib/editor/sample.ts for why, and for the cap and the cooldown it keeps
 * anyway. Returns the project id for the client to open rather than
 * redirecting here, so a refusal can be shown in place under the button.
 */
export async function createSampleProjectAction(): Promise<
  { projectId: string } | { error: string }
> {
  const session = await getSession()
  if (!session) return { error: "Sign in again to try the sample." }

  const outcome = await createSampleProject(session.user.id)
  return outcome.ok
    ? { projectId: outcome.projectId }
    : { error: outcome.error }
}
