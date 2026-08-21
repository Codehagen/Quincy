/**
 * Google's G, as Google draws it.
 *
 * Not from the icon set, and not a violation of the one-icon-library rule.
 * That rule exists because stroke weights and corner radii diverge between
 * sets and the mismatch compounds across a surface. A brand mark has fixed
 * geometry and fixed colours by definition — it is never restyled, so there is
 * nothing to diverge. hugeicons ships a `GoogleIcon`, but it is a single
 * monochrome stroke path that reads as a generic swirl; the whole job of this
 * mark is to be recognised in the half second before anyone reads the label.
 *
 * Four paths, four brand colours, no currentColor. It sits on the light and
 * dark button alike, which is what Google's own guidance expects.
 */
export function GoogleMark(props: React.ComponentProps<"svg">) {
  return (
    // No size class on purpose: Button sizes any svg that has not declared one,
    // so the mark tracks the button's own scale instead of pinning itself.
    // Props are spread so `data-icon="inline-start"` reaches the element, which
    // is what the button reads to tighten the leading padding.
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" {...props}>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}
