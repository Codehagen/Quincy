/**
 * Path pieces for the soft friend (round 1, piece 20): a page with rounded
 * corners, and rectangular holes for eyes. Every edge sits on a whole unit of
 * the 16-grid; only the corner arcs are curved.
 */
export function page(x: number, y: number, w: number, h: number, r: number) {
  const x2 = x + w
  const y2 = y + h
  return [
    `M${x + r} ${y}H${x2 - r}A${r} ${r} 0 0 1 ${x2} ${y + r}`,
    `V${y2 - r}A${r} ${r} 0 0 1 ${x2 - r} ${y2}`,
    `H${x + r}A${r} ${r} 0 0 1 ${x} ${y2 - r}`,
    `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`,
  ].join("")
}

export function hole(x: number, y: number, w: number, h: number) {
  return `M${x} ${y}h${w}v${h}h${-w}Z`
}
