import { Geist, Geist_Mono } from "next/font/google"

import "./globals.css"
import { LapsePanel } from "@/components/lapse-panel"
import { Providers } from "@/components/providers"
import { constructMetadata } from "@/lib/metadata"
import { cn } from "@/lib/utils"

/**
 * The defaults every page inherits when it does not construct its own.
 *
 * `metadataBase` in particular has to live here: without it every relative OG
 * image URL resolves to nothing in production, and Next logs a warning that
 * looks like noise until someone shares a link.
 */
export const metadata = constructMetadata()

// Sans and mono from one family: they share metrics, so mono metadata
// optically aligns with the sans labels beside it. next/font self-hosts
// as woff2 and generates a metric-matched fallback, so no layout shift.
const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontSans.variable, fontMono.variable)}
    >
      <body>
        {/* Dev only: Lapse patches the document's clock (rAF, performance.now,
            Date.now, setTimeout, setInterval) and weighs ~1.7 MB, so it has no
            business in a production page load. Rendered above <Providers> so
            its chunk — and the clock patch inside it — evaluates before the
            app's own client code does. */}
        {process.env.NODE_ENV !== "production" && <LapsePanel />}
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
