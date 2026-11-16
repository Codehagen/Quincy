"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { MagicWand01Icon } from "@hugeicons/core-free-icons"

import { adaptPostToRiff } from "@/app/(app)/ideas/actions"
import {
  Button,
  Dialog,
  DialogClose,
  DialogFooter,
  DialogPanel,
  DialogTrigger,
  Field,
  Text,
  Textarea,
} from "@/components/kit"
import { useValidatedField } from "@/hooks/use-validated-field"

/**
 * Paste somebody else's post; get ideas you could take from it.
 *
 * **A dialog, not a page and not an inline panel.** The input is one textarea
 * and an optional note: that does not earn a route, and a permanent form on a
 * triage surface competes with the thing being triaged.
 *
 * **The output is not in here.** Submitting closes the dialog and the ideas
 * appear in the list behind it. A modal that stays open to show its result
 * makes you dismiss the result to get at it.
 *
 * On the kit since 2026-11-16: the trigger is always quiet (Record is the
 * page's standing step; adapting somebody else's post is the borrowed case),
 * and Find the ideas is the dialog's one action.
 */

export function AdaptBox({
  onOpen,
  onCaptured,
}: {
  /** Called when the dialog opens, so the page can clear its Undo. */
  onOpen?: () => void
  /** The riff it made, so the page can open it. */
  onCaptured?: (riffId: string) => void
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [note, setNote] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [failure, setFailure] = React.useState<string | null>(null)

  /**
   * The repo's own validation timing rather than a `disabled` submit: reward
   * early, punish late. A submit greyed out with no explanation cannot say why.
   */
  const post = useValidatedField((value) => (value.trim() ? null : "Paste a post first."))

  const postRef = React.useRef<HTMLTextAreaElement>(null)
  const formId = React.useId()

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
      onCaptured?.(result.riffId)
      // The riff it just made is in the list behind this; the page re-reads.
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
        if (next) onOpen?.()
        else setFailure(null)
      }}
    >
      <DialogTrigger render={<Button icon={MagicWand01Icon}>Adapt a post</Button>} />

      <DialogPanel
        title="Adapt a post"
        description="I take the idea, not the words. Their numbers, names and stories stay theirs."
        size="lg"
        /**
         * Focus the paste field on open, and not on a phone: Base UI runs its
         * own focus management after the portal mounts, so an effect racing it
         * loses. The function form is evaluated inside that flow. On a coarse
         * pointer it leaves focus alone, because autofocus slides the keyboard
         * up over the dialog before anybody asked for it.
         */
        initialFocus={() =>
          window.matchMedia("(pointer: coarse)").matches ? false : postRef.current
        }
        footer={
          <DialogFooter>
            <DialogClose disabled={pending}>Cancel</DialogClose>
            {/* Not disabled when empty: submitting an empty field says "Paste
                a post first." right where the problem is. Pending stops a
                double click buying two model calls. */}
            <Button
              type="submit"
              form={formId}
              variant="action"
              pending={pending}
              pendingLabel="Reading…"
            >
              Find the ideas
            </Button>
          </DialogFooter>
        }
      >
        <form
          id={formId}
          className="flex flex-col gap-kit-group"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Field
            label="Somebody else’s post"
            // One message at a time, and the error wins.
            description={post.error ? undefined : "Include the link and I keep it, so the idea can say where it came from."}
            error={post.error ?? undefined}
          >
            <Textarea
              ref={postRef}
              value={post.value}
              onValueChange={post.onChange}
              onBlur={post.onBlur}
              // Locked while the model reads it: anything typed in that window
              // would be silently discarded by the success path.
              disabled={pending}
              // Somebody else's post, often in another language: spellcheck
              // would carpet it in red that means nothing.
              spellCheck={false}
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              rows={5}
              placeholder="Paste the post’s text. A link on its own is not enough: I can’t read a post I haven’t been given."
              aria-invalid={post.error ? true : undefined}
            />
          </Field>

          <Field label="What you’d add (optional)">
            <Textarea
              value={note}
              onValueChange={setNote}
              disabled={pending}
              // Spellcheck stays on: this is your own prose, and it reaches the
              // prompt as your voice.
              autoComplete="off"
              placeholder="We did this the other way round and it cost us six months."
            />
          </Field>

          {/* One live region for the action: what it is doing, then what went
              wrong. A failure sits here, not under a field, because the action
              failed, not the input. */}
          <div aria-live="polite">
            {pending ? (
              <Text variant="small" tone="muted">
                Reading the post and looking for ideas you could take…
              </Text>
            ) : failure ? (
              <Text variant="small">{failure}</Text>
            ) : null}
          </div>
        </form>
      </DialogPanel>
    </Dialog>
  )
}
