"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Delete02Icon, PlusSignIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import {
  SIDEBAR_CONVERSATION_LIMIT,
  type ConversationSummary,
} from "@/lib/conversations"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function ConversationList({
  conversations,
}: {
  conversations: ConversationSummary[]
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [pendingDelete, setPendingDelete] =
    React.useState<ConversationSummary | null>(null)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)
  const [, startTransition] = React.useTransition()

  /**
   * The round trip is a database delete plus a full server re-render of the
   * layout — measured at ~6s on a cold Neon connection. Waiting that long to
   * remove a row you already confirmed makes the app feel broken.
   *
   * useOptimistic holds the filtered list only for the duration of the
   * transition. router.refresh() inside that transition keeps it open until the
   * new server data arrives, so the optimistic list hands over to the real one
   * with nothing in between. If the request fails we return without refreshing:
   * the transition ends, the optimistic value is discarded, and the row comes
   * back on its own — no rollback to write.
   */
  const [visible, removeOptimistically] = React.useOptimistic(
    conversations,
    (current, removedId: string) => current.filter((c) => c.id !== removedId)
  )

  function confirmDelete() {
    const target = pendingDelete

    if (!target) {
      return
    }

    // Closed immediately. A dialog sitting on "Deleting…" for six seconds is
    // the same wait wearing a different hat.
    setPendingDelete(null)
    setDeleteError(null)

    startTransition(async () => {
      removeOptimistically(target.id)

      const response = await fetch(`/api/conversations/${target.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        setDeleteError(`Could not delete “${target.title ?? "Untitled"}”.`)
        return
      }

      // Leave the thread you just deleted, otherwise the next render 404s.
      if (pathname === `/c/${target.id}`) {
        router.push("/studio")
      }

      router.refresh()
    })
  }

  return (
    <>
      <SidebarGroup>
        {/* A link, not a label. "Make" and "Setup" read as categories, but
            "Conversations" reads as a place — so people reach for it, and a
            plain div that swallows the click is the affordance lying. */}
        <SidebarGroupLabel
          render={
            <Link
              href="/conversations"
              className="hover:text-sidebar-foreground rounded-md transition-colors duration-150 ease-out"
            />
          }
        >
          Conversations
        </SidebarGroupLabel>
        <SidebarGroupAction
          aria-label="New conversation"
          render={<Link href="/studio" />}
        >
          <HugeiconsIcon icon={PlusSignIcon} />
        </SidebarGroupAction>

        <SidebarGroupContent>
          <SidebarMenu>
            {visible.length === 0 ? (
              // Not a skeleton — there is nothing loading, there is nothing
              // here. Saying so is more use than a shimmering placeholder for
              // rows that will never arrive.
              <p className="text-caption text-muted-foreground px-2 py-1.5 group-data-[collapsible=icon]:hidden">
                Nothing yet. Ask Quincy something.
              </p>
            ) : (
              visible.map((item) => {
                const active = pathname === `/c/${item.id}`

                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={item.title ?? "Untitled"}
                      render={
                        <Link
                          href={`/c/${item.id}`}
                          aria-current={active ? "page" : undefined}
                        />
                      }
                    >
                      <span>{item.title ?? "Untitled"}</span>
                    </SidebarMenuButton>
                    <SidebarMenuAction
                      showOnHover
                      aria-label={`Delete ${item.title ?? "this conversation"}`}
                      onClick={() => setPendingDelete(item)}
                    >
                      <HugeiconsIcon icon={Delete02Icon} />
                    </SidebarMenuAction>
                  </SidebarMenuItem>
                )
              })
            )}
          </SidebarMenu>
          {/* Only shown once the cap actually bites. Before that it would be a
              link to the same rows you can already see. */}
          {visible.length >= SIDEBAR_CONVERSATION_LIMIT ? (
            <Link
              href="/conversations"
              className="text-caption text-muted-foreground hover:text-foreground ring-ring block rounded-md px-2 py-1.5 outline-hidden transition-colors duration-150 ease-out focus-visible:ring-2 group-data-[collapsible=icon]:hidden"
            >
              See all
            </Link>
          ) : null}

          {deleteError ? (
            <p
              role="alert"
              className="text-destructive text-caption px-2 py-1.5 text-pretty group-data-[collapsible=icon]:hidden"
            >
              {deleteError}
            </p>
          ) : null}
        </SidebarGroupContent>
      </SidebarGroup>

      {/* A dialog rather than hold-to-confirm: this one is not recoverable, and
          the thing being destroyed is named in the copy so you can tell whether
          you grabbed the right row. */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete “{pendingDelete?.title ?? "Untitled"}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The whole thread goes with it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                confirmDelete()
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
