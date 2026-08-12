/**
 * Close the markers a half-arrived sentence has opened but not yet shut.
 *
 * A stream hands over `**Vil du at jeg` long before it hands over the closing
 * `**`. Markdown reads that as literal asterisks, so the reader watches raw
 * syntax sit on screen and then, one chunk later, snap into bold — and because
 * bold is wider than regular, the paragraph rewraps and everything below it
 * moves. Closing the marker for the duration of the stream means the text is
 * born bold and never re-lays out.
 *
 * Only the transient render is patched. The caller stops applying this the
 * moment the part settles, so what is finally on screen is exactly what the
 * model wrote — an unbalanced marker in the finished text stays unbalanced.
 *
 * Only the three markers that are unambiguous. `_` and `*` are deliberately
 * left alone: `read_story` and `2 * 3` are not emphasis, and a guess that
 * bolds half a paragraph is worse than the flicker this exists to remove.
 */
export function closeOpenMarkers(source: string) {
  // Inside a fence nothing else is markup, so this is the whole answer.
  const fences = source.match(/^```/gm)

  if (fences && fences.length % 2 === 1) {
    return `${source}\n\`\`\``
  }

  let out = source

  const bold = out.match(/\*\*/g)

  if (bold && bold.length % 2 === 1) {
    out = `${out}**`
  }

  // Single backticks only. The fenced ones are balanced by the check above, so
  // they are removed before counting rather than counted and discounted.
  const inline = out.replace(/```/g, "").match(/`/g)

  if (inline && inline.length % 2 === 1) {
    out = `${out}\``
  }

  return out
}
