import { Markdown } from "@/components/ui/markdown"
import { COMPANY, COMPANY_ADDRESS } from "@/lib/company"
import { constructMetadata } from "@/lib/metadata"

/**
 * Terms of Service.
 *
 * Same container as the privacy policy: prose through Markdown, kit-page
 * preset, no `text-*` utilities inside the typeset. Claims about what the
 * product does (approval before publish, the free day, the price, deletion
 * by email) are the ones the code and the privacy page already make.
 *
 * NOT LEGAL ADVICE. A starting draft for Meta App Review and for people
 * deciding whether to sign up. It has not been reviewed by a lawyer.
 */

export const metadata = constructMetadata({
  title: "Terms of Service",
  description:
    "The terms for using Quincy, operated by Codebase AS. You approve what gets published.",
  canonicalUrl: "/terms",
})

const LAST_REVISED = "19 November 2026"

const TERMS = `# Terms of Service

*Last revised: ${LAST_REVISED}*

These terms are the agreement between you and **${COMPANY.name}**, a company
registered in Norway with organisation number **${COMPANY.org}**, business
address **${COMPANY_ADDRESS}** ("Quincy", "we", "us"), for the Quincy website
and application (the "Service").

Quincy drafts social posts in your voice. You give it raw material, it
writes, and nothing is published until you approve it.

By creating an account or using the Service you agree to these terms and to
the [Privacy Policy](/privacy). If you do not agree, do not use the Service.

## 1. The Service

Quincy is a drafting and publishing tool. It learns from material you give
it, drafts in your voice, and, when you connect an account and approve a
draft, publishes that approved text on the schedule you set.

We may change, suspend, or withdraw parts of the Service. Where a change
materially reduces what you are paying for, the changes section below is
how we tell you.

## 2. Your account

You need an account to use Quincy. Signup is invite-only. You must give a
name and an email address you can verify, and either a password or a Google
sign-in. You are responsible for keeping your credentials confidential and
for activity under your account.

You must be at least 16. The Service is not for children.

Tell us if you believe someone else is using your account. Write to
**${COMPANY.email}**.

## 3. Acceptable use

You will not use the Service to:

- break the law, or help anyone else break it
- impersonate another person, or connect an account you are not allowed to use
- publish unlawful, infringing, or abusive content
- probe, disrupt, or overload the Service, or attempt to get at another
  person's data
- resell the Service or hold it out as your own product
- circumvent a limit we set, including a usage ceiling or a cooldown

We may suspend or close an account that breaks these rules. Where we can
do it without making the problem worse, we will tell you why.

## 4. Your content and connected accounts

You keep the rights to the material you submit: conversations, notes,
drafts, and anything you import. You grant us a licence to host that
material, to send the parts a draft needs to our model provider, and to
publish the specific text you approve to an account you have connected.
The licence lasts for as long as the material is on the Service, and ends
when it is deleted, except for copies that sit in backups until those
roll off.

Connecting a channel is optional. Today those channels are **X**,
**LinkedIn**, and **Instagram**. Instagram is connected with Facebook Login
for Business. What each connection lets Quincy read and publish is set out
in the [Privacy Policy](/privacy), and only to the extent of the permissions
you grant.

You confirm that you have the right to connect each account and to publish
the content you approve. You can disconnect a channel inside Quincy. That
deletes the tokens we stored for it. You can also remove Quincy's access
in the settings of X, LinkedIn, Facebook, or Instagram.

## 5. Drafts are not published until you send them

Quincy drafts with a language model. A draft can be wrong, incomplete, or
not what you would have written. **You are responsible for what you
publish**, including that it is lawful, accurate enough for your purposes,
and that you have the rights to it. Review the text before you approve it.
Approval is the act that lets it go out in your name.

We do not undertake that a draft will perform, that a platform will accept
it, or that a connected account will stay in good standing. The platforms'
own rules still apply to you.

## 6. Trial and subscription

A new account gets **one day** of full use, starting when the email address
is verified. No card is taken for that day. When it ends, Quincy stops
writing until you subscribe. Your existing work stays.

The paid plan is **$49 US dollars a month**, billed by Stripe. VAT is added
only where Stripe, as merchant of record, is configured to collect it.
A Stripe customer record is created when you sign up, so the later payment
is attached to the same customer. We do not store your card number. Stripe
does.

You can cancel from the billing settings. Cancellation stops the next
renewal. The plan continues until the end of the period you have already
paid for.

## 7. Ending

You can stop using Quincy at any time and ask us to delete the account.
How to do that, including deleting an Instagram connection, is on the
[data deletion](/data-deletion) page. There is no self-serve delete button
yet. Deletion is by email to **${COMPANY.email}**, and we delete the
account data within 30 days, as the Privacy Policy describes.

We may suspend or close an account that breaks these terms, that we are
required to close, or that has not been used and is not paid for. Where
the account is closed for non-payment, your content is not deleted by that
fact alone. Deletion is the step in the previous paragraph.

## 8. Liability

The Service is provided as it is, and as it is available. Drafts, schedules,
and publishing depend on us, on model providers, and on X, LinkedIn, and
Meta. We do not warrant that the Service will be uninterrupted or error
free.

Nothing in these terms limits liability that Norwegian law does not allow
us to limit, including liability for fraud, or for death or personal injury
caused by negligence.

Subject to that, we are not liable for loss of profit, loss of data, or
loss of goodwill, or for what you choose to publish, and our total
liability arising out of the Service in any twelve-month period is limited
to the fees you paid us for the Service in that period. If you have not
paid, that cap is zero, except where the law requires otherwise.

## 9. Changes to these terms

We may update these terms. When we do, we change the date at the top. If a
change materially affects you, we will tell you directly rather than
relying on you to notice. If you keep using the Service after the change
takes effect, the new terms apply. If you do not agree, stop using the
Service and ask us to delete the account.

## 10. Law

These terms are governed by the laws of Norway. The courts of Norway have
jurisdiction. That does not take away any mandatory right you have as a
consumer in the country where you live.

## 11. Contact

**${COMPANY.name}**
${COMPANY_ADDRESS}
${COMPANY.email}
`

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 pt-4 pb-20">
      <Markdown preset="kit-page">{TERMS}</Markdown>
    </div>
  )
}
