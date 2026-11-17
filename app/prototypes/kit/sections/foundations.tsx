import * as React from "react"
import { Delete02Icon, Tick02Icon } from "@hugeicons/core-free-icons"

import {
  Button,
  Card,
  Highlight,
  Lead,
  Mono,
  Muted,
  SkeletonLines,
  Text,
} from "@/components/kit"
import { Friend } from "@/components/mascot"

import { ApproveSwap, TheDraft } from "../demos"
import { Code, Demo, P, Pair, type Section } from "../doc"

export const foundations: Section[] = [
  {
    id: "kit",
    title: "The kit",
    group: "Foundations",
    doc: "README.md",
    body: (
      <>
        <P>
          Quincy looks like a page someone has marked up, not a dashboard. A
          near-white ground, one white object on it lifted by a hairline ring
          and a soft shadow, grey only as a recess or a picked row, and Quincy
          writing in the margin like an editor with a pen.
        </P>
        <P>
          Kit pages use the <Code>kit-*</Code> semantic utilities only. Never a
          primitive like <Code>--kit-gray-530</Code>, never a raw value, and
          never the old <Code>--primary</Code>, brass, sand or{" "}
          <Code>components/ui</Code>. A page moves to the kit whole, inside{" "}
          <Code>KitRoot</Code>.
        </P>
        <Demo
          lead="Every draft reads in three beats."
          rest="Nothing goes out in your name until you approve it."
          caption="Lab 21 on the kit. Point at a beat to quiet the other two; press Approve, then Undo."
        >
          <TheDraft />
        </Demo>
      </>
    ),
  },
  {
    id: "colour",
    title: "Colour",
    group: "Foundations",
    doc: "colour.md",
    body: (
      <>
        <P>
          Everything is neutral except four jobs, one hue each: highlight
          (yellow), pen (blue, the beat brackets only), live (a green dot) and
          danger (a red label). The action is not a colour: it is the ink pill,
          as on the landing. If a colour is not doing one of those jobs, it is
          decoration, and the kit has none.
        </P>
        <Demo caption="Every job on one object: the friend at work, Highlight, the ink action, a danger label. Every text pair is at least 4.5:1.">
          <Card>
            <div className="flex flex-col gap-3">
              <Text as="div" variant="small">
                <span className="inline-flex items-center gap-2">
                  <Friend size={20} state="listening" className="shrink-0" />
                  <span className="min-w-0">
                    Recording <Mono>0:42</Mono>
                  </span>
                </span>
              </Text>
              <Text>
                <Highlight>Three people wrote back.</Highlight>{" "}
                <Muted>Your median is one.</Muted>
              </Text>
              <div className="flex flex-wrap gap-1.5">
                <Button variant="action" icon={Tick02Icon}>
                  Approve
                </Button>
                <Button>Edit</Button>
                <span className="ml-auto">
                  <Button variant="danger" icon={Delete02Icon}>
                    Delete
                  </Button>
                </span>
              </div>
            </div>
          </Card>
        </Demo>
        <Pair
          incorrect={{
            caption: "Blue decorates a heading, so blue means two things.",
            children: (
              <Card>
                <h3 className="text-kit-body font-kit-strong text-kit-action-ink">
                  Thursday
                </h3>
                <div className="mt-3">
                  <Button variant="action">Approve</Button>
                </div>
              </Card>
            ),
          }}
          correct={{
            caption: "The heading is ink at 560; blue is only the pen.",
            children: (
              <Card>
                <Text as="h3" weight="strong">
                  Thursday
                </Text>
                <div className="mt-3">
                  <Button variant="action">Approve</Button>
                </div>
              </Card>
            ),
          }}
        />
      </>
    ),
  },
  {
    id: "type",
    title: "Type",
    group: "Foundations",
    doc: "type.md",
    body: (
      <>
        <P>
          Inter 14/20 at 460. Hierarchy is weight (460, 560, 600) and grey,
          almost never size. Caveat is Quincy&apos;s pen and nothing else. Mono
          is for times, file names and counts.
        </P>
        <Demo caption="body · strong · muted · figure · small · mono. That is the whole scale.">
          <Card>
            <div className="flex flex-col gap-1">
              <Text weight="strong">Draft for X</Text>
              <Mono>onboarding-email.md · 186 chars</Mono>
              <div className="mt-2.5">
                <Text>Replies in the first week:</Text>
                <Text variant="figure">31</Text>
                <Text variant="small" tone="muted">
                  Your median is 6.
                </Text>
              </div>
            </div>
          </Card>
        </Demo>
        <Pair
          incorrect={{
            caption: (
              <>
                <Code>variant=&quot;figure&quot;</Code> as a heading.
              </>
            ),
            children: (
              <Card>
                <Text variant="figure" as="h3">
                  Drafts
                </Text>
                <Text tone="muted">Nothing to send today.</Text>
              </Card>
            ),
          }}
          correct={{
            caption: "A heading is strong at body size.",
            children: (
              <Card>
                <Text weight="strong" as="h3">
                  Drafts
                </Text>
                <Text tone="muted">Nothing to send today.</Text>
              </Card>
            ),
          }}
        />
        <Pair
          incorrect={{
            caption: "Mono on words.",
            children: (
              <Card>
                <Mono>Draft for X</Mono>
              </Card>
            ),
          }}
          correct={{
            caption: "Mono on the file name and the count.",
            children: (
              <Card>
                <Text weight="strong">Draft for X</Text>
                <Mono>walk-tuesday.m4a · 4:12</Mono>
              </Card>
            ),
          }}
        />
      </>
    ),
  },
  {
    id: "surfaces",
    title: "Surfaces",
    group: "Foundations",
    doc: "surfaces.md",
    body: (
      <>
        <P>
          Ground, then stage, then object. The object lifts by its elevation:
          a 1px ring and a soft fall, never a border. Radii are 24 for the
          stage, 18 for the object, 12 for controls; an inner radius is the
          outer one minus the padding.
        </P>
        <Demo caption="A small object stacked above the main one, 14px apart. Only the last one crops.">
          <Card>
            <Lead bold="Nothing to send today." rest="Tell me about your week." />
          </Card>
          <Card crop="bottom">
            <Text weight="strong">Thursday</Text>
            <div className="mt-3">
              <SkeletonLines widths={["92%", "74%", "84%", "60%", "88%"]} />
            </div>
          </Card>
        </Demo>
        <Pair
          incorrect={{
            caption: "A border and a Tailwind shadow: two depth systems.",
            children: (
              <div className="w-full rounded-xl border border-kit-hairline bg-kit-object p-kit-pad shadow-md">
                <Text weight="strong">Thursday</Text>
              </div>
            ),
          }}
          correct={{
            caption: (
              <>
                <Code>Card</Code>: ring and fall from one token.
              </>
            ),
            children: (
              <Card>
                <Text weight="strong">Thursday</Text>
              </Card>
            ),
          }}
        />
      </>
    ),
  },
  {
    id: "motion",
    title: "Motion",
    group: "Foundations",
    doc: "motion.md",
    body: (
      <>
        <P>
          Motion the person causes, and nothing else: no timers, no loops, no
          autoplay. State is a transition, so a reversed toggle retargets.
          Durations are 140 press, 200 state, 320 enter, 520 travel, 700 sweep.
        </P>
        <Demo caption="Arrive: press Approve, then Undo while it is still moving. It turns around instead of restarting.">
          <ApproveSwap />
        </Demo>
      </>
    ),
  },
]
