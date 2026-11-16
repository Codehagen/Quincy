import { isGithubAppConfigured } from "@/lib/github-app"
import { getSession } from "@/lib/session"

/**
 * GitHub sends the operator back here with a one-time code. See plans/021.
 *
 * The code is worth the whole app for an hour and can be exchanged exactly
 * once, which is why this route does the exchange immediately and then has
 * nothing left to protect. What comes back is the app id, a PEM private key, a
 * webhook secret and an OAuth client secret — four values that belong in
 * environment variables and nowhere else.
 *
 * **They are printed, not stored.** There is no table for deployment
 * credentials and there should not be one: a private key in Postgres is a
 * private key in every backup, every branch copy and every `run_sql` a future
 * agent runs against production. Vercel's environment store is the thing built
 * for this, and the only way to get them there is a human with the dashboard
 * open.
 */
export async function GET(request: Request) {
  if (isGithubAppConfigured()) {
    return new Response("Not found", { status: 404 })
  }

  const session = await getSession()
  if (!session) {
    return new Response("Not signed in", { status: 401 })
  }

  const code = new URL(request.url).searchParams.get("code")

  if (!code) {
    return new Response("No code in the callback.", { status: 400 })
  }

  const response = await fetch(
    `https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`,
    {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "quincy",
      },
    }
  )

  if (!response.ok) {
    /**
     * The commonest cause is a reload. The code is single-use, so the second
     * exchange fails — and if the first one succeeded, the app exists on GitHub
     * with credentials nobody wrote down. Say so plainly rather than offering a
     * retry that cannot work.
     */
    return new Response(
      `GitHub refused the exchange (${response.status}). If you reloaded this ` +
        `page, the code was already spent — delete the half-made app in ` +
        `GitHub's settings and start again.`,
      { status: 502 }
    )
  }

  const app = (await response.json()) as {
    id?: number
    slug?: string
    pem?: string
    webhook_secret?: string
    client_id?: string
    client_secret?: string
    html_url?: string
  }

  if (!app.id || !app.pem || !app.webhook_secret || !app.slug) {
    return new Response("GitHub's response was missing the credentials.", {
      status: 502,
    })
  }

  /**
   * Rendered as `KEY=value` lines, in the shape `vercel env add` and a
   * `.env.local` both take, so the next step is a copy rather than a
   * transcription. The private key keeps its real newlines — see
   * `githubAppConfig`, which unescapes both spellings because Vercel's CLI
   * writes the other one.
   */
  const env = [
    `GITHUB_APP_ID=${app.id}`,
    `GITHUB_APP_SLUG=${app.slug}`,
    `GITHUB_APP_WEBHOOK_SECRET=${app.webhook_secret}`,
    `GITHUB_APP_PRIVATE_KEY="${app.pem.replace(/\n/g, "\\n")}"`,
  ].join("\n")

  const html = `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>The app exists. Store these.</title></head>
  <body style="font: 15px system-ui; padding: 3rem; max-width: 46rem; margin: 0 auto; line-height: 1.5">
    <h1 style="font-size: 1.3rem">The app exists. These are shown once.</h1>
    <p>Put all four into the project's environment, redeploy, then install it from <code>/sources</code>. This page will 404 afterwards.</p>
    <textarea readonly rows="10" style="width: 100%; font: 12px ui-monospace, monospace; padding: .75rem">${escapeHtml(env)}</textarea>
    <p><a href="${escapeHtml(app.html_url ?? "https://github.com/settings/apps")}">The app on GitHub</a></p>
    <p style="color:#666">The OAuth client secret is deliberately not printed. This app authenticates as itself and never as a user, so nothing needs it.</p>
  </body>
</html>`

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
