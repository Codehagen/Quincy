"use client"

import * as React from "react"
import {
  Attachment01Icon,
  Copy01Icon,
  Delete02Icon,
  Edit02Icon,
  Home01Icon,
  Mic01Icon,
  MoreHorizontalIcon,
  SentIcon,
  Settings01Icon,
} from "@hugeicons/core-free-icons"

import {
  Avatar,
  Button,
  Card,
  CheckItem,
  Checklist,
  Field,
  FileChip,
  IconButton,
  Input,
  List,
  ListHeading,
  ListRow,
  LiveDot,
  Menu,
  MenuItem,
  MenuPanel,
  MenuSeparator,
  MenuTrigger,
  Mono,
  NavRow,
  SearchField,
  Segmented,
  Select,
  Slider,
  Stepper,
  Switch,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
  Textarea,
} from "@/components/kit"

/*
 * Client demos for the controls section. They live here, not in the section
 * file, because most take a handler, and a function cannot cross from a
 * server component into a client one.
 */

const VIEW = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
]

const CHANNELS = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "x", label: "X" },
  { value: "newsletter", label: "Newsletter" },
]

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => ({
  value: d,
  label: d,
}))

/** The collage: choices, after Stageshow's hero. */
export function ChoiceCollage() {
  const [gap, setGap] = React.useState(40)
  return (
    <div className="flex w-full flex-wrap items-center gap-kit-related">
      <Segmented aria-label="View" options={VIEW} defaultValue="week" />
      <Card>
        <Switch label="Draft a reply to every comment" defaultChecked />
      </Card>
      <Stepper label="Posts a week" defaultValue={3} min={1} max={14} />
      <Card>
        <div className="flex w-56 flex-col gap-kit-tight">
          <div className="flex items-baseline justify-between">
            <Text as="span" variant="small" tone="muted">
              Gap between posts
            </Text>
            <Mono tone="ink">{gap} min</Mono>
          </div>
          <Slider aria-label="Gap between posts" value={gap} onValueChange={setGap} min={10} max={120} step={5} />
        </div>
      </Card>
    </div>
  )
}

/** The collage: panels and small controls. */
export function PanelCollage() {
  const [files, setFiles] = React.useState(["walk-tuesday.m4a", "pricing-call.mp3"])
  return (
    <div className="flex w-full flex-wrap items-center gap-kit-related">
      <Select aria-label="Channel" options={CHANNELS} defaultValue="linkedin" />
      <Menu>
        <MenuTrigger render={<IconButton icon={MoreHorizontalIcon} aria-label="More for this draft" />} />
        <MenuPanel>
          <MenuItem icon={Edit02Icon}>Rename</MenuItem>
          <MenuItem icon={Copy01Icon}>Duplicate</MenuItem>
          <MenuSeparator />
          <MenuItem icon={Delete02Icon} tone="danger">
            Discard
          </MenuItem>
        </MenuPanel>
      </Menu>
      <IconButton icon={Mic01Icon} aria-label="Record a riff" size="lg" />
      <div className="w-60">
        <SearchField placeholder="Find a riff" />
      </div>
      {files.map((f) => (
        <FileChip
          key={f}
          name={f}
          meta={f.endsWith(".m4a") ? "4:12" : "31:08"}
          onRemove={() => setFiles((xs) => xs.filter((x) => x !== f))}
        />
      ))}
    </div>
  )
}

/** Rows and a checklist, in their objects. */
export function RowsAndChecks() {
  const [open, setOpen] = React.useState("pricing")
  return (
    <div className="flex w-full flex-wrap items-start gap-kit-related">
      <div className="w-56">
        <List>
          <NavRow href="#controls" icon={Home01Icon} current>
            Studio
          </NavRow>
          <NavRow href="#controls" icon={Mic01Icon} count={12}>
            Riffs
          </NavRow>
          <NavRow href="#controls" icon={Settings01Icon}>
            Settings
          </NavRow>
        </List>
      </div>
      <div className="w-64">
        <List>
          <ListHeading as="h3">Today</ListHeading>
          <ListRow
            selected={open === "walk"}
            onClick={() => setOpen("walk")}
            leading={<span className="grid size-6 place-items-center"><LiveDot pulse /></span>}
            description="Recording now"
            meta={<Mono>0:42</Mono>}
          >
            Tuesday walk
          </ListRow>
          <ListHeading as="h3">Yesterday</ListHeading>
          <ListRow
            selected={open === "pricing"}
            onClick={() => setOpen("pricing")}
            leading={<Avatar initials="AL" />}
            description="The call that changed our pricing page"
            meta={<Mono>16:20</Mono>}
          >
            Ada Lind
          </ListRow>
        </List>
      </div>
      <Card>
        <Checklist aria-label="This week" defaultValue={["recorded", "drafted"]}>
          <CheckItem value="recorded">Recorded a riff</CheckItem>
          <CheckItem value="drafted">Drafted Thursday</CheckItem>
          <CheckItem value="approved">Approved it</CheckItem>
        </Checklist>
      </Card>
    </div>
  )
}

