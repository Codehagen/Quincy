"use client"

/*
 * 42 — The friend rides along, the whole flow.
 *
 * The same script as 41 with 22's cursor: the pixel friend beside the
 * arrow, a soft bloom for the press, the well grey on each target. No
 * accent.
 */

import { FlowDesk } from "../flow-desk"

export function FriendFlow() {
  return <FlowDesk look="friend" ring="soft" tone="well" />
}
