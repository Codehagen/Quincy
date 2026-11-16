import * as React from "react"

/**
 * True once the element has been on screen, or while it is, with
 * `once: false`. Threshold 0.4 is the lab's: 0.35 fired on a sliver.
 */
export function useInView<T extends Element>({
  once = true,
  threshold = 0.4,
}: { once?: boolean; threshold?: number } = {}): [
  React.RefObject<T | null>,
  boolean,
] {
  const ref = React.useRef<T>(null)
  const [inView, setInView] = React.useState(false)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return
        if (entry.isIntersecting) {
          setInView(true)
          if (once) io.disconnect()
        } else if (!once) {
          setInView(false)
        }
      },
      { threshold },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [once, threshold])

  return [ref, inView]
}
