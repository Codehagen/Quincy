import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * The role scale, taught to tailwind-merge.
 *
 * Without this it silently deletes half the app's typography. tailwind-merge
 * groups classes by what it thinks they do, and it only knows Tailwind's own
 * names — `text-sm` is a font size, but `text-body` looks exactly like
 * `text-muted-foreground`, so it files ours under colour. Put a size and a
 * colour in one cn() and it resolves the "conflict" by keeping the last one:
 *
 *   cn("text-body", "text-muted-foreground")  ->  "text-muted-foreground"
 *
 * The size is gone, nothing warns, and the element falls back to the inherited
 * 16px. That is why the brain tree rendered 16px next to a sidebar rendering
 * 14px from the same intent: the tree's rows carry a colour, the sidebar's
 * carry `text-sm`, which tailwind-merge recognises and keeps.
 *
 * Fixed here rather than at each call site, because the failure is invisible —
 * nothing errors, nothing logs, the text is just the wrong size — and the next
 * role added to @theme would reintroduce it everywhere at once.
 *
 * Keep in sync with the `--text-*` block in app/globals.css.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "eyebrow",
            "caption",
            "body",
            "body-lg",
            "card-title",
            "section",
            "display",
          ],
        },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
