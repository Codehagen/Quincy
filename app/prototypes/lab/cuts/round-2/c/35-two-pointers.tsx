"use client"

/*
 * 35 — Two pointers, one is yours.
 *
 * Your pointer is the plain white system arrow; it pressed "Tighten the
 * edit" and stays there. Quincy's is the ink arrow with its name, and it
 * does the work on the lanes. The two never trade places: Quincy's is a
 * drawn layer that takes no input, and yours stays free while it works.
 * No accent.
 */

import { openChat } from "../chat"
import { CutDesk } from "../cut-desk"
import { useCutChat } from "../use-cut-chat"
import { Starters } from "./reading"

export function TwoPointers() {
  const chat = useCutChat(() => openChat(), { prompt: "Tighten the edit" })
  return (
    <CutDesk
      chat={chat}
      cursor={{ look: "tag" }}
      foot={
        <div className="relative">
          <Starters chat={chat} />
          {/* The person's own pointer, resting on what it pressed. */}
          <svg aria-hidden width="18" height="23" viewBox="0 0 22 28" className="pointer-events-none absolute top-6 left-[150px] drop-shadow">
            <path
              d="M2 1.5v21.2l5.3-5.1 3.4 8 3.7-1.6-3.4-7.8H18L2 1.5Z"
              className="fill-kit-object stroke-kit-ink"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      }
    />
  )
}
