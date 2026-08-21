import { githubAppManifest, isGithubAppConfigured } from "@/lib/github-app"
import { BASE_URL } from "@/lib/metadata"
import { getSession } from "@/lib/session"

/**
 * Create the GitHub App. Once, by whoever runs this deployment. See plans/021.
 *
 * **GitHub has no API for creating an app.** The manifest flow is the
 * documented substitute and it is the reason this route exists rather than a
 * page of instructions: the operator clicks one button, and GitHub returns a
 * code that `./created` converts into the app id, the private key and the
 * webhook secret in a single call. The alternative is filling in a form with
 * eleven fields and copying four secrets by hand, which is a setup nobody
 * performs correctly the first time.
 *
 * **This is an operator route, not a user route**, and it is gated by the thing
 * it produces: once `GITHUB_APP_ID` is set it answers 404 and can never run
 * again. Before that, a signed-in user could reach it — and the worst that buys
 * them is a GitHub App under their own account that this deployment will never
 * use, because the credentials it returns have to be pasted into environment
 * variables they do not control. That is a small enough blast radius to prefer
 * over inventing an operator role for one endpoint.
 *
 * Run it once against production, paste the four values it prints into Vercel,
 * redeploy, and this route is gone.
 */
export async function GET() {
  if (isGithubAppConfigured()) {
    // 404 rather than 403: the app exists, so this path is finished. Saying so
    // any more precisely would only describe a route nobody can use.
    return new Response("Not found", { status: 404 })
  }

  const session = await getSession()
  if (!session) {
    return new Response("Not signed in", { status: 401 })
  }

  /**
   * The name has to be globally unique across GitHub, and a collision is
   * rejected at the far end with a form error rather than a redirect. Suffixing
   * with the host makes it unique per deployment and keeps preview deployments
   * from fighting production over one name.
   */
  const host = new URL(BASE_URL).hostname.replace(/\./g, "-")
  const manifest = githubAppManifest(BASE_URL, `quincy-${host}`)

  /**
   * A self-submitting form, because the manifest has to arrive as a POST body
   * and the only thing that can POST to github.com is the browser.
   *
   * `JSON.stringify` twice: once for the manifest itself, and once more to
   * embed it as a JavaScript string literal, which escapes the quotes.
   *
   * **It does not escape `<`**, which the first version of this comment claimed
   * it did. A literal `</script>` inside the value would close this tag early
   * and everything after it would parse as HTML. Nothing user-supplied reaches
   * the manifest today — every field is derived from `BASE_URL`, an
   * environment variable — so this is hardening rather than a live hole, and it
   * is the kind of hardening that costs one `replace` and stops mattering the
   * day somebody parameterises the app name.
   */
  const html = `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Creating the Quincy GitHub App…</title></head>
  <body style="font: 15px system-ui; padding: 3rem; max-width: 34rem; margin: 0 auto">
    <p>Sending you to GitHub to create the app. Approve it there and you will come straight back.</p>
    <form id="f" method="post" action="https://github.com/settings/apps/new">
      <input type="hidden" name="manifest" id="m">
      <noscript><button type="submit">Continue to GitHub</button></noscript>
    </form>
    <script>
      document.getElementById("m").value = ${JSON.stringify(
        JSON.stringify(manifest)
      ).replace(/</g, "\\u003c")};
      document.getElementById("f").submit();
    </script>
  </body>
</html>`

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Never cached. It carries a manifest naming this deployment's webhook
      // URL, and a cached copy served after the app exists would create a
      // second one.
      "cache-control": "no-store",
    },
  })
}
