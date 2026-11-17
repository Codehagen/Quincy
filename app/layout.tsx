import type { Viewport } from "next"
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

/**
 * `viewportFit: "cover"` is what makes every `env(safe-area-inset-*)` in the
 * app real: without it they are all 0px, and the composer, sheet, toast and
 * key bar sit on the home indicator. `resizes-content` makes Android's
 * keyboard shrink the layout as iOS's does, so a composer at the bottom of a
 * `dvh` column stays above it. The theme colours are `--kit-ground` in each
 * mode; they follow the OS setting, not the in-app toggle.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdfdfc" },
    { media: "(prefers-color-scheme: dark)", color: "#111110" },
  ],
}

// Sans and mono from one family: they share metrics, so mono metadata
// optically aligns with the sans labels beside it. next/font self-hosts
// as woff2 and generates a metric-matched fallback, so no layout shift.
const fontSans = Geist({
  subsets: ["latin"],
  // The real italic: font-synthesis is off in globals.css, so none is faked.
  style: ["normal", "italic"],
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
