import type { MascotState } from "@/components/mascot/engine"
import type { UploadProgress } from "@/lib/editor/upload-client"

/**
 * What the friend does while a recording comes in.
 *
 * The upload is Quincy's turn: it reads the file, transcribes it and opens
 * the editor, so the friend is `reading` beside the words (docs/design/
 * mascot.md: working, never instead of the words). Opening is the moment it
 * has something for you, so `found` plays once there and hands back to idle.
 */
export function friendForPhase(phase: UploadProgress["phase"]): MascotState {
  return phase === "opening" || phase === "done" ? "found" : "reading"
}
