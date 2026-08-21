"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Loading03Icon, MagicWand01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { adaptPostToRiff } from "@/app/(app)/riffs/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { useValidatedField } from "@/hooks/use-validated-field"

/**
 * Paste somebody else's post; get angles you could take from it.
 *
 * **A dialog, not a page and not an inline panel.** The input is one textarea
 * and an optional note — that does not earn a route, and `slot-composer` is
 * the precedent for a small standing decision in a dialog. Inline was the
 * first attempt, on /drafts, and it was wrong twice over: wrong page, and a
 * permanent form on a triage surface competes with the thing being triaged.
 *
 * **The output is not in here.** Submitting closes the dialog and the riff
 * appears in the list behind it. A modal that stays open to show its result
 * makes you dismiss the result to get at it.
 */
export function AdaptBox({
  variant = "default",
}: {
  /**
   * Where the trigger is rendered. The place decides the weight, and the
   * component decides what the weight means for *it* — which is why this is one
   * contextual prop rather than `variant`/`size` passed through from outside.
   *
   * - `default` — a page header. Small and outlined.
   * - `empty` — the empty state, where it is one of only two things to do and
   *   so earns full size.
   * - `instrument` — the capture card at the top of /riffs. Full size, but
   *   outlined: `RecordBox` is filled there, and two filled buttons side by
   *   side is two primaries, which is none. Speaking your own thought is what
   *   that surface is for; adapting somebody else's post is the borrowed case.
   */
  variant?: "default" | "empty" | "instrument"
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [note, setNote] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [failure, setFailure] = React.useState<string | null>(null)

  /**
   * The repo's own validation timing rather than a `disabled` submit.
   *
   * Reward early, punish late: nothing is flagged while somebody is still
   * pasting, blur only scolds a field they actually touched, and once an error
   * has shown it clears on the next keystroke. A submit button greyed out with
   * no explanation is the alternative, and it cannot say *why*.
   */
  const post = useValidatedField((value) =>
    value.trim() ? null : "Paste a post first."
  )

  const postRef = React.useRef<HTMLTextAreaElement>(null)

  async function submit() {
    if (pending) return
    if (!post.validateNow()) return

    setPending(true)
    setFailure(null)

    try {
      const result = await adaptPostToRiff({ text: post.value, note })

      if (!result.ok) {
        setFailure(result.message)
        return
      }

      post.onChange("")
      setNote("")
      setOpen(false)
      // The riff it just made is in the list behind this. The page is a server
      // component, so it has to re-read.
      router.refresh()
    } catch {
      setFailure("Something went wrong. Try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setFailure(null)
      }}
    >
      <DialogTrigger
        render={
          <Button
            type="button"
            // Filled only in the empty state. `instrument` stays outlined
            // beside a filled Record — see the prop's doc comment.
            variant={variant === "empty" ? "default" : "outline"}
            // `sm` in the header to match SlotComposer's trigger on /lineup;
            // full size wherever capture is the point of the surface.
            size={variant === "default" ? "sm" : "default"}
          >
            <HugeiconsIcon
              aria-hidden="true"
              data-icon="inline-start"
              icon={MagicWand01Icon}
            />
            Adapt a post
          </Button>
        }
      />

      <DialogContent
        className="sm:max-w-lg"
        /**
         * Focus the paste field on open, and not on a phone.
         *
         * `usePointerAutofocus` is the repo's hook for this and it is the
         * right tool for a form that mounts with its page — the auth forms
         * use it. It is the wrong tool *inside a Base UI dialog*: the popup
         * mounts through a portal and Base UI runs its own focus management
         * after, so an effect racing it loses. Measured — focus landed on the
         * close button.
         *
         * The function form is evaluated by Base UI at open time, inside that
         * flow rather than against it. Returning `false` on a coarse pointer
         * leaves focus alone, because autofocus on a phone slides the keyboard
         * up over the dialog before anybody has asked for it.
         */
        initialFocus={() =>
          window.matchMedia("(pointer: coarse)").matches
            ? false
            : postRef.current
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <DialogHeader>
            <DialogTitle>Adapt a post</DialogTitle>
            <DialogDescription>
              Quincy takes the idea, not the words. Their numbers, names and
              stories stay theirs.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="adapt-source">
                Somebody else&rsquo;s post
              </FieldLabel>
              <Textarea
                id="adapt-source"
                ref={postRef}
                value={post.value}
                onChange={(event) => post.onChange(event.target.value)}
                onBlur={post.onBlur}
                onKeyDown={onSubmitKey(submit)}
                // Locked while the model reads it. Without this the field
                // stays live for the seven or eight seconds the call takes,
                // and anything typed in that window is silently discarded —
                // `submit` captured the value before it, and the success path
                // clears the field outright. Typing into a void that then
                // eats your text is worse than a field that says no.
                disabled={pending}
                // Somebody else's post, often in another language. Spellcheck
                // would carpet it in red squiggles that mean nothing, and
                // there is no autofill answer for "a post you saw".
                spellCheck={false}
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                /**
                 * `min-h`/`max-h`, not `rows`.
                 *
                 * The Textarea sets `field-sizing: content`, which sizes to the
                 * content and silently ignores `rows`. Two consequences, both
                 * measured rather than guessed:
                 *
                 * - Without `min-h` the required field rendered SHORTER than
                 *   the optional one below it, purely because its placeholder
                 *   was shorter.
                 * - Without `max-h` it grows without limit. A 2,480-character
                 *   post — well under MAX_SCRAP_CHARS — took the textarea to
                 *   818px and the dialog to 1163px inside a 900px viewport,
                 *   putting the title 131px above the top and "Find angles"
                 *   131px below the fold. The dialog is fixed and does not
                 *   scroll, so a long post could not be submitted at all.
                 *
                 * Capped, the textarea scrolls internally and the dialog stays
                 * where it was put.
                 */
                className="max-h-64 min-h-32"
                placeholder="Paste the post’s text. A link on its own is not enough — Quincy cannot read a post it has not been given."
                aria-invalid={post.error ? true : undefined}
              />
              {/* One message at a time, and the error wins. Stacking it under
                  the hint puts a line of advice between the field and the
                  thing wrong with it, which is the arrangement
                  forms-and-inputs asks you not to ship. */}
              {post.error ? (
                <FieldError>{post.error}</FieldError>
              ) : (
                <FieldDescription>
                  Include the link and Quincy keeps it, so the riff can say
                  where it came from.
                </FieldDescription>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="adapt-note">
                What you&rsquo;d add{" "}
                <span className="text-muted-foreground">(optional)</span>
              </FieldLabel>
              <Textarea
                id="adapt-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                onKeyDown={onSubmitKey(submit)}
                disabled={pending}
                // Spellcheck stays ON here, unlike the field above: this is the
                // user's own prose in their own language, and it is the half
                // that reaches the prompt as their voice.
                autoComplete="off"
                placeholder="We did this the other way round and it cost us six months."
              />
            </Field>
          </FieldGroup>

          {/**
           * One live region for the whole action: what it is doing, then what
           * went wrong if anything did.
           *
           * `aria-live` because both appear without the focus moving, so a
           * screen reader would otherwise learn nothing — the same treatment
           * components/sources/channel-source-row.tsx gives its import, which
           * is the other multi-second wait in the product.
           *
           * A failure sits here rather than under a field because it is the
           * action that failed, not the input: "Quincy could not write this
           * one" is not something a different paste would fix.
           */}
          <div aria-live="polite" className="min-h-5 pb-2">
            {pending ? (
              <p className="text-caption text-muted-foreground">
                Reading the post and looking for angles you could take…
              </p>
            ) : failure ? (
              <p className="text-caption text-destructive">{failure}</p>
            ) : null}
          </div>

          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="ghost" disabled={pending}>
                  Cancel
                </Button>
              }
            />
            {/* Not disabled when empty. A greyed-out button cannot say what
                is missing; submitting an empty field says "Paste a post
                first." right where the problem is. Disabled while pending is
                a different thing and still applies — it stops a double click
                buying two model calls. */}
            <Button type="submit" disabled={pending}>
              {/* Motion, because eight seconds of a static label reads as
                  frozen. Loading03Icon + animate-spin is what hold-to-confirm
                  and resend-verification already use. Under
                  prefers-reduced-motion the global block in app/globals.css
                  flattens animation-duration and caps iterations, so this
                  settles into a still icon rather than a blur. */}
              {pending ? (
                <HugeiconsIcon
                  aria-hidden="true"
                  data-icon="inline-start"
                  icon={Loading03Icon}
                  className="animate-spin"
                />
              ) : null}
              {pending ? "Reading…" : "Find angles"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** ⌘/Ctrl+Enter submits from inside a textarea, per AGENTS.md. Both modifiers
 *  are accepted; only a visible hint would have to choose between them. */
function onSubmitKey(submit: () => void) {
  return (event: React.KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault()
      submit()
    }
  }
}
