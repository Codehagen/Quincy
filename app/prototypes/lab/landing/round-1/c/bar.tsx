import type * as React from "react"
import Link from "next/link"

import { ButtonLink, Mono } from "@/components/kit"

/**
 * The top line every piece in group c shares, so the five differ in their
 * argument and not in their chrome. The invite link is quiet on purpose:
 * each piece has one accent and spends it on its argument, not on the ask.
 */
export function Bar({ note = "$49 a month. Invites go out in small groups." }: { note?: string }) {
  return (
    <div className="flex h-[72px] items-center justify-between px-16">
      <span className="text-[17px] font-kit-strong tracking-[-0.02em] text-kit-ink">Quincy</span>
      <div className="flex items-center gap-5">
        <Mono>{note}</Mono>
        <ButtonLink href="/">Ask for an invite</ButtonLink>
      </div>
    </div>
  )
}

/**
 * The one pill on a centred hero. Ink on ground, so it is the loudest
 * neutral and never the accent: the accent stays on the argument.
 */
export function Pill({ children }: { children: React.ReactNode }) {
  return (
    <Link
      href="/"
      className="inline-flex h-11 items-center rounded-full bg-kit-ink px-6 text-[15px] font-kit-strong text-kit-ground transition-[opacity] duration-(--kit-duration-state) ease-kit-out outline-kit-focus outline-offset-2 hover:opacity-90 focus-visible:outline-2 motion-reduce:transition-none"
    >
      {children}
    </Link>
  )
}
