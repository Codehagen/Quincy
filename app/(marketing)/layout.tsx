import { MarketingShell } from "@/components/marketing"

/**
 * Outside the (app) group on purpose: no sidebar, no conversation list, no
 * database read beyond the session. A stranger should get a page, not an app
 * shell with everything in it disabled.
 *
 * The chrome is the kit's (plans/029): MarketingShell puts every marketing
 * page on the kit ground with MarketingHeader and MarketingFooter. The
 * session read is the header's, behind Suspense, so each page still
 * prerenders into a static shell (components/marketing/header.tsx).
 */
export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <MarketingShell>{children}</MarketingShell>
}
