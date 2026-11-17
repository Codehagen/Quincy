"use client"

import * as React from "react"

import {
  KeyBar,
  Panel,
  PanelBody,
  PanelHeader,
  Toolbar,
  ToolbarTitle,
  WeekCalendar,
  WorkspacePage,
  WorkspacePanes,
} from "@/components/kit"

import { CALENDAR_KEYS, FEED_KEYS } from "./lineup-keys"
import "./lineup.css"

/** Any Monday: the heads are drawn blank, so no date from it is shown. */
const ANY_WEEK = "1970-01-05"
const NO_MOVE = () => false

/**
 * /lineup while its reads are on the way (page.tsx's Suspense fallback): the
 * workspace's own frame at its final size, so nothing moves when the week
 * lands. The title row, the filter row (empty), the calendar's hours and
 * columns with blank day heads, scrolled to the working morning as the
 * calendar opens, the open post's strip, and the keys. Under 860px, or on a
 * touch screen, the Feed's frame. Inert: nothing in it is a place yet. The
 * layout is the workspace's own CSS (lineup.css), so the frame paints at
 * the layout the page will.
 *
 * The heads are blank rather than dated because the week is the account's,
 * read on the server; a date guessed here could be the wrong week.
 */
export function LineupLoading() {
  return (
    <WorkspacePage>
      <div className="lineup-surface flex min-h-0 flex-1 flex-col">
        <Toolbar label="Lineup" divided={false}>
          <ToolbarTitle>Lineup</ToolbarTitle>
        </Toolbar>
        <Toolbar label="Filters" size="filter">
          {/* The chips' line (28), so the row is as tall as the real one, hairline and all. */}
          <span aria-hidden className="h-7" />
        </Toolbar>
        <div className="lineup-feed-only">
          <div className="min-h-0 flex-1" />
        </div>
        <div className="lineup-week-only">
          <CalendarFrame view="week" />
        </div>
        <div className="lineup-day-only">
          <CalendarFrame view="day" />
        </div>
        <div className="lineup-feed-only">
          <KeyBar keys={FEED_KEYS} />
        </div>
        <div className="lineup-cal-only">
          <KeyBar keys={CALENDAR_KEYS} />
        </div>
      </div>
    </WorkspacePage>
  )
}

function CalendarFrame({ view }: { view: "week" | "day" }) {
  // The calendar opens on 07:00 just under the sticky heads (lineup-calendar.tsx); so does its frame.
  // A hidden layout measures nothing and is left alone.
  const bodyRef = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => {
    const scroller = bodyRef.current?.closest<HTMLElement>('[data-slot="kit-panel-body"]')
    const grid = bodyRef.current?.querySelector<HTMLElement>(".wc-body")
    if (!scroller || !grid || grid.getClientRects().length === 0) return
    const top = grid.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
    scroller.scrollTop = top + 7 * 56 - 40
  }, [])
  return (
    <WorkspacePanes>
      <Panel label="The week">
        <WeekCalendar week={ANY_WEEK} view={view} day={ANY_WEEK} onMove={NO_MOVE} hourHeight={56}>
          <PanelBody>
            <div ref={bodyRef} inert className="lineup-week flex flex-col">
              <WeekCalendar.Header>
                {Array.from({ length: view === "week" ? 7 : 1 }, (_, i) => (
                  <span key={i} className="wc-dayhead" />
                ))}
              </WeekCalendar.Header>
              <WeekCalendar.Grid axis={<WeekCalendar.TimeAxis />} />
            </div>
          </PanelBody>
        </WeekCalendar>
      </Panel>
      {/* 320, or 380 from 1200px of workspace: lineup.css sets the variable. */}
      <Panel label="Open post" width="var(--lineup-pane)" edge="start">
        <PanelBody>
          <PanelHeader>
            <span aria-hidden />
          </PanelHeader>
        </PanelBody>
      </Panel>
    </WorkspacePanes>
  )
}
