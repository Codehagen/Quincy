import { getPage, putPage } from "../brain"
import {
  CUT_STYLE_SLUG,
  describeCutStyle,
  validCutStyle,
  type CutStyle,
} from "./cut-style"

/**
 * The cut style's home in the Brain: one `cut_style` page per person, its
 * `data` the style and its body the same style in sentences, so it reads on
 * /brain like every other page. Server only.
 */

export async function getCutStyle(userId: string): Promise<CutStyle | null> {
  const page = await getPage(userId, CUT_STYLE_SLUG)
  if (!page || page.kind !== "cut_style") return null
  return validCutStyle(page.data)
}

export async function saveCutStyle(
  userId: string,
  style: CutStyle
): Promise<CutStyle> {
  const valid = validCutStyle(style)
  if (!valid) throw new Error("That is not a cut style Quincy can keep.")
  await putPage({
    userId,
    slug: CUT_STYLE_SLUG,
    kind: "cut_style",
    title: "Cut style",
    body: describeCutStyle(valid).join("\n"),
    data: valid as Record<string, unknown>,
    provenance: "user",
  })
  return valid
}
