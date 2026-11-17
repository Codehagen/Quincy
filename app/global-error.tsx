"use client"

import { useEffect } from "react"

/**
 * The root layout itself failed, so nothing it provides is here: no
 * globals.css, no fonts, no theme class, no kit. Next renders this as its own
 * document. System colours (Canvas, CanvasText) under `color-scheme: light
 * dark` keep it readable in both modes with no token to resolve. The link is
 * a plain <a> on purpose: a full load is the better retry when the app's
 * own frame is what broke.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="en" style={{ colorScheme: "light dark" }}>
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "1rem",
          background: "Canvas",
          color: "CanvasText",
          font: "15px/1.5 system-ui, sans-serif",
        }}
      >
        <title>Quincy didn’t load</title>
        <main style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "0 0 0.5rem" }}>Quincy didn’t load.</h1>
          <p style={{ margin: "0 0 1.5rem", opacity: 0.7 }}>
            Nothing you saved is lost. Try again, or reload from the home page.
          </p>
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => retry()}
              style={{
                minHeight: "2.75rem",
                padding: "0 1.25rem",
                border: 0,
                borderRadius: "999px",
                background: "CanvasText",
                color: "Canvas",
                font: "inherit",
                fontWeight: 600,
                cursor: "pointer",
                touchAction: "manipulation",
              }}
            >
              Try again
            </button>
            {/* A full page load on purpose: the root layout is what failed,
                so a client navigation would reuse the broken tree. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ color: "inherit", minHeight: "2.75rem", display: "inline-flex", alignItems: "center" }}>
              Go to the home page
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}
