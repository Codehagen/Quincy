import { getSessionCookie } from "better-auth/cookies"
import { NextResponse, type NextRequest } from "next/server"

/**
 * Route gating. Formerly middleware.ts — Next 16 renamed the convention to
 * `proxy` to make the network boundary explicit, and the runtime is nodejs
 * with no edge option. Renamed by `npx @next/codemod middleware-to-proxy`.
 *
 * Presence check only, no database call. This runs on every navigation, so a
 * real session lookup would put Neon in the request path of every page load.
 * It asks whether a session cookie exists and nothing more.
 *
 * That means this is not the gate. Any cookie with the right name and any
 * value at all satisfies it. The authoritative read is in app/(app)/layout.tsx,
 * which resolves the session for real and redirects when there is none. This
 * file exists to keep signed-out traffic off the app without a database round
 * trip, not to decide who is signed in.
 */

/**
 * Public paths. "/" is the marketing page and is reachable either way.
 *
 * Signing in does not redirect away from it. A logged-in visitor who types the
 * bare domain is usually trying to look at their own landing page, and an app
 * whose owner cannot see what a stranger sees is one nobody keeps looking at.
 * The header swaps "Log in" for "Open Studio" instead.
 *
 * "/why" is the argument the product is built on (docs/vision.md). The landing
 * page leads with a claim that invites the question — it drafts, it does not
 * send — and gating the answer behind a session meant only people who had
 * already paid could read the case for paying.
 *
 * "/privacy" has to be here or it does not do its job. A privacy policy is read
 * by people deciding whether to sign up — before they have an account — and by
 * platform reviewers who will never have one. LinkedIn's Standard tier review
 * requires a reachable policy, and a 307 to /login reads to an automated
 * checker as "no policy at all".
 *
 * "/pricing" is the same argument at its sharpest. Every reader it is written
 * for is signed out by definition — the page exists to turn a stranger into an
 * account — so gating it sends the one audience it has to a login form and
 * asks them to buy before they have seen the price.
 */
/**
 * The last three are files, not pages, and every one of them is fetched by a
 * machine that will never hold a cookie. Left out of this set they answer 307
 * to `/login` — which is not an error a crawler reports, it is a redirect it
 * follows into an HTML page that is not a sitemap, not a robots file and not a
 * PNG. Exactly the failure mode `/api/cron` and `/api/webhooks` hit below, and
 * it was invisible for the same reason: every status code involved looks fine.
 *
 * `/opengraph-image` has no file extension, so the extension alternation in the
 * matcher does not cover it the way it covers a committed `.png`.
 */
/**
 * "/api/waitlist" is the odd one in this set: it is not a page, and unlike the
 * three API prefixes excluded from the matcher below it is called by a real
 * browser. That browser has no session — it belongs to a stranger, which is the
 * entire audience of the waitlist — so without this entry the POST comes back
 * 307 to /login, the fetch follows it into an HTML document, and the form
 * reports "could not reach the server" while the endpoint sits there working.
 */
const PUBLIC = new Set([
  "/",
  "/why",
  "/pricing",
  "/privacy",
  "/changelog",
  "/api/waitlist",
  "/robots.txt",
  "/sitemap.xml",
  // The feed belongs with the three files below rather than with the pages
  // above: it is fetched by readers and validators that will never hold a
  // cookie. Left out it answers 307 to /login, which a reader follows into an
  // HTML page that is not a feed — and every status code on the way looks fine.
  "/changelog/rss.xml",
  "/opengraph-image",
])

/**
 * Signed in, these bounce to the app. The cost is that you cannot look at your
 * own login page without signing out first, which is worth knowing but not
 * worth an exception: the alternative is a signed-in visitor staring at a form
 * they have already filled in.
 */
const AUTH_PAGES = new Set([
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
])

export function proxy(request: NextRequest) {
  const hasSession = Boolean(getSessionCookie(request))
  const { pathname, search } = request.nextUrl

  if (PUBLIC.has(pathname)) {
    return NextResponse.next()
  }

  if (!hasSession && !AUTH_PAGES.has(pathname)) {
    const url = new URL("/login", request.url)
    // Remember where they were headed so login can send them back rather than
    // dumping everyone on the home screen.
    url.searchParams.set("next", `${pathname}${search}`)
    return NextResponse.redirect(url)
  }

  if (hasSession && AUTH_PAGES.has(pathname)) {
    return NextResponse.redirect(new URL("/studio", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /**
     * Everything except the auth API, cron, Next internals, and static files.
     *
     * /api/auth must stay open — it is what issues the session in the first
     * place, and gating it behind a session is a deadlock.
     *
     * /api/cron has no session and never will: Vercel Cron calls it with a
     * bearer token, not a cookie. Left in the matcher it is redirected to
     * /login, which returns 307 to the scheduler and looks like a healthy
     * response, so the job silently never runs. The route authenticates itself
     * against CRON_SECRET and answers 404 to anyone without it.
     *
     * /api/webhooks is the same shape and was caught by exactly that trap: a
     * POST from Resend came back 307 to /login in production, so no delivery
     * event ever reached the handler and bounces would have accumulated
     * invisibly. Machine callers authenticate with a signature, never a
     * cookie — the route verifies the Svix headers and refuses anything it
     * cannot verify.
     *
     * `.well-known/workflow` is the third of exactly the same shape, and the
     * Workflow docs call it out because Next 16's rename of `middleware.ts` to
     * `proxy.ts` makes it easy to miss. The runtime talks to itself over
     * `POST /.well-known/workflow/v1/flow` with no cookie; matched, that POST
     * comes back 307 to /login and the failure surfaces as
     * `[local world] Queue operation failed` with a detached-ArrayBuffer
     * message — which names neither auth nor this file. Two of the three
     * precedents above were found in production; this one is free.
     */
    "/((?!api/auth|api/cron|api/webhooks|\\.well-known/workflow|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
}
