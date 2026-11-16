"use client"

/*
 * Built on ui-sdk (@ui-sdk/react/token-input), not Base UI: Base UI has no
 * field that holds atomic chips. ui-sdk's editor treats each chip as one
 * character, so Backspace removes a whole chip, arrows step over it, undo
 * works, and each chip is announced with its kind. This file adds the
 * chip-list rules on top: a comma, Enter, blur or a paste turns text into chips.
 */

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon } from "@hugeicons/core-free-icons"
import {
  TokenInput as TokenInputRoot,
  TokenInputEditor,
  TokenInputToken,
  TokenInputTokenRemove,
  type Token,
  type TokenInputValue,
} from "@ui-sdk/react/token-input"

import { CONTROL_SURFACE, FOCUS_RING, INPUT_TEXT } from "./control-styles"

export type TokenInputProps = {
  /** Visible, always: "Channels", "Tags". */
  label: string
  /** One muted line under the field. */
  description?: string
  /**
   * The chips, in order. Pass it to control: the field then shows only
   * these. A new chip or a removal is offered through `onValuesChange`; if
   * the parent does not take it, the chip never appears and what was typed
   * stays in the field as text.
   */
  values?: readonly string[]
  defaultValues?: readonly string[]
  onValuesChange?: (values: string[]) => void
  /**
   * Turns typed text into a chip's value, or null to refuse it. Default:
   * trimmed, with a leading "#" dropped. Duplicates are always refused.
   */
  normalize?: (text: string) => string | null
  /** The most chips it holds. Further ones are refused. */
  max?: number
  /** What a chip is, for screen readers: "channel", "tag". Default "item". */
  kind?: string
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  /** A message from outside the field. Shown under it, and rings it red. */
  error?: string
  /** Submits the values comma-joined under this name. */
  name?: string
}

const SEPARATOR = /[,\n;]/

