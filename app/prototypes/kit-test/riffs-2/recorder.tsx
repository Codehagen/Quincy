"use client"

import * as React from "react"
import { Mic01Icon, StopIcon } from "@hugeicons/core-free-icons"

import {
  Button,
  Card,
  Field,
  FileChip,
  HoldButton,
  Mono,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
  Textarea,
} from "@/components/kit"
import { Friend } from "@/components/mascot"

/** MAX_AUDIO_SECONDS in lib/voice-note.ts. */
export const MAX_SECONDS = 10 * 60

export type RecorderPhase = "idle" | "recording" | "review" | "sending"

export type Take = { name: string; seconds: number }

export function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

export type RecorderProps = {
  mode: "say" | "write"
  onModeChange: (mode: "say" | "write") => void
  phase: RecorderPhase
  elapsed: number
  take: Take | null
  /** Whether this card holds the page's one action right now (actions.md). */
  isAction: boolean
  onToggle: () => void
  onSend: () => void
  onRecordAgain: () => void
  onThrowAway: () => void
  toggleRef: React.Ref<HTMLButtonElement>
  sendRef: React.Ref<HTMLButtonElement>
  text: string
  onTextChange: (text: string) => void
  textError: string | undefined
  writePending: boolean
  onWriteSubmit: () => void
}

/**
 * Capture. Built on the page from Button, Friend and Mono, as states.md says
 * a recorder is ("not a kit component yet"). The microphone is stubbed: the
 * clock runs, no audio is captured.
 */
export function Recorder(props: RecorderProps) {
  const { mode, onModeChange, phase } = props
  return (
    <Card>
      <Tabs value={mode} onValueChange={(v) => onModeChange(v === "write" ? "write" : "say")}>
        <TabList aria-label="How to give me the thought">
          <Tab value="say">Say it</Tab>
          <Tab value="write">Write it</Tab>
        </TabList>
        <TabPanel value="say">
          {phase === "review" && props.take ? <Review {...props} take={props.take} /> : <Live {...props} />}
        </TabPanel>
        <TabPanel value="write">
          <Write {...props} />
        </TabPanel>
      </Tabs>
    </Card>
  )
}

function Live({ phase, elapsed, isAction, onToggle, toggleRef }: RecorderProps) {
  const recording = phase === "recording"
  return (
    <div className="flex flex-wrap items-center gap-kit-related">
      {/* One button whose label changes, so focus stays put and there is no
          aria-pressed (buttons.md, "Toggle buttons"). */}
      <Button
        ref={toggleRef}
        variant={isAction ? "action" : "quiet"}
        icon={recording ? StopIcon : Mic01Icon}
        onClick={onToggle}
      >
        {recording ? "Stop" : "Record a thought"}
      </Button>
      {recording ? (
        <span className="flex items-center gap-kit-related">
          <Text as="span" role="status">
            <span className="inline-flex items-center gap-2">
              <Friend size={20} state="listening" className="shrink-0" />
              <span className="min-w-0">
                Recording
              </span>
            </span>
          </Text>
          {/* Outside the status region, so the clock is not read out every second. */}
          <Mono tone="ink">
            {formatElapsed(elapsed)} / {formatElapsed(MAX_SECONDS)}
          </Mono>
        </span>
      ) : (
        <Text variant="small" tone="muted">
          Up to 10 minutes. You hear it back before it goes anywhere.
        </Text>
      )}
    </div>
  )
}

function Review({
  take,
  phase,
  isAction,
  onSend,
  onRecordAgain,
  onThrowAway,
  sendRef,
}: RecorderProps & { take: Take }) {
  const sending = phase === "sending"
  return (
    <div className="flex flex-col gap-kit-group">
      <div className="flex flex-col gap-kit-tight">
        <Text as="h2" weight="strong">
          Send this take?
        </Text>
        <Text variant="small" tone="muted">
          A messy take is fine. I read through the false starts. One that stopped early is not.
        </Text>
      </div>
      <div>
        <FileChip name={take.name} meta={formatElapsed(take.seconds)} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-kit-related">
        <div className="flex flex-wrap gap-kit-controls">
          <Button
            ref={sendRef}
            variant={isAction ? "action" : "quiet"}
            pending={sending}
            pendingLabel="Sending…"
            onClick={onSend}
          >
            Send to Quincy
          </Button>
          <Button disabled={sending} onClick={onRecordAgain}>
            Record again
          </Button>
        </div>
        {/* The take is the person's work and gone for good once thrown away:
            a hold, away from Send (actions.md). */}
        <HoldButton disabled={sending} onConfirm={onThrowAway}>
          Throw it away
        </HoldButton>
      </div>
    </div>
  )
}

function Write({ text, onTextChange, textError, writePending, isAction, onWriteSubmit }: RecorderProps) {
  return (
    <form
      className="flex flex-col gap-kit-group"
      onSubmit={(e) => {
        e.preventDefault()
        onWriteSubmit()
      }}
    >
      <Field
        label="What happened"
        description="A half-thought is enough. Paste a post you saw and I'll find what you could take from it."
        error={textError}
      >
        <Textarea name="scrap" value={text} onValueChange={onTextChange} rows={3} />
      </Field>
      <div>
        <Button
          type="submit"
          variant={isAction ? "action" : "quiet"}
          pending={writePending}
          pendingLabel="Sending…"
        >
          Find the angles
        </Button>
      </div>
    </form>
  )
}
