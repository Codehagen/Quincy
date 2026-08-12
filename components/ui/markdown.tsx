import ReactMarkdown from "react-markdown"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"

import { cn } from "@/lib/utils"
import { closeOpenMarkers } from "@/lib/streaming-markdown"

/**
 * Rendered markdown, in the type system that exists for it.
 *
 * `.typeset` plus a preset is the second of the app's two type systems — the
 * role scale dresses chrome, this dresses prose. AGENTS.md is explicit that the
 * two must not meet: never put a `text-*` utility inside a typeset container,
 * because both would try to set the rhythm of the same paragraph. That is why
 * `className` here takes layout only, and why the preset is a named prop rather
 * than something a caller can improvise.
 *
 * No `rehype-raw`. Half of what this renders is written by Heartbeat rather
 * than by a person, and the moment raw HTML passes through, a compiled memory
 * page becomes an injection surface. GFM is on for tables and strikethrough,
 * which is the vocabulary a model reaches for unprompted.
 *
 * `streaming` says the source is still arriving, and turns on the transient
 * marker closing described in lib/streaming-markdown.ts. It is a property of
 * the text, not of the preset, so a wiki page compiled from a live stream would
 * want it too — nothing about it is chat-specific.
 *
 * `remark-breaks` is the one plugin that *is* preset-specific, and the split is
 * about who wrote the newline. In chat a single newline is a line the author
 * meant — a model listing five tool calls one per line, someone laying out a
 * post. Markdown's own rule folds those into one paragraph, which turned that
 * list into a wall of run-on text the moment this component was pointed at the
 * transcript. On a wiki page the opposite is true: the source is hard-wrapped
 * at around 78 columns, so honouring those newlines would put a `<br>` at the
 * end of every line in the privacy policy.
 */
export function Markdown({
  children,
  preset = "wiki",
  streaming = false,
  className,
}: {
  children: string
  preset?: "wiki" | "chat"
  streaming?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "typeset",
        preset === "wiki" ? "typeset-wiki" : "typeset-chat",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={
          preset === "wiki" ? [remarkGfm] : [remarkGfm, remarkBreaks]
        }
      >
        {streaming ? closeOpenMarkers(children) : children}
      </ReactMarkdown>
    </div>
  )
}
