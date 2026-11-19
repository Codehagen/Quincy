import { Markdown } from "@/components/ui/markdown"
import { COMPANY, COMPANY_ADDRESS } from "@/lib/company"
import { constructMetadata } from "@/lib/metadata"

/**
 * The privacy policy.
 *
 * Prose, so it goes through `Markdown` and the typeset system rather than the
 * role scale — see AGENTS.md on the two type systems, and note that no `text-*`
 * utility may appear inside a typeset container.
 *
 * **Every claim here is checked against the code, and that is the property to
 * preserve.** A privacy policy that overstates what an app collects is a lie
 * that costs trust; one that understates it is a lie that costs more than that.
 * The connected-accounts section in particular says only what the granted
 * scopes actually permit. Quincy cannot read anyone's LinkedIn posts or
 * engagement, because `r_member_social` and `r_member_postAnalytics` are not in
 * the scope list (lib/channels.ts). Instagram's grants are
 * `INSTAGRAM_CONFIG_PERMISSIONS` in lib/instagram.ts: the code does not send
 * a scope list, the Facebook Login for Business configuration does. If either
 * list changes, this page changes in the same commit.
 *
 * The company facts — entity, organisation number, address, contact address,
 * retention window — are stated outright rather than left as placeholders,
 * because this page is linked publicly and was submitted to LinkedIn as the
 * privacy policy for the Member Data Portability application.
 *
 * NOT LEGAL ADVICE. This is a competent, accurate starting draft grounded in
 * what the software does. It has not been reviewed by a lawyer, and it should
 * be before anyone relies on it.
 */

export const metadata = constructMetadata({
  title: "Privacy Policy",
  description:
    "What Quincy collects, why, who it is shared with, and the rights you have over it.",
  canonicalUrl: "/privacy",
})

const LAST_REVISED = "19 November 2026"

