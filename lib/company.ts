/**
 * The legal entity behind Quincy, as the public pages state it.
 *
 * One module so the privacy policy, the terms, and the data-deletion page
 * cannot drift apart on the name, the organisation number, or the address.
 * The contact address is the same mailbox the privacy policy already
 * published and `MAIL_REPLY_TO` falls back to.
 */
export const COMPANY = {
  name: "Codebase AS",
  org: "919 415 754",
  street: "Dronningens gate 18",
  place: "8006 Bodø, Norway",
  // Public contact address, already published on the privacy policy.
  email: "christer@hirequincy.com", // pragma: allowlist secret
} as const

export const COMPANY_ADDRESS = `${COMPANY.street}, ${COMPANY.place}`
