"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Idea01Icon, Logout01Icon, MoreVerticalIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useTheme } from "next-themes"

import { signOut } from "@/lib/auth-client"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar"

/**
 * Who you are signed in as, and the way out.
 *
 * Sign out lives behind this rather than as a row in the footer nav, because it
 * is not navigation. Sitting between Credits and Settings it would read as a
 * third place to go, and proximity to two harmless links is the wrong frame for
 * the one control that ends the session. No confirmation though: signing out is
 * undone by signing back in, which is not what HoldToConfirm is for.
 *
 * It also answers a question the sidebar could not answer before. Now that the
 * brain is per account, "whose voice is Quincy writing in" is worth being able
 * to check without opening Settings.
 *
 * Theme lives here too, for the same reason sign out does: it is a control, not
 * a place to go, and as a row between Settings and the account it read as a
 * third destination. A menu also buys the thing a row could not have — three
 * states. A toggle can only swap light and dark, so the first press wrote an
 * explicit theme and there was no way back to following the OS.
 */
export function UserMenu({
  user,
}: {
  user: { name?: string | null; email: string; image?: string | null }
}) {
  const router = useRouter()
  const { isMobile } = useSidebar()
  const { theme, setTheme } = useTheme()
  const [isSigningOut, setIsSigningOut] = React.useState(false)

  // Initials from the name, falling back to the address. Two characters at
  // most: three is a monogram nobody asked for.
  const initials = (user.name?.trim() || user.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")

  async function onSignOut() {
    setIsSigningOut(true)

    await signOut()
    // The marketing page, not /login. You asked to leave; a login form is the
    // app asking you to come back.
    router.push("/")
    // The sidebar's conversation list was server-rendered for the session that
    // just ended. Without this it stays in the router cache and the next
    // account to sign in on this browser sees the last one's threads.
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            size="lg"
            aria-label="Account"
            // Collapsed to the rail this is an unlabelled avatar, and every
            // other row in the sidebar names itself on hover. The aria-label
            // covers the screen reader; this covers the cursor.
            tooltip={user.name?.trim() || user.email}
          >
            <Avatar size="sm">
              {user.image ? (
                <AvatarImage src={user.image} alt="" />
              ) : null}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            {/* Collapsed to the rail these are display:none, which is why the
                trigger carries its own aria-label — otherwise the button loses
                its accessible name exactly when it is only an avatar. */}
            <div className="grid flex-1 text-left leading-tight">
              <span className="truncate font-medium">
                {user.name?.trim() || user.email}
              </span>
              {user.name?.trim() ? (
                <span className="text-muted-foreground truncate text-xs">
                  {user.email}
                </span>
              ) : null}
            </div>
            <HugeiconsIcon
              icon={MoreVerticalIcon}
              size={16}
              aria-hidden="true"
              className="text-muted-foreground ml-auto"
            />
          </SidebarMenuButton>
        }
      />

      <DropdownMenuContent
        // Up and out of the sidebar on desktop; on mobile the sidebar is a
        // sheet, so the menu follows the trigger instead.
        side={isMobile ? "bottom" : "right"}
        align="end"
        sideOffset={4}
        className="min-w-56"
      >
        {/* The group is required, not decorative. Base UI's GroupLabel throws
            without a Group ancestor — Radix allows a bare label and this is one
            of the places the two APIs diverge. It also reads correctly: the
            address labels the actions that apply to that account. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-muted-foreground font-normal">
            {user.email}
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2">
            Theme
            {/* D still toggles light and dark from anywhere — the fast path.
                Escaping System by pressing it is now a choice you can undo,
                which is the whole reason this moved out of the footer. */}
            <DropdownMenuShortcut>D</DropdownMenuShortcut>
          </DropdownMenuLabel>
          {/* Falls back to "system" rather than undefined: next-themes has no
              value until it has mounted, and handing a controlled group an
              undefined value first makes React switch it to controlled on the
              next render. "system" is also the real default, so the fallback
              is never a lie. */}
          <DropdownMenuRadioGroup
            value={theme ?? "system"}
            onValueChange={setTheme}
          >
            <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          {/* Not a nav item. Somewhere between "read once" and "never", which
              is exactly what a menu is for — a page visited once does not earn
              a permanent row in the sidebar. Named for the question a person
              actually has, not for what we call the document. */}
          <DropdownMenuItem
            render={<Link href="/why" />}
            nativeButton={false}
          >
            <HugeiconsIcon icon={Idea01Icon} aria-hidden="true" />
            Why Quincy works this way
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem
            disabled={isSigningOut}
            onClick={(event) => {
              // The menu closes on select by default, which would unmount the
              // pending state mid-request. Held open until the redirect lands.
              event.preventDefault()
              void onSignOut()
            }}
          >
            <HugeiconsIcon icon={Logout01Icon} aria-hidden="true" />
            {isSigningOut ? "Signing out…" : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
