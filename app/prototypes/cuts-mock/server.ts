import type { ChatTransport, InferUIMessageChunk } from "ai"

import { createRun } from "@/lib/editor/agent"
import { currentScene } from "@/lib/editor/document"
import { applyOps, type EditOp } from "@/lib/editor/ops"
import { replayCheck } from "@/lib/editor/replay-model"
import { fixSteps } from "@/lib/editor/self-check"
import type { CutsMessage } from "@/lib/editor/stream-parts"
import type { Word } from "@/lib/editor/transcript"
import { UNLOCKED, type VideoDocument } from "@/lib/editor/types"

/*
 * The server, in the page. It answers the requests the editor makes (save,
 * read-back, self-check, transcript, strong line) from memory, and keeps the
 * document a real route would hold: every `data-ops` part that streams past
 * is applied to it, as the route's working copy is, so Stop and the check see
 * what a live run would leave behind. Nothing here touches the network.
 */

export type MockServer = {
  document: VideoDocument
  revision: number
  /** Ops applied since the last save: whether an abort has anything to keep. */
  touched: boolean
}

export function mockServer(document: VideoDocument, revision: number): MockServer {
  return { document, revision, touched: false }
}

function land(server: MockServer, ops: EditOp[]) {
  if (ops.length === 0) return
  const snapshot = { document: server.document, revision: server.revision, lock: UNLOCKED }
  server.document = applyOps(snapshot, ops, { author: "agent", runId: "mock-run" }).snapshot.document
  server.touched = true
}

function save(server: MockServer): number {
  server.revision += 1
  server.touched = false
  return server.revision
}

type Chunk = InferUIMessageChunk<CutsMessage>

/** The scripted transport, behind the server: ops land here as they stream. */
export function serverTransport(server: MockServer, inner: ChatTransport<CutsMessage>): ChatTransport<CutsMessage> {
  return {
    async sendMessages(options) {
      // Stop: the route saves what already streamed (agent route, onEnd).
      options.abortSignal?.addEventListener("abort", () => {
        if (server.touched) save(server)
      })
      const stream = await inner.sendMessages(options)
      return stream.pipeThrough(
        new TransformStream<Chunk, Chunk>({
          transform(chunk, controller) {
            if (chunk.type === "data-ops") land(server, chunk.data.ops)
            if (chunk.type === "data-saved") {
              chunk = { ...chunk, data: { ...chunk.data, revision: save(server) } }
            }
            controller.enqueue(chunk)
          },
        })
      )
    },
    reconnectToStream: async () => null,
  }
}

/** The offer a scripted run signs: which cut it is for. */
export function mockOffer(sceneId?: string): string {
  return `mock-offer:${sceneId ?? ""}`
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

/** The editor's routes, answered from memory. */
export function mockFetch(server: MockServer, words: Word[], strongLine: string | null): typeof fetch {
  const checked = new Set<string>()

  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://mock")
    const method = (init?.method ?? "GET").toUpperCase()
    const path = url.pathname
    // A beat of latency, so nothing lands in the same frame it was asked for.
    await new Promise((resolve) => setTimeout(resolve, 60))

    if (/^\/api\/editor\/projects\/[^/]+$/.test(path)) {
      if (method === "PUT") {
        const body = JSON.parse(String(init?.body)) as { document: VideoDocument }
        server.document = body.document
        return json({ revision: save(server) })
      }
      return json({ revision: server.revision, lock: null })
    }

    if (/\/transcript$/.test(path)) return json({ words })
    if (/\/strong-line$/.test(path)) return json({ line: strongLine })

    if (/\/check$/.test(path) && method === "POST") {
      const body = JSON.parse(String(init?.body)) as { offer: string; frames: { atUs: number }[] }
      if (!body.offer.startsWith("mock-offer:")) return json({ error: "No check is due for this run." }, 403)
      if (checked.has(body.offer)) return json({ error: "This run has been checked." }, 409)
      checked.add(body.offer)

      const sceneId = body.offer.slice("mock-offer:".length) || undefined
      const document = server.document
      const scene = sceneId
        ? document.scenes.find((s) => s.id === sceneId)
        : currentScene(document)
      if (!scene) return json({ error: "The project has no cut." }, 404)

      // The route's own path with the scripted look (check/route.ts, replay).
      const verdict = replayCheck(scene, body.frames.length)
      const steps = fixSteps(scene, verdict, (scene.canvas ?? document.settings.canvas).height)
      let revision: number | null = null
      if (steps.length > 0) {
        const run = createRun({
          initial: { document, revision: server.revision, lock: UNLOCKED },
          runId: "mock-check",
          onCommit: () => {},
          loadWords: async () => null,
        })
        for (const step of steps) run.commit(step.ops, { toolName: step.toolName })
        server.document = run.snapshot().document
        revision = save(server)
      }
      return json({
        frames: verdict.frames
          .filter((f) => f.index < body.frames.length)
          .map((f) => ({ atUs: body.frames[f.index].atUs, note: f.note })),
        say: verdict.say,
        sceneId: scene.id,
        steps,
        revision,
      })
    }

    return json({ error: `The mock has no ${method} ${path}.` }, 404)
  }
}
