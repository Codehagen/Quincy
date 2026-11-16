import { NavLink } from "./nav-link"

/**
 * The privacy link lives here because this is the surface a stranger reaches,
 * LinkedIn's app reviewer included, who must find a valid policy before
 * granting Standard tier. Links in both auth states: the footer is where a
 * signed-in reader looks for terms. No company line: the name is the line.
 */
const LINKS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/changelog", label: "Changelog" },
  { href: "/why", label: "Why it works this way" },
  { href: "/privacy", label: "Privacy" },
] as const

/** The marketing footer. No props. Stacked under 40rem, a row above it. */
export function MarketingFooter() {
  return (
    <footer className="border-t border-kit-hairline">
      <div className="mx-auto flex w-full max-w-kit-marketing flex-col gap-4 px-kit-page-gutter pt-8 pb-[calc(--spacing(8)+env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between">
        <span className="font-kit-strong text-kit-ink">Quincy</span>
        {/* Rows 44px apart when they wrap (20px line + 24px gap), so the links' 44px touch areas meet and never overlap. */}
        <nav aria-label="Footer" className="flex flex-wrap gap-6">
          {LINKS.map((l) => (
            <NavLink key={l.href} href={l.href}>
              {l.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </footer>
  )
}
