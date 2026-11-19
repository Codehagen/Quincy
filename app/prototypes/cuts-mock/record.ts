import { createRun, editorTools, scopedTo, type AgentContext, type CommitMeta } from "@/lib/editor/agent"
import { createSnapshot } from "@/lib/editor/document"
import type { EditOp } from "@/lib/editor/ops"
import type { Word } from "@/lib/editor/transcript"
import type { VideoDocument } from "@/lib/editor/types"

/*
 * Runs the editor's real tools against a document, the way the agent route
 * does, and keeps what each call committed and said. The scenarios stream
 * these, so every op the cursor presses was built by the product's own
 * builders (lib/editor/agent.ts → tools.ts, edits.ts), never written by hand.
 */

export type Call = { toolName: string; input: Record<string, unknown>; toolCallId: string }

export type Commit = { ops: EditOp[]; meta?: CommitMeta }

export type Recorded = Call & {
  /** The tool's own words, as the model would read them. */
  output: string
  commits: Commit[]
}

export type Recorder = ReturnType<typeof recorder>

export function recorder(document: VideoDocument, words: Word[], runId = "mock-run") {
  const commits: Commit[] = []
  const run = createRun({
    initial: { ...createSnapshot(document), revision: 1 },
    runId,
    onCommit: (ops, meta) => commits.push({ ops, meta }),
    loadWords: async () => words,
  })

  /** Execute calls in order on `context` (the run, or a cut's scope of it). */
  async function call(calls: Call[], context: AgentContext = run): Promise<Recorded[]> {
    const tools = editorTools(context)
    const out: Recorded[] = []
    for (const c of calls) {
      const from = commits.length
      const execute = tools[c.toolName]?.execute as
        | ((input: unknown, options: { toolCallId: string; messages: [] }) => Promise<unknown>)
        | undefined
      if (!execute) throw new Error(`No tool ${c.toolName}`)
      const output = await execute(c.input, { toolCallId: c.toolCallId, messages: [] })
      out.push({ ...c, output: String(output), commits: commits.slice(from) })
    }
    return out
  }

  /** Commit ops that are not a tool's (a three-cuts scene, a starting state). */
  function commit(ops: EditOp[], meta: CommitMeta): Commit {
    run.commit(ops, meta)
    return commits.at(-1)!
  }

  return {
    run,
    call,
    commit,
    scoped: (sceneId: string) => scopedTo(run, sceneId),
    document: () => run.snapshot().document,
  }
}

/** A document with calls already applied: a scenario's starting state. */
export async function withCalls(document: VideoDocument, words: Word[], calls: Call[]): Promise<VideoDocument> {
  const r = recorder(document, words, "mock-setup")
  await r.call(calls)
  return r.document()
}
