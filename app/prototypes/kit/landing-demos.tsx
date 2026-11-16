"use client"

import * as React from "react"
import {
  Archive02Icon,
  Delete02Icon,
  GithubIcon,
  Mic01Icon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import {
  Button,
  Card,
  Field,
  Highlight,
  IconButton,
  Input,
  KitPage,
  List,
  ListRow,
  LiveDot,
  Menu,
  MenuItem,
  MenuPanel,
  MenuSeparator,
  MenuTrigger,
  Mono,
  Segmented,
  Switch,
  Tag,
  Tags,
  Text,
  Textarea,
  Well,
} from "@/components/kit"
import { POST } from "@/components/showcase/demos/the-post"

/*
 * The kit half of each pair in "Landing and kit". Built only from kit
 * components and layout utilities, with the same words as the picture
 * beside it, so the difference the owner sees is the component's, not the copy's.
 */

/** HeldPicture, as an app Card. */
export function KitHeldDraft() {
  return (
    <Card>
      <div className="flex flex-col gap-kit-group">
        <div className="flex flex-col">
          <Text as="span" weight="strong">
            41% → 68% in a week
          </Text>
          <Mono>LinkedIn · held for your read</Mono>
        </div>
        <div className="flex flex-col gap-kit-related">
          <Text>{POST.did}</Text>
          <div>
            <Text>{POST.happened}</Text>
            <Text variant="figure">{POST.figure}</Text>
          </div>
          <Text>{POST.meant}</Text>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-kit-related border-t border-kit-hairline pt-kit-related">
          <Text as="span" tone="muted">
            <Mono tone="ink">Wed 08:30</Mono> if you approve
          </Text>
          <div className="flex items-center gap-kit-controls">
            <Button variant="action">Approve</Button>
            <Button>Edit</Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

/** The hero's pull request, quoted back in a Well inside a Card. */
export function KitQuotedSource() {
  return (
    <Card>
      <div className="flex flex-col gap-kit-related">
        <Text as="span" weight="strong">
          Quincy <Mono>Tue 07:40</Mono>
        </Text>
        <Well>
          <span className="flex items-center gap-1.5 text-kit-ink-muted">
            <HugeiconsIcon icon={GithubIcon} size={14} strokeWidth={1.8} aria-hidden />
            <Mono>GitHub · #212 · merged Mon 16:40</Mono>
          </span>
          <Text as="span" weight="strong">
            Cut onboarding from nine screens to three
          </Text>
          <Text as="span" tone="muted">
            Removed the team-size, role, and ‘how did you hear’ steps. Moved the rest after the first
            project.{" "}
            <span className="text-kit-ink">
              <Highlight>Finished signup since Monday: 68%. The week before: 41%.</Highlight>
            </span>
          </Text>
        </Well>
      </div>
    </Card>
  )
}

const IDEAS = [
  { title: "The six questions we stopped asking", kind: "Story", format: "Thread" },
  { title: "41% → 68% in a week", kind: "Number", format: "Short post" },
  { title: "Onboarding is a list of things you’re afraid to skip", kind: "Opinion", format: "Short post" },
] as const

/** IdeasPicture, as a List of ListRows with Tags. Press a row to pick it. */
export function KitIdeas() {
  const [picked, setPicked] = React.useState(1)
  return (
    <div className="flex flex-col gap-kit-related">
      <List>
        {IDEAS.map((idea, i) => (
          <ListRow
            key={idea.title}
            selected={i === picked}
            onClick={() => setPicked(i)}
            description="From #212"
            meta={
              <Tags>
                <Tag>{idea.kind}</Tag>
                <Tag>{idea.format}</Tag>
              </Tags>
            }
          >
            {idea.title}
          </ListRow>
        ))}
      </List>
      <div className="flex justify-end">
        <Button variant="action">Draft this idea</Button>
      </div>
    </div>
  )
}

/** ReadsAndPosts' rows and its "Next" chips, as a List and Tags. */
export function KitSources({ next }: { next: readonly string[] }) {
  return (
    <div className="flex flex-col gap-kit-group">
      <List>
        <ListRow
          leading={<HugeiconsIcon icon={Mic01Icon} size={18} strokeWidth={1.8} aria-hidden />}
          description="What you said out loud, transcribed"
          meta={<Text as="span" variant="small" tone="muted">Record in Quincy</Text>}
        >
          Voice notes
        </ListRow>
        <ListRow
          leading={<HugeiconsIcon icon={GithubIcon} size={18} strokeWidth={1.8} aria-hidden />}
          description="Pull requests as they merge"
          meta={
            <Text as="span" variant="small" tone="muted">
              <LiveDot>Reading #212</LiveDot>
            </Text>
          }
        >
          GitHub
        </ListRow>
      </List>
      <div className="flex flex-col gap-kit-related sm:flex-row sm:items-center">
        <Text as="span" weight="strong" tone="muted">
          Next
        </Text>
        <Tags>
          {next.map((label) => (
            <Tag key={label}>{label}</Tag>
          ))}
        </Tags>
      </div>
    </div>
  )
}

/** Buttons: ink action, quiet, danger, both sizes, and the round IconButton. */
export function KitButtons() {
  return (
    <div className="flex flex-col gap-kit-group">
      <div className="flex flex-wrap items-center gap-kit-controls">
        <Button variant="action" size="lg">
          Approve
        </Button>
        <Button size="lg">Edit</Button>
      </div>
      <div className="flex flex-wrap items-center gap-kit-controls">
        <Button variant="action">Draft the second</Button>
        <Button>Show all 3</Button>
        <Button variant="danger" icon={Delete02Icon}>
          Delete
        </Button>
        <Button variant="action" disabled>
          Approved
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-kit-controls">
        <IconButton icon={PencilEdit02Icon} aria-label="Edit the draft" />
        <IconButton icon={Archive02Icon} aria-label="Archive the idea" size="lg" />
        <Menu>
          <MenuTrigger render={<IconButton icon={MoreHorizontalIcon} aria-label="More" />} />
          <MenuPanel>
            <MenuItem icon={PencilEdit02Icon}>Edit the draft</MenuItem>
            <MenuItem icon={Archive02Icon}>Archive the idea</MenuItem>
            <MenuSeparator />
            <MenuItem icon={Delete02Icon} tone="danger">
              Delete
            </MenuItem>
          </MenuPanel>
        </Menu>
        <Menu>
          <MenuTrigger>Move to…</MenuTrigger>
          <MenuPanel>
            <MenuItem>Thursday</MenuItem>
            <MenuItem>Friday</MenuItem>
            <MenuItem>Next week</MenuItem>
          </MenuPanel>
        </Menu>
      </div>
    </div>
  )
}

/** Segmented and Switch: the picked chip's ink, on a white pill. */
export function KitChoices() {
  return (
    <Card>
      <div className="flex flex-col gap-kit-group">
        <div className="flex flex-wrap items-center gap-kit-related">
          <Segmented
            aria-label="Range"
            options={[
              { value: "day", label: "Day" },
              { value: "week", label: "Week" },
              { value: "month", label: "Month" },
            ]}
            defaultValue="week"
          />
          <Segmented
            aria-label="When"
            size="lg"
            options={[
              { value: "now", label: "Read it first" },
              { value: "830", label: "Yes, 8:30" },
              { value: "no", label: "Not today" },
            ]}
          />
        </div>
        <div className="flex flex-col">
          <Switch label="Text me when a draft is ready" defaultChecked />
          <Switch label="Post without asking" />
        </div>
      </div>
    </Card>
  )
}

/** The waitlist form's Field and Input, plus a Textarea, in a real form. */
export function KitForm() {
  return (
    <form
      className="flex flex-col gap-kit-group"
      onSubmit={(e) => {
        e.preventDefault()
      }}
    >
      <div className="flex flex-col gap-kit-controls sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <Field label="Your email">
            <Input type="email" placeholder="you@example.com" />
          </Field>
        </div>
        <div className="flex flex-col sm:pt-6.5">
          <Button type="submit" variant="action">
            Join
          </Button>
        </div>
      </div>
      <Field label="Note to Quincy" description="It reads this before the next draft.">
        <Textarea placeholder="Shorter hooks this week." />
      </Field>
    </form>
  )
}

/** KitPage's header: the 28px title, the muted line under it, one quiet action. */
export function KitPageHeader() {
  return (
    <div className="-mx-kit-page-gutter -mt-kit-page-top -mb-kit-page-bottom">
      <KitPage
        // A specimen inside the lab: the lab page keeps its one h1.
        titleAs="p"
        title="Ideas"
        summary="3 waiting. Your usual week clears 5."
        actions={<Button>New idea</Button>}
      >
        <Card>
          <Text>
            The six questions we stopped asking <Mono>#212</Mono>
          </Text>
        </Card>
      </KitPage>
    </div>
  )
}
