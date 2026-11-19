import { Suspense } from "react"

import { Markdown } from "@/components/ui/markdown"
import { Text } from "@/components/kit"
import { COMPANY } from "@/lib/company"
import { constructMetadata } from "@/lib/metadata"
import { readDeletionReceipt } from "@/lib/meta-signed-request"

/**
 * How to delete a Quincy account, and the status page Meta's data-deletion
 * callback points at.
 *
 * The instructions are static. The confirmation code, when the URL has one,
 * is checked inside Suspense because this app runs with `cacheComponents`
 * and `searchParams` is a per-request read. The secret used to check the
 * code stays on the server. A code we did not sign renders as unrecognized,
 * which is also the answer when the secret is unset.
 */

export const metadata = constructMetadata({
  title: "Data deletion",
  description:
    "How to delete your Quincy account, disconnect Instagram, or check a deletion request from Meta.",
  canonicalUrl: "/data-deletion",
})

const LAST_REVISED = "19 November 2026"

const PAGE = `# Data deletion

*Last revised: ${LAST_REVISED}*

You can disconnect Instagram without closing your Quincy account, and you
can ask us to delete the account and the personal data that goes with it.
**${COMPANY.name}** is the data controller. The details of what we hold are
in the [Privacy Policy](/privacy).

## 1. Delete your Quincy account

There is no self-serve delete button yet. In the product, the control is
present and switched off: **Settings → Account → Delete the account**. The
working path next to it is **Write to us**.

Email **${COMPANY.email}** from the address on the account, with the subject
**Delete my account**. We may ask you to confirm it is you.

We delete the account and the data tied to it: your profile, brain, drafts,
conversations, sources, channel connections (X, LinkedIn, Instagram) and
their tokens, and the other personal data described in the Privacy Policy.
We do this within **30 days**. It is usually sooner. The settings page says
the same thing: deletion is done by hand, usually the same day. Backups
roll off on their own schedule. We keep something longer only where the law
requires it, for example a record that a payment happened.

## 2. Disconnect Instagram in Quincy

Sign in, open **Connectors**, then **Instagram** (\`/connectors/instagram\`).
Open **Manage connection** and hold **Disconnect Instagram** until it
confirms.

That deletes the stored Instagram connection immediately, including the
encrypted access token, the Instagram account id, the username, the name,
the profile picture URL, and the Facebook user id we stored for the
deletion callback. It does not delete your drafts or the rest of the
account. You can connect again later.

## 3. Remove Quincy on Facebook and Instagram

Removing the app at Meta stops Quincy calling Instagram on your behalf, and
is what causes Meta to notify us.

- **Facebook:** Settings and activity, then **Apps and websites**, then
  remove Quincy. You can also request deletion of the data the app holds
  from that same place.
- **Instagram:** Settings and activity, then **Apps and websites**, then
  remove Quincy.
- **Meta Business settings:** if you granted access from a business
  portfolio, remove the app under [Apps in business settings](https://business.facebook.com/latest/settings/apps).

When Meta sends us that request, we handle it as section 4 describes. You
do not have to do both, but disconnecting in Quincy is immediate and does
not depend on Meta's callback arriving.

## 4. What a request from Meta deletes

Meta sends a signed request that names the Facebook app-scoped user id of
the person who asked. We delete the Instagram connection stored for that
id, and the insight readings (views, reach, likes, comments, shares, saves)
we saved for posts Quincy published from that account.

We do not delete the Quincy account, your drafts, or a connected X or
LinkedIn account as part of that request. Use section 1 for the whole
account.

If you connected Instagram before we started storing the Facebook user id,
the callback cannot match the row. Disconnect in Quincy (section 2) or
email us (section 1) and we will remove it. Reconnecting stores the id, so
a later request from Meta can find it.

The callback answers Meta with a link back to this page and a confirmation
code. When the link includes a code, the status is shown above these
instructions.

## 5. Ask by email

If you cannot sign in, or you would rather not use the product to ask,
email **${COMPANY.email}**. Say whether you want the Instagram connection
removed, the whole account deleted, or a copy of your data. We respond
within one month, and we may need to verify who you are first.

## 6. Contact

**${COMPANY.name}**
${COMPANY.email}
`

type Status =
  { kind: "completed"; at: Date; removed: number } | { kind: "unknown" }

function statusFor(code: string): Status {
  const receipt = readDeletionReceipt(code, process.env.META_APP_SECRET ?? "")
  if (!receipt) return { kind: "unknown" }
  return { kind: "completed", at: receipt.at, removed: receipt.removed }
}

function oneCode(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  const trimmed = raw?.trim()
  return trimmed ? trimmed : null
}

function formatWhen(at: Date): string {
  return at.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

function StatusBlock({ status, code }: { status: Status; code: string }) {
  const codeLine = (
    <Text tone="muted" as="p">
      <span className="break-all">Confirmation code {code}</span>
    </Text>
  )

  switch (status.kind) {
    case "completed": {
      const when = formatWhen(status.at)
      const sentence =
        status.removed > 0
          ? `Completed on ${when}. The Instagram connection for that Meta account was removed, including the stored tokens and the insight readings we had saved.`
          : `Completed on ${when}. No Instagram connection was stored for that Meta account, so there was nothing to remove.`
      return (
        <div className="flex flex-col gap-kit-related">
          <Text weight="strong" as="p">
            {sentence}
          </Text>
          {codeLine}
        </div>
      )
    }
    case "unknown":
      return (
        <div className="flex flex-col gap-kit-related">
          <Text weight="strong" as="p">
            This confirmation code is not one we issued.
          </Text>
          {codeLine}
        </div>
      )
    default: {
      const unreachable: never = status
      return unreachable
    }
  }
}

async function DeletionStatus({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>
}) {
  const code = oneCode((await searchParams).code)
  if (!code) return null
  return <StatusBlock status={statusFor(code)} code={code} />
}

export default function DataDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-kit-group px-6 pt-4 pb-20">
      <Suspense fallback={null}>
        <DeletionStatus searchParams={searchParams} />
      </Suspense>
      <Markdown preset="kit-page">{PAGE}</Markdown>
    </div>
  )
}
