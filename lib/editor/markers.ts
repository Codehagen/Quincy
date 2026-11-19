import type { EditOp } from "./ops"
import {
  findMainTrack,
  sourceToTimelineUs,
  timelineToSourceUs,
} from "./timeline"
import type { DocumentMetadata, Marker, Scene } from "./types"

/**
 * Markers: places to come back to, set with M at the playhead.
 *
 * Stored against the source instant (types.ts `Marker`), so after a cut
 * moves everything left a marker is still on the word it was put on. A
 * marker whose moment is cut out is not shown, and comes back if the cut is
 * undone. Pressing M where a marker already is takes it away again.
 */

export const MAX_MARKERS = 100

/** Where each marker lands on the timeline now, in order. Cut-out ones are left out. */
export function placeMarkers(
  scene: Scene,
  markers: readonly Marker[] = []
): number[] {
  const spine = findMainTrack(scene)
  if (!spine) return []
  const placed: number[] = []
  for (const marker of markers) {
    const at = sourceToTimelineUs(spine, marker.mediaId, marker.sourceUs)
    if (at !== null) placed.push(at)
  }
  return placed.sort((a, b) => a - b)
}

/**
 * Add a marker at a timeline instant, or take away the one already there
 * (within `toleranceUs`, about a frame).
 */
export function toggleMarker(
  scene: Scene,
  metadata: DocumentMetadata,
  atUs: number,
  toleranceUs = 40_000
): EditOp[] {
  const spine = findMainTrack(scene)
  if (!spine) return []
  const current = metadata.markers ?? []

  const near = current.findIndex((marker) => {
    const at = sourceToTimelineUs(spine, marker.mediaId, marker.sourceUs)
    return at !== null && Math.abs(at - atUs) <= toleranceUs
  })
  if (near >= 0) {
    const next = current.filter((_, index) => index !== near)
    return [
      {
        op: "update_metadata",
        patch: { markers: next.length > 0 ? next : undefined },
      },
    ]
  }

  if (current.length >= MAX_MARKERS) return []
  const hit = timelineToSourceUs(spine, atUs, 0)
  if (!hit) return []
  return [
    {
      op: "update_metadata",
      patch: {
        markers: [
          ...current,
          { mediaId: hit.clip.mediaId, sourceUs: hit.sourceUs },
        ],
      },
    },
  ]
}