const POLICY = `# Privacy Policy

*Last revised: ${LAST_REVISED}*

Quincy drafts social posts in your voice. You give it raw material, it writes,
and — once you connect an account and approve a draft — it publishes on your
behalf.

This policy explains what personal data Quincy collects, why, who it is shared
with, and what you can ask us to do about it. It covers the Quincy website and
application (the "Service"), operated by **${COMPANY.name}**, a company registered
in Norway with organisation number **${COMPANY.org}**, business address
**${COMPANY_ADDRESS}** ("Quincy", "we", "us"). We are the
data controller for the personal data described here.

Questions, or a request about your data: **${COMPANY.email}**.

## 1. What we collect

### Your account

When you sign up we collect your **name**, **email address**, and either a
**password** (stored only as a salted hash — we never see or store the password
itself) or, if you sign in with Google, the **name, email address and profile
picture** Google returns. We also store your **time zone**, so that a post
scheduled for 08:00 goes out at 08:00 where you are.

### What you tell Quincy

The Service exists to learn how you write, so most of what it holds is what you
give it deliberately:

- **Your conversations with the agent** — every message you send and every reply
  it produces.
- **Your brain**: what Quincy knows about your identity, voice, writing rules,
  channel strategy, and the stories you draw on. Some of this you write; some
  Quincy infers from your conversations and you can correct or delete.
- **Your drafts, ideas, schedule, and sources** — the material and the work in
  progress.

### Connected accounts

You do not have to connect anything to use Quincy. If you choose to connect a
channel so that Quincy can publish for you, section 4 sets out exactly what
that grants, per platform.

### Technical data

Our hosting provider records standard server logs — IP address, user agent,
request path and time — as a normal part of serving and securing the site. We
record whether the emails we send you were delivered, bounced, or were marked
as spam, because a young sending domain that ignores bounces stops being able
to deliver mail at all.

**We do not run advertising trackers or third-party analytics on the Service,
and we do not sell personal data or share it for behavioural advertising.**

## 2. Why we use it, and on what basis

| What for | Legal basis |
| --- | --- |
| Running your account, drafting, scheduling and publishing | Performance of our contract with you |
| Keeping the Service secure, preventing abuse, fixing faults | Our legitimate interests |
| Sending service email — verification, password reset, a reminder that a channel connection is about to expire | Performance of our contract |
| Improving the Service using aggregated or anonymised data | Our legitimate interests |
| Meeting legal obligations, and establishing or defending legal claims | Legal obligation / legitimate interests |
| Marketing email, if we ever send it | Your consent, withdrawable at any time |

## 3. AI processing

Quincy drafts using large language models. When you chat with the agent, or ask
it to write, the relevant content — your message, the parts of your brain that
inform the answer, and the draft being worked on — is sent to our model
provider to generate a response.

- Model requests are routed through **Vercel AI Gateway** to **Anthropic**
  (Claude).
- Your content is used to produce **your** output. **It is not used to train
  general-purpose AI models.**
- We do not read your prompts or outputs as a matter of course. We would only
  look at specific content where it is necessary to investigate abuse, protect
  someone's safety, or comply with the law.

## 4. Connected accounts: exactly what Quincy can do

This section is deliberately specific. Connecting a channel hands Quincy the
ability to speak in your name, and you should be able to see the edges of that
permission before you grant it.

**Nothing is ever published without your approval.** Quincy drafts; you approve;
the approved text goes out at the time you set.

### LinkedIn

Connecting LinkedIn grants the scopes \`openid\`, \`profile\`, \`email\` and
\`w_member_social\`. In practice that means:

- **We receive** your LinkedIn member ID, name, profile picture, and email
  address.
- **We can** publish posts to your LinkedIn feed on your behalf.
- **We cannot** read your LinkedIn posts, your drafts, your comments, your
  engagement figures, your connections, or your feed. LinkedIn gates that
  behind permissions Quincy has not been granted, so the capability does not
  exist for us — not merely as a matter of policy, but of access.

LinkedIn access tokens expire after 60 days and cannot be renewed silently, so
Quincy will ask you to reconnect before then. You can revoke Quincy's access at
any time from LinkedIn: **Me → Settings & Privacy → Data Privacy → Permitted
Services**. Disconnecting inside Quincy deletes the stored tokens outright.

### X

Connecting X grants the scopes \`tweet.read\`, \`tweet.write\`, \`users.read\`,
\`bookmark.read\` and \`offline.access\`. In practice:

- **We receive** your X account ID, name, handle, and profile picture.
- **We can** publish posts on your behalf. \`offline.access\` lets us refresh
  the connection without sending you back through the consent screen every two
  hours.
- \`tweet.read\` and \`users.read\` let us confirm which account you connected,
  read your own posts when you import them, and read back posts Quincy itself
  published, so it can report how they performed.
- \`bookmark.read\` lets us read posts you have bookmarked, when you import
  them. Those are stored as other people's writing and are not used to learn
  your voice.
- We do not read other people's timelines.

You can revoke access at any time from X under **Settings → Security and
account access → Apps and sessions → Connected apps**, or by disconnecting
inside Quincy.

### Instagram

Connecting Instagram uses **Facebook Login for Business**. The login
configuration grants \`instagram_basic\`, \`instagram_content_publish\` and
\`instagram_manage_insights\`. Quincy does not send that list itself. The
Meta app configuration is the list. In practice:

- **We receive** the Instagram professional account you select in the Meta
  dialog: its account id, username, name, and profile picture. We also store
  the Facebook app-scoped user id of the person who signed in, which is the
  id Meta sends if you later ask Facebook to delete this data.
- **We can** publish a post you have approved (an image of the draft, plus
  the caption) to that account, and read insights for posts Quincy published:
  views, reach, likes, comments, shares, and saves.
- **We do not** read your Instagram inbox, your stories, or a feed of other
  people's posts. We do not sell this data.

You can disconnect inside Quincy at **Connectors → Instagram → Manage
connection**, which deletes the stored tokens. You can also remove Quincy
under **Settings and activity → Apps and websites** on Facebook and on
Instagram. How to do each of those, and what a request from Meta deletes,
is on the [data deletion](/data-deletion) page.

### How the credentials are held

Access and refresh tokens, including Instagram tokens, are **encrypted at
rest** in our database (the same encryption used for sign-in tokens). They
are decrypted only on the server, when Quincy calls the platform. They are
never sent to your browser and never exposed to the model. Disconnecting a
channel deletes the row that holds them, and, where the platform provides an
endpoint for it, tells the platform to revoke the token as well. For
Instagram that revoke is best-effort: if Meta does not accept it, the local
row is still deleted.

## 5. Who we share it with

We do not sell your personal data. We share it with service providers who
process it on our instructions, under contract, to run the Service:

| Provider | What for | Where |
| --- | --- | --- |
| Vercel | Application hosting, AI Gateway | EU / US |
| Neon | Database | US (AWS us-east-1) |
| Anthropic | Language model, via Vercel AI Gateway | US |
| Resend | Transactional email | US |
| Google | Sign-in, only if you use it | US |
| Stripe | A customer record when you sign up, and the payment if you subscribe. We store the subscription status, not the card number | US |
| X, LinkedIn | Publishing, and the reads described in section 4, only for channels you connect | US |
| Meta | Instagram profile, publishing, and insights, only if you connect Instagram | US |
| Cloudflare R2 | Media files you upload in the editor | Cloudflare |

We may also disclose personal data where we are legally required to, to
establish or defend legal claims, or to a successor entity as part of a
merger, acquisition, or sale of assets — in which case we will tell you before
your data becomes subject to a different policy.

## 6. How long we keep it

We keep your account and content for as long as your account exists. Delete
your account and we delete the associated data — your brain, drafts,
conversations, and channel connections — within **30 days**, except where we
must retain something longer to meet a legal obligation. Backups roll off on
their own schedule.

Disconnecting a channel deletes its stored credentials immediately, without
waiting for account deletion. A data-deletion request from Meta does the
same for Instagram, and also deletes the insight readings we stored from
that connection. It does not delete the rest of your Quincy account. The
steps are on the [data deletion](/data-deletion) page.

## 7. Your rights

Under the GDPR you can ask us to:

- give you a **copy** of the personal data we hold about you
- **correct** anything inaccurate or incomplete
- **delete** your personal data
- **restrict** or **object to** how we use it
- **port** it to another provider in a machine-readable format
- **withdraw consent** where our use rests on consent, without affecting what
  came before

Write to **${COMPANY.email}** and we will respond within one month. To ask
for deletion you can also follow the [data deletion](/data-deletion) page. We
may need to verify who you are first. If you are unhappy with how we have
handled your data you can complain to your local supervisory authority — in
Norway, **Datatilsynet** (datatilsynet.no).

## 8. Security

Passwords are hashed, never stored in a readable form. Channel tokens are
encrypted at rest. Sessions are carried in secure, HTTP-only cookies, and
authentication endpoints are rate limited. Access to production data is limited
to those who need it.

No system is perfectly secure, and we will not claim otherwise. If a breach
affects your personal data and is likely to present a risk to you, we will tell
you and the supervisory authority as the law requires.

## 9. Children

Quincy is not intended for anyone under 16 and we do not knowingly collect
their personal data. If you believe a child has given us personal data, write
to us and we will delete it.

## 10. International transfers

Some of our providers are in the United States. Where personal data leaves the
EEA, we rely on the European Commission's adequacy decision for the relevant
country or on Standard Contractual Clauses, together with the safeguards those
require.

## 11. Changes

We may update this policy. When we do, we will change the date at the top, and
if the change materially affects you we will tell you directly rather than
relying on you to notice.

## 12. Contact

**${COMPANY.name}**
${COMPANY_ADDRESS}
${COMPANY.email}
`

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 pt-4 pb-20">
      <Markdown preset="kit-page">{POLICY}</Markdown>
    </div>
  )
}
