"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { Idea01Icon, Logout01Icon } from "@hugeicons/core-free-icons"

import {
  Avatar,
  ListRow,
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuLinkItem,
  MenuPanel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
  Mono,
} from "@/components/kit"
import { signOut } from "@/lib/auth-client"

import { ACCOUNT_NAV, SETUP_NAV, isActive, type NavItem } from "./nav"

export type ShellUser = { name?: string | null; email: string; image?: string | null }

/** Two characters at most, from the name or else the address. */
function initialsOf(user: ShellUser) {
  return (user.name?.trim() || user.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

/**
 * Who you are signed in as, the pages you set up once, and the way out
 * (Desk, shell lab 2026-11-16). Setup (Brain, Channels, Rhythm) and the
 * account pages (Credits, Billing, Settings) are places, so they are links;
 * they live here because they are touched once and then left alone, and the
 * sidebar is for the work you come back to every day.
 *
 * A Menu, not rows in the footer:
 * theme and sign out are controls, not places to go, and sign out beside two
 * harmless links is the wrong frame for the one control that ends the
 * session. No confirmation: signing out is undone by signing back in.
 *
 * Theme is three states (System, Light, Dark), which a toggle cannot say:
 * its first press writes an explicit theme with no way back to the OS. D
 * still flips light and dark from anywhere (components/theme-provider.tsx).
 */
export function AccountMenu({ user }: { user: ShellUser }) {
  const router = useRouter()
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const [signingOut, setSigningOut] = React.useState(false)
  const [signOutFailed, setSignOutFailed] = React.useState(false)
  const name = user.name?.trim() || user.email

  async function onSignOut() {
    setSigningOut(true)
    setSignOutFailed(false)
    // better-auth answers a refused request with `{ error }` and a dropped
    // connection by throwing. Either way the session is still alive, so the
    // row says so and stays pressable; navigating away would claim a sign
    // out that never happened.
    let failed: boolean
    try {
      const result = await signOut()
      failed = Boolean(result?.error)
    } catch {
      failed = true
    }
    if (failed) {
      setSigningOut(false)
      setSignOutFailed(true)
      return
    }
    // The marketing page, not /login: you asked to leave. Still pending
    // until the page changes, so the row cannot be pressed twice.
    router.push("/")
    // The conversation rows were rendered for the session that just ended;
    // without this the next account on this browser sees them.
    router.refresh()
  }

  // On a setup or account page nothing in the sidebar is lit, because the
  // row you came from lives in this menu. So the trigger takes the selected
  // grey, as a NavRow would: you are somewhere under here.
  //
  // Visible only, on purpose. aria-current on a menu button would announce
  // the button as the current page, which it is not; the page's own heading
  // says where you are, and the row inside the menu carries
  // aria-current="page". So ListRow's `selected="visual"`: the grey,
  // without the aria-current="true" that `selected` would write.
  const here = [...SETUP_NAV, ...ACCOUNT_NAV].some((item) => isActive(pathname, item.href))

  const link = (item: NavItem) => (
    <MenuLinkItem
      key={item.href}
      href={item.href}
      icon={item.icon}
      aria-current={isActive(pathname, item.href) ? "page" : undefined}
    >
      {item.label}
    </MenuLinkItem>
  )

  return (
    <Menu
      // A failure is news about this attempt, not about the next time the
      // menu opens.
      onOpenChange={(open) => {
        if (!open) setSignOutFailed(false)
      }}
    >
      <MenuTrigger
        render={
          <ListRow
            leading={<Avatar initials={initialsOf(user)} />}
            description={user.name?.trim() ? user.email : undefined}
            aria-label={`Account: ${name}`}
            selected={here ? "visual" : false}
          >
            {name}
          </ListRow>
        }
      />
      <MenuPanel side="top" align="start">
        <MenuGroup>
          <MenuGroupLabel>Setup</MenuGroupLabel>
          {SETUP_NAV.map(link)}
        </MenuGroup>
        <MenuSeparator />
        <MenuGroup>{ACCOUNT_NAV.map(link)}</MenuGroup>
        <MenuSeparator />
        <MenuGroup>
          <MenuGroupLabel>
            Theme <Mono>D</Mono>
          </MenuGroupLabel>
          {/* "system" before mount: next-themes has no value until then, and
              an undefined value would flip the group to controlled later.
              It is also the real default, so the fallback is never a lie. */}
          <MenuRadioGroup value={theme ?? "system"} onValueChange={(value) => setTheme(String(value))}>
            <MenuRadioItem value="system">System</MenuRadioItem>
            <MenuRadioItem value="light">Light</MenuRadioItem>
            <MenuRadioItem value="dark">Dark</MenuRadioItem>
          </MenuRadioGroup>
        </MenuGroup>
        <MenuSeparator />
        {/* Read once or never: a menu row, not a sidebar row. */}
        <MenuLinkItem href="/why" icon={Idea01Icon}>
          Why Quincy works this way
        </MenuLinkItem>
        <MenuSeparator />
        <MenuItem
          icon={Logout01Icon}
          disabled={signingOut}
          // The kit's red text, never a red row: this is the one row whose
          // failure the person has to see before trying again.
          tone={signOutFailed ? "danger" : "ink"}
          // Held open until the redirect lands, so the pending label is seen,
          // and so a failure is shown where it was asked for.
          closeOnClick={false}
          onClick={() => void onSignOut()}
        >
          {signingOut ? "Signing out…" : signOutFailed ? "Could not sign out. Try again" : "Sign out"}
        </MenuItem>
        {/* The row's label changes under focus, which a screen reader does
            not read again by itself. */}
        <span role="status" className="sr-only">
          {signOutFailed ? "Could not sign out. You are still signed in." : ""}
        </span>
      </MenuPanel>
    </Menu>
  )
}
