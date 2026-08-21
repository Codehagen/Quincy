import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/page-header"

/**
 * Scaffolding. Every nav destination needs a real page or the sidebar walks
 * people into a 404, which is worse than no sidebar at all. Each of these says
 * what the surface will do, so the nav teaches the product instead of
 * dead-ending — delete this file as the surfaces get built.
 */
function SurfacePlaceholder({
  title,
  description,
  icon,
  promise,
}: {
  title: string
  description: string
  icon: IconSvgElement
  promise: string
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 pt-6 pb-12">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>{title}</PageHeaderTitle>
          <PageHeaderDescription>{description}</PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon aria-hidden="true" icon={icon} strokeWidth={1.8} />
          </EmptyMedia>
          <EmptyTitle>Not built yet</EmptyTitle>
          <EmptyDescription>{promise}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  )
}

export { SurfacePlaceholder }