/** Tabs swap a panel; Segmented above would only pick a value. */
export function TabsDemo() {
  return (
    <Card>
      <Tabs defaultValue="drafts">
        <TabList aria-label="Pieces">
          <Tab value="drafts">Drafts</Tab>
          <Tab value="scheduled">Scheduled</Tab>
          <Tab value="sent">Sent</Tab>
        </TabList>
        <TabPanel value="drafts">
          <Text>Two drafts are waiting for you.</Text>
        </TabPanel>
        <TabPanel value="scheduled">
          <Text>
            Thursday goes out at <Mono tone="ink">07:45</Mono>.
          </Text>
        </TabPanel>
        <TabPanel value="sent">
          <Text>Last week: three posts, 1.8× your median.</Text>
        </TabPanel>
      </Tabs>
    </Card>
  )
}

/** A real form: Enter submits, errors under their field, one action. */
export function FormDemo() {
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  return (
    <Card>
      <form
        className="flex flex-col gap-kit-group"
        onSubmit={(e) => {
          e.preventDefault()
          setSaving(true)
          setSaved(false)
          // A stand-in for the request; nothing is sent from the lab.
          window.setTimeout(() => {
            setSaving(false)
            setSaved(true)
          }, 900)
        }}
      >
        <Field
          label="Email for the weekly digest"
          description="Monday 07:00, your week against your own median."
          validate={(v) => (String(v ?? "").includes("@") ? null : "That address has no @ in it.")}
        >
          <Input type="email" name="email" autoComplete="email" required />
        </Field>
        <Field label="Channel">
          <Select options={CHANNELS} defaultValue="linkedin" name="channel" />
        </Field>
        <Field label="What should Quincy never say?">
          <Textarea name="never" placeholder="“Excited to announce”, for a start" />
        </Field>
        <div className="flex items-center gap-kit-related">
          <Button variant="action" type="submit" pending={saving} pendingLabel="Saving…">
            Save
          </Button>
          {saved ? (
            <Text as="span" variant="small" tone="muted" role="status">
              Saved.
            </Text>
          ) : null}
        </div>
      </form>
    </Card>
  )
}

// ── Incorrect / Correct ─────────────────────────────────────────────────

export function SevenSegments() {
  return <Segmented aria-label="Day" options={DAYS} defaultValue="Thu" />
}

export function DaySelect() {
  return <Select aria-label="Day" options={DAYS} defaultValue="Thu" />
}

export function BareSwitch() {
  return (
    <Card>
      <Switch aria-label="Replies" />
    </Card>
  )
}

export function LabelledSwitch() {
  return (
    <Card>
      <Switch label="Draft a reply to every comment" />
    </Card>
  )
}

export function IconAction() {
  return (
    <Card>
      <div className="flex gap-kit-controls">
        <IconButton icon={SentIcon} aria-label="Send" />
        <IconButton icon={Attachment01Icon} aria-label="Attach a file" />
      </div>
    </Card>
  )
}

export function WordAction() {
  return (
    <Card>
      <div className="flex gap-kit-controls">
        <Button variant="action" icon={SentIcon}>
          Send
        </Button>
        <IconButton icon={Attachment01Icon} aria-label="Attach a file" />
      </div>
    </Card>
  )
}

export function PlaceholderLabel() {
  return (
    <Card>
      <Input type="email" placeholder="Email" aria-label="Email" />
    </Card>
  )
}

export function FieldLabel() {
  return (
    <Card>
      <Field label="Email">
        <Input type="email" placeholder="you@company.com" />
      </Field>
    </Card>
  )
}

export function StruckThrough() {
  return (
    <Card>
      <ul className="flex flex-col gap-kit-tight">
        <li className="text-kit-ink-muted line-through">Recorded a riff</li>
        <li className="text-kit-ink-muted line-through">Drafted Thursday</li>
        <li>Approved it</li>
      </ul>
    </Card>
  )
}

export function DoneInInk() {
  return (
    <Card>
      <Checklist aria-label="This week" readOnly defaultValue={["recorded", "drafted"]}>
        <CheckItem value="recorded">Recorded a riff</CheckItem>
        <CheckItem value="drafted">Drafted Thursday</CheckItem>
        <CheckItem value="approved">Approved it</CheckItem>
      </Checklist>
    </Card>
  )
}
