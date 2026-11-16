import * as React from "react"
import { Tick02Icon } from "@hugeicons/core-free-icons"

import {
  Avatar,
  Button,
  Card,
  Highlight,
  LiveDot,
  MarginNote,
  Mono,
  Rule,
  SkeletonLines,
  Text,
  Window,
} from "@/components/kit"

import { WhyThisHour } from "../demos"
import { Code, Demo, P, Pair, type Section } from "../doc"

export const components: Section[] = [
  {
    id: "layout",
    title: "Stage, Card, Window",
    group: "Components",
    doc: "layout.md",
    body: (
      <>
        <P>
          A stage sits on the white ground: the lead, then one white object.
          A grey recess (<Code>backdrop=&quot;recess&quot;</Code>) only frames a
          picture of the product, where the object sits low and is cut by the
          edge. <Code>crop=&quot;bottom&quot;</Code> runs it 40px off the bottom;{" "}
          <Code>crop=&quot;corner&quot;</Code> off the bottom and the right. A{" "}
          <Code>Window</Code> is a Card with chrome, at most once per view.
        </P>
        <Demo
          lead="Your week, as it stands."
          rest="Four slots, two filled."
          caption={
            <>
              <Code>Window crop=&quot;corner&quot;</Code>: the product continues
              off the frame.
            </>
          }
        >
          <Window address="hirequincy.com/lineup" crop="corner">
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline gap-2">
                <Text as="span" weight="strong">
                  Thursday
                </Text>
                <Mono>07:45</Mono>
              </div>
              <SkeletonLines widths={["78%", "64%", "71%"]} />
              <div className="rounded-kit-control bg-kit-well p-3">
                <Text variant="small" tone="muted">
                  Friday is open.
                </Text>
              </div>
            </div>
          </Window>
        </Demo>
        <Pair
          incorrect={{
            caption: "A window waiting on a loop (06 was discarded).",
            children: (
              <Window address="hirequincy.com/lineup">
                <div className="h-24" />
              </Window>
            ),
          }}
          correct={{
            caption: "The content is there at rest.",
            children: (
              <Window address="hirequincy.com/lineup">
                <Text weight="strong">Thursday</Text>
                <div className="mt-2.5">
                  <SkeletonLines widths={["88%", "62%", "76%"]} />
                </div>
              </Window>
            ),
          }}
        />
        <Pair
          incorrect={{
            caption: "Equal bars read as a table.",
            children: (
              <Card>
                <SkeletonLines widths={["80%", "80%", "80%"]} />
              </Card>
            ),
          }}
          correct={{
            caption: "Varied bars read as prose.",
            children: (
              <Card>
                <SkeletonLines widths={["88%", "72%", "80%"]} />
              </Card>
            ),
          }}
        />
      </>
    ),
  },
  {
    id: "editor-marks",
    title: "Editor marks",
    group: "Components",
    doc: "editor-marks.md",
    body: (
      <>
        <P>
          Quincy highlights the one sentence that matters, writes a short note
          beside a line it has an opinion about, and names a draft&apos;s three
          beats. At most one highlight and one note per object. The card takes{" "}
          <Code>width=&quot;with-margin&quot;</Code> so the note has its column.
        </P>
        <Demo
          lead="Every slot says why it is there."
          rest="The hour comes from your own posts, not a best-time chart."
          caption="Lab 28. The highlight sweeps once when it is seen and the note writes in as it ends. Pick another hour: Count runs to the new number and the note changes its mind."
        >
          <WhyThisHour />
        </Demo>
        <Pair
          incorrect={{
            caption: "Two highlights, one on a heading. Neither wins.",
            children: (
              <Card>
                <Text weight="strong">
                  <Highlight>Thursday</Highlight>
                </Text>
                <Text>
                  <Highlight>That is 1.4× your usual week.</Highlight>
                </Text>
              </Card>
            ),
          }}
          correct={{
            caption: "One highlight, on the finding.",
            children: (
              <Card>
                <Text weight="strong">Thursday</Text>
                <Text>
                  <Highlight>That is 1.4× your usual week.</Highlight>
                </Text>
              </Card>
            ),
          }}
        />
        <Pair
          incorrect={{
            caption: "The note restates the line.",
            children: (
              <Card width="with-margin">
                <MarginNote note="this is the number">
                  <Text variant="figure">31 replies</Text>
                </MarginNote>
              </Card>
            ),
          }}
          correct={{
            caption: "The note is Quincy's reading of it.",
            children: (
              <Card width="with-margin">
                <MarginNote note="five times your median">
                  <Text variant="figure">31 replies</Text>
                </MarginNote>
              </Card>
            ),
          }}
        />
      </>
    ),
  },
  {
    id: "buttons",
    title: "Button",
    group: "Components",
    doc: "buttons.md",
    body: (
      <>
        <P>
          <Code>quiet</Code> is the default. <Code>action</Code> is the one
          next step a view exists for, once per view. <Code>danger</Code> is a
          red label on the quiet control, never a red fill, and sits away from
          the action.
        </P>
        <Demo caption="Press scales to 0.96 in 140ms. Hover on the ink mixes 14% toward the ground, never an alpha.">
          <Card>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button variant="action" icon={Tick02Icon}>
                Approve
              </Button>
              <Button>Edit</Button>
              <span className="ml-auto">
                <Button variant="danger">Discard draft</Button>
              </span>
            </div>
          </Card>
        </Demo>
        <Pair
          incorrect={{
            caption: "Two actions: the view has no hierarchy.",
            children: (
              <Card>
                <div className="flex flex-wrap gap-1.5">
                  <Button variant="action">Approve</Button>
                  <Button variant="action">Schedule</Button>
                </div>
              </Card>
            ),
          }}
          correct={{
            caption: "One action; the rest are quiet.",
            children: (
              <Card>
                <div className="flex flex-wrap gap-1.5">
                  <Button variant="action">Approve</Button>
                  <Button>Schedule</Button>
                </div>
              </Card>
            ),
          }}
        />
      </>
    ),
  },
  {
    id: "pieces",
    title: "Rule, Avatar, LiveDot, Code",
    group: "Components",
    doc: "spacing.md",
    body: (
      <>
        <P>
          The small parts. <Code>Rule</Code> is a hairline across the object,
          edge to edge. <Code>Avatar</Code> is initials in a neutral disc, never
          a photo. <Code>LiveDot</Code> is the only green in the kit: a dot
          beside its label, pulsing only while something is happening now.{" "}
          <Code>Code</Code> is this: a code name in prose, never product text.
        </P>
        <Demo caption="Rule between content and actions. Avatar beside the name it stands for. LiveDot with a pulse while recording, still for a standing state.">
          <Card>
            <div className="flex items-center gap-2.5">
              <Avatar initials="MH" />
              <div className="flex min-w-0 flex-col">
                <Text as="span" weight="strong">
                  Mira Holt
                </Text>
                <Mono>3 replies · 2 days</Mono>
              </div>
            </div>
            <Rule />
            <div className="flex flex-col gap-1.5">
              <Text as="div">
                <LiveDot pulse>Recording</LiveDot>
              </Text>
              <Text as="div" tone="muted">
                <LiveDot>Rhythm on</LiveDot>
              </Text>
            </div>
          </Card>
        </Demo>
        <Pair
          incorrect={{
            caption: "Live as a green pill: the discarded live-ritual pill (20).",
            children: (
              <Card>
                <span className="inline-flex rounded-full bg-kit-live px-2.5 py-0.5 text-kit-small font-kit-strong text-kit-action-on">
                  Live
                </span>
              </Card>
            ),
          }}
          correct={{
            caption: "A dot; the words carry the meaning.",
            children: (
              <Card>
                <Text as="div">
                  <LiveDot pulse>Recording</LiveDot>
                </Text>
              </Card>
            ),
          }}
        />
      </>
    ),
  },
]
