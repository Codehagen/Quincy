"use client"

import * as React from "react"
import { Player } from "@remotion/player"

import { durationInFrames } from "@/lib/editor/frames"
import type { Scene } from "@/lib/editor/types"

import {
  EditorComposition,
  type CompositionMedia,
  type CompositionProps,
} from "./composition"
import type { Player as EditorPlayer } from "./use-player"

/**
 * The preview, in the Console's centre pane.
 *
 * The prototype drew a gradient with a caption word on it, because a layout
 * decision only needed the shape and where captions sit. The first real version
 * was a `<video>` element, which could show footage and nothing else — captions
 * lived on the timeline and never reached the picture, because nothing was
 * drawing them. This is the compositor, and it draws the document.
 *
 * `<Player>` sizes itself to the composition, which is the canvas, so the
 * reframe control changes the shape of the frame here without any of the
 * aspect-ratio arithmetic the hand-rolled version needed. Wide footage in a
 * 9:16 frame letterboxes, which is the honest state of the edit until something
 * fills it.
 *
 * No controls of Remotion's own: the timeline is the transport, and a second
 * set of controls means two playheads that can disagree. Clicking the picture
 * does nothing for the same reason.
 */
export function StudioPreview({
  player,
  scene,
  media,
  canvas,
  fps,
  durationUs,
  background,
}: {
  player: EditorPlayer
  scene: Scene
  media: Record<string, CompositionMedia>
  canvas: { width: number; height: number }
  fps: number
  durationUs: number
  background: string
}) {
  const inputProps = React.useMemo<CompositionProps>(
    () => ({ scene, media, background }),
    [scene, media, background]
  )

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Player
        ref={player.ref}
        component={EditorComposition}
        inputProps={inputProps}
        durationInFrames={durationInFrames(durationUs, fps)}
        fps={fps}
        compositionWidth={canvas.width}
        compositionHeight={canvas.height}
        // Fits whichever axis runs out first, which is what makes a 9:16
        // project a tall frame in a wide window and a shorter one on a laptop.
        style={{ width: "100%", height: "100%" }}
        // The timeline owns the transport. Every one of these would be a second
        // way to move a playhead that already has an owner.
        controls={false}
        clickToPlay={false}
        doubleClickToFullscreen={false}
        spaceKeyToPlayOrPause={false}
        // A cut that loops has no ending, and the ending is the thing being
        // judged.
        loop={false}
        // Remotion rewinds to the first frame when playback ends, which for a
        // player embedded in a page is right and in an editor is not: you
        // watch to the end to see how it lands, and the playhead snapping to
        // zero takes the last frame away at the moment you are looking at it.
        moveToBeginningWhenEnded={false}
        acknowledgeRemotionLicense
        errorFallback={() => (
          <div className="grid h-full w-full place-items-center bg-black">
            <p className="text-sm text-white/60">
              This clip could not be decoded.
            </p>
          </div>
        )}
      />
    </div>
  )
}
