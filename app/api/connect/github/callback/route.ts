import { redirect } from "next/navigation"

import { fetchInstallation, isGithubAppConfigured } from "@/lib/github-app"
import { connectGithubInstallation } from "@/lib/source-connections"
import { getSession } from "@/lib/session"

/**
 * Where GitHub returns a user after they install the app. See plans/021.
 *
 * The app's *setup URL*, not an OAuth callback, and the distinction is the
 * point: a setup URL fires on installation, so the app never asks for a user
 * token and never holds one. What it gets instead is an installation id in the
 * query string — and a query string is something the browser can edit.
 *
 * So the id is confirmed against GitHub with the app's own private key before a
 * row is written for it. Without that step, pasting somebody else's
 * installation id into this URL would attach their merges to your account.
 *
 * Identity comes from the session, which is the one thing a redirect through a
 * browser still carries and an inbound webhook never does.
 */
export async function GET(request: Request) {
  if (!isGithubAppConfigured()) {
    redirect("/sources?github=unconfigured")
  }

  const session = await getSession()

  if (!session) {
    /**
     * Signed out mid-install — the app *is* installed on GitHub at this point,
     * so this cannot simply fail. Sign them in and come straight back: the
     * installation id survives in the `next` parameter and the row gets written
     * on the second pass.
     */
    const back = new URL(request.url)
    redirect(`/login?next=${encodeURIComponent(back.pathname + back.search)}`)
  }

  const params = new URL(request.url).searchParams
  const installationId = Number(params.get("installation_id"))

  /**
   * `setup_action=request` means they asked an organisation owner for approval
   * rather than installing. There is nothing to record — the installation does
   * not exist yet — and GitHub will send them here again if it is granted.
   */
  if (params.get("setup_action") === "request") {
    redirect("/sources?github=requested")
  }

  if (!Number.isInteger(installationId) || installationId <= 0) {
    redirect("/sources?github=failed")
  }

  const installation = await fetchInstallation(installationId)

  if (!installation) {
    // Either the id was invented, or the app's key cannot read it. Both are
    // "we will not write a row for this", and neither is worth distinguishing
    // to the person looking at the page.
    redirect("/sources?github=failed")
  }

  /**
   * A personal installation needs no typing; an organisation one does.
   *
   * On a user account, the account *is* the person, so their login is known and
   * merges can be attributed immediately. On an organisation the account is the
   * org name, which is not an author — leaving `login` empty is what makes
   * `shippedGate` refuse everything until they say which username is theirs,
   * and refusing is the only safe reading. The alternative is drafting a post
   * about a colleague's work under your name.
   */
  const login =
    installation.accountType === "User"
      ? installation.account.toLowerCase()
      : ""

  const connected = await connectGithubInstallation(session.user.id, {
    installationId: installation.id,
    account: installation.account,
    accountType: installation.accountType,
    login,
  })

  if (!connected.ok) {
    redirect("/sources?github=taken")
  }

  redirect(login ? "/sources?github=connected" : "/sources?github=needs-login")
}
