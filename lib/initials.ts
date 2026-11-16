/**
 * Two characters at most, from the name or else the address, for an Avatar.
 * "Christer Hagen" → "CH", "ada@example.com" → "AE".
 */
export function initialsOf(user: { name?: string | null; email: string }): string {
  return (user.name?.trim() || user.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}
