import Link from "next/link"

import { FOCUS_RING, HIT_40_44 } from "@/components/kit/control-styles"

/** Muted until hovered, the kit's focus ring, a 40px hit area (44px on touch). Shared with WaitlistForm's reset. */
export const NAV_LINK =
  "relative rounded-kit-chip text-kit-ink-muted transition-[color] duration-(--kit-duration-state) ease-kit-out " +
  `motion-reduce:transition-none hover:text-kit-ink ${FOCUS_RING} ${HIT_40_44}`

export type NavLinkProps = Omit<
  React.ComponentPropsWithRef<typeof Link>,
  "className" | "style" | "children"
> & {
  children: React.ReactNode
  /** `hide` drops the link under 40rem, where the header has room for two. Default `show`. */
  narrow?: "show" | "hide"
}

/** A navigation link in the marketing header or footer. Inside a sentence, use the kit's TextLink. */
export function NavLink({ children, narrow = "show", ...props }: NavLinkProps) {
  return (
    <Link {...props} data-slot="marketing-nav-link" className={`${NAV_LINK} ${narrow === "hide" ? "hidden sm:inline" : ""}`}>
      {children}
    </Link>
  )
}
