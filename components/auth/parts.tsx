import * as React from "react"

import { Card, Text } from "@/components/kit"

/**
 * The pieces every auth screen shares, on kit tokens. One object per screen:
 * the Card holds the heading and the form; the way to the next screen (log
 * in, the waitlist, forgot password) sits under it in muted text, so the
 * object holds only the decision.
 */

/** The one object: the page's h1, one muted line, and what the screen asks. */
export function AuthCard({
  title,
  lead,
  titleRef,
  children,
}: {
  title: string
  lead?: React.ReactNode
  /**
   * Opt-in: makes the h1 focusable from script, for a screen that replaces
   * the form it answers, so focus lands on the answer instead of the page.
   */
  titleRef?: React.Ref<HTMLElement>
  children?: React.ReactNode
}) {
  return (
    <Card>
      <div className="flex flex-col gap-kit-group">
        <div className="flex flex-col gap-kit-related">
          <Text as="h1" variant="title" ref={titleRef} tabIndex={titleRef ? -1 : undefined}>
            {title}
          </Text>
          {lead != null ? (
            <Text tone="muted" as="div">
              <span className="text-pretty">{lead}</span>
            </Text>
          ) : null}
        </div>
        {children}
      </div>
    </Card>
  )
}

/** The address a screen is talking about, in ink inside a muted line. */
export function Address({ children }: { children: React.ReactNode }) {
  return <span className="font-kit-strong break-all text-kit-ink">{children}</span>
}

/** A muted line under the Card, holding one TextLink. */
export function AuthNote({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="small" tone="muted">
      {children}
    </Text>
  )
}

/**
 * A failure that is not about one field: the server refused, the limiter
 * said wait, the network dropped. After states.md, "Refused or failed": one
 * sentence in ink, no red, no icon. `role="alert"` rather than `status`
 * because it answers the submit the person just made, and a screen reader
 * user would otherwise press Log in again into the same answer.
 */
export function FormNotice({ children }: { children: React.ReactNode }) {
  return (
    <Text role="alert" as="p">
      <span className="text-pretty">{children}</span>
    </Text>
  )
}

/**
 * Submit and the controls around it, in one column. Each Button or
 * ButtonLink inside takes `width="full"`, so it spans the Card.
 */
export function AuthActions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-kit-related">{children}</div>
}
