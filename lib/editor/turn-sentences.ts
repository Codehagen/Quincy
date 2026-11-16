import type { ToolSentences } from "@/lib/studio-turn"

/**
 * The cutting tools (lib/editor/agent.ts, `editorTools`), said the way
 * Quincy says Studio's: present while running, past once done, one plain
 * sentence when it did not work. The editor chat hands these to
 * `planTurn`, so a run reads "Removed the silences", never
 * "Remove silences" twice or a tool's variable name.
 *
 * A tool missing here still draws (planTurn falls back to its plain name);
 * lib/editor/agent.test.ts fails when one is added without words.
 */
export const EDITOR_TOOL_SENTENCES = {
  remove_silences: {
    running: "Removing the silences",
    done: "Removed the silences",
    failed: "Could not remove the silences.",
  },
  add_captions: {
    running: "Adding captions",
    done: "Added captions",
    failed: "Could not add captions.",
  },
  reframe: {
    running: "Reframing",
    done: "Reframed",
    failed: "Could not reframe it.",
  },
  split_clip: {
    running: "Splitting the clip",
    done: "Split the clip",
    failed: "Could not split the clip.",
  },
  delete_clip: {
    running: "Deleting the clip",
    done: "Deleted the clip",
    failed: "Could not delete the clip.",
  },
  crop: {
    running: "Cropping",
    done: "Cropped",
    failed: "Could not crop it.",
  },
  punch_in: {
    running: "Punching in",
    done: "Punched in",
    failed: "Could not punch in.",
  },
  apply_look: {
    running: "Applying the look",
    done: "Applied the look",
    failed: "Could not apply the look.",
  },
  clear_look: {
    running: "Clearing the look",
    done: "Cleared the look",
    failed: "Could not clear the look.",
  },
  clear_punch_in: {
    running: "Clearing the punch-in",
    done: "Cleared the punch-in",
    failed: "Could not clear the punch-in.",
  },
  fade_clip: {
    running: "Fading the clip",
    done: "Faded the clip",
    failed: "Could not fade the clip.",
  },
  describe_timeline: {
    running: "Reading the timeline",
    done: "Read the timeline",
    failed: "Could not read the timeline.",
  },
} as const satisfies ToolSentences