const defaultNormalize = (text: string) => {
  const v = text.trim().replace(/^#/, "").trim()
  return v === "" ? null : v
}

const tokensOf = (value: TokenInputValue) =>
  value.filter((s): s is Token => typeof s !== "string")

const textOf = (value: TokenInputValue) =>
  value.filter((s): s is string => typeof s === "string").join("")

const KEY_SEP = "\u0000"
const TRAILING_SEPARATORS = /[,\n;\s]+$/

function fromValues(values: readonly string[], type: string): TokenInputValue {
  return values.map((v) => ({ type, value: v, label: v, id: `${type}:${v}` }))
}

/**
 * Splits text segments at separators into chips. `all` also turns the last
 * piece into a chip (Enter, blur, paste); otherwise it stays as typing.
 */
function chip(
  value: TokenInputValue,
  { type, normalize, max, all }: { type: string; normalize: (t: string) => string | null; max: number; all: boolean },
): TokenInputValue {
  const seen = new Set(tokensOf(value).map((t) => t.value))
  const out: TokenInputValue = []
  const add = (raw: string) => {
    const v = normalize(raw)
    if (v === null || seen.has(v) || seen.size >= max) return
    seen.add(v)
    out.push({ type, value: v, label: v, id: `${type}:${v}` })
  }
  value.forEach((seg, i) => {
    if (typeof seg !== "string") {
      out.push(seg)
      return
    }
    const pieces = seg.split(SEPARATOR)
    const last = pieces.pop() ?? ""
    pieces.forEach(add)
    const isTail = i === value.length - 1
    if (all || !isTail) add(last)
    else if (last.trim() !== "") out.push(last.trimStart())
  })
  return out
}

/**
 * Channels, tags, sources as chips you type and remove. Type a word and a
 * comma (or Enter) to make a chip; paste "LinkedIn, X, Threads" and get
 * three. Backspace takes the chip before the caret. The ✕ is for the
 * pointer only; the keyboard's way is Backspace, so assistive tech is not
 * offered a second, unlabelled button per chip.
 *
 * Its own label rather than the kit Field: Field is Base UI and binds to a
 * Base UI control, and one component never mixes the two layers.
 */
export function TokenInput({
  label,
  description,
  values: valuesProp,
  defaultValues = [],
  onValuesChange,
  normalize = defaultNormalize,
  max = Infinity,
  kind = "item",
  placeholder,
  disabled = false,
  readOnly = false,
  error,
  name,
}: TokenInputProps) {
  const labelId = React.useId()
  const descId = React.useId()
  const errorId = React.useId()
  const controlled = valuesProp !== undefined
  const [value, setValue] = React.useState<TokenInputValue>(() =>
    fromValues(valuesProp ?? defaultValues, kind),
  )
  // Controlled: the change offered to the parent, and the text left over if
  // it is accepted. Until `values` comes back with it, nothing is shown as a chip.
  const [offered, setOffered] = React.useState<{ key: string; rest: string } | null>(null)

  // Follow a controlled `values` when it changes: adjusted during render, so
  // the chips never show one value behind. The typed text clears only when
  // the parent accepted what it turned into.
  const key = valuesProp?.join(KEY_SEP)
  const [seenKey, setSeenKey] = React.useState(key)
  if (controlled && key !== seenKey) {
    setSeenKey(key)
    const accepted = offered !== null && offered.key === key
    setOffered(null)
    const text = accepted ? offered.rest : textOf(value)
    setValue([...fromValues(valuesProp, kind), ...(text ? [text] : [])])
  }

  /** `raw` is what the editor held before typing became chips; `next` is after. */
  const commit = (raw: TokenInputValue, next: TokenInputValue) => {
    const before = tokensOf(value).map((t) => t.value)
    const after = tokensOf(next).map((t) => t.value)
    if (before.join(KEY_SEP) === after.join(KEY_SEP)) {
      setValue(next)
      return
    }
    if (!controlled) {
      setValue(next)
      onValuesChange?.(after)
      return
    }
    // Controlled: show only `values`, and keep what was typed until the
    // parent answers. A refused chip stays as text the person can fix.
    const typed = textOf(raw).replace(TRAILING_SEPARATORS, "")
    setOffered({ key: after.join(KEY_SEP), rest: textOf(next) })
    setValue([...fromValues(valuesProp, kind), ...(typed ? [typed] : [])])
    onValuesChange?.(after)
  }

  const describedBy = [description ? descId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined
  const opts = { type: kind, normalize, max }

  return (
    <div data-slot="kit-token-input" className="flex w-full min-w-0 flex-col gap-1.5">
      <span id={labelId} className={`text-kit-body font-kit-strong text-kit-ink select-none ${disabled ? "opacity-50" : ""}`}>
        {label}
      </span>
      <TokenInputRoot
        value={value}
        onValueChange={(next, details) => {
          commit(next, chip(next, { ...opts, all: details.reason === "paste" || details.reason === "drop" }))
        }}
        // Enter makes a chip of what was typed; it never submits the form.
        onSubmit={(current) => commit(current, chip(current, { ...opts, all: true }))}
        copy="label"
        codec={{
          format: (t) => t.label,
          parse: (text) => [text],
        }}
        getTokenDescription={() => kind}
        disabled={disabled}
        readOnly={readOnly}
        renderToken={(token) => (
          <TokenInputToken
            className={
              "mx-0.5 inline-flex h-6 items-center gap-1 rounded-kit-control-inner pr-1 pl-2 align-middle text-kit-small whitespace-nowrap text-kit-ink shadow-kit-inset " +
              "transition-[background-color] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none " +
              "[&[data-selected]]:bg-kit-selected"
            }
          >
            {token.label}
            {readOnly || disabled ? null : (
              <TokenInputTokenRemove
                className={
                  "relative grid size-4 cursor-default place-items-center rounded-full text-kit-ink-muted hover:bg-kit-control-hover hover:text-kit-ink " +
                  "transition-[background-color,color] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none " +
                  // 44 tall on touch, but only 24 wide: that reaches the chip's
                  // own edge (pr-1), so it never covers the next chip's label
                  // and a tap meant for that chip never removes this one.
                  "pointer-coarse:after:absolute pointer-coarse:after:top-1/2 pointer-coarse:after:left-1/2 pointer-coarse:after:h-11 pointer-coarse:after:w-6 pointer-coarse:after:-translate-1/2"
                }
              >
                <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2.5} aria-hidden />
              </TokenInputTokenRemove>
            )}
          </TokenInputToken>
        )}
      >
        <TokenInputEditor
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          placeholder={placeholder}
          onBlur={() => commit(value, chip(value, { ...opts, all: true }))}
          className={
            `min-h-kit-control-md w-full min-w-0 rounded-kit-control px-2.5 py-1.5 leading-6 break-words whitespace-pre-wrap ${CONTROL_SURFACE} ${INPUT_TEXT} ${FOCUS_RING} ` +
            "aria-invalid:shadow-kit-invalid data-disabled:opacity-50 " +
            "data-empty:before:pointer-events-none data-empty:before:text-kit-ink-muted data-empty:before:content-[attr(aria-placeholder)]"
          }
        />
      </TokenInputRoot>
      {name ? <input type="hidden" name={name} value={tokensOf(value).map((t) => t.value).join(",")} /> : null}
      {description ? (
        <span id={descId} className="text-kit-small text-kit-ink-muted">
          {description}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className="text-kit-small text-kit-danger">
          {error}
        </span>
      ) : null}
    </div>
  )
}
