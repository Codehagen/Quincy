/**
 * Quincy as a character: a soft ink blob with two dot eyes, after a
 * reference's friendly bot mascots. Ink and ground only, so it carries
 * warmth without spending the piece's one accent. Decorative: it always
 * sits beside the word "Quincy".
 */
export function Blob({ size = 28 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 32 32" className="shrink-0">
      <path
        d="M16 2.5c6.6 0 12.5 4.3 12.9 11.4.4 7.6-4.6 14.6-12.6 15.6C8.6 30.4 3 25.3 3.1 17.6 3.2 9 9 2.5 16 2.5Z"
        fill="var(--kit-ink)"
      />
      <circle cx="12.2" cy="15" r="1.9" fill="var(--kit-ground)" />
      <circle cx="20.2" cy="15" r="1.9" fill="var(--kit-ground)" />
    </svg>
  )
}
