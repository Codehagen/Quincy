"use client"

import * as React from "react"

import { WeekCalendar } from "@/components/kit"
import { Hand } from "@/components/kit/bracket"
import type { WeekPost } from "@/lib/lineup"

import { weekNotes, type CalBlock } from "./lineup-model"

/**
 * Quincy's notes on the week, handwritten in graphite on the grid: "quiet
 * day", "next open slot", "close behind 09:00". A few lower-case words,
 * never a number of anything and never a verdict (`weekNotes` decides
 * which). Each sits in a `WeekCalendar.Note`, so it never takes a press.
 */
export function WeekNotes({ blocks, days, today, posts, thisWeek }: { blocks: readonly CalBlock[]; days: readonly string[]; today: string; posts: readonly WeekPost[]; thisWeek: boolean }) {
  const notes = React.useMemo(() => weekNotes({ blocks, days, today, posts, thisWeek }), [blocks, days, today, posts, thisWeek])
  return (
    <>
      {notes.map((note) => (
        <WeekCalendar.Note key={note.id} day={note.day} minute={note.minute}>
          <Hand tone="graphite">{note.text}</Hand>
        </WeekCalendar.Note>
      ))}
    </>
  )
}
