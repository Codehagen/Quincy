/**
 * Writes the app's icons from the mascot engine, so the favicon and the home
 * screen icon are the same bitmap the app draws (components/mascot/engine.ts).
 *
 *   npx tsx scripts/mascot-icons.ts
 *
 * - app/icon.svg        — the 16-grid friend, crispEdges, ink that follows
 *                         the tab's colour scheme. A test fails if it drifts.
 * - app/apple-icon.png  — 180×180, opaque paper ground (iOS paints a
 *                         transparent icon black), 10px per grid pixel with
 *                         a 10px margin, so every pixel edge is whole.
 *
 * A file, not an ImageResponse route: the icon only changes when the bitmap
 * does, and a static PNG costs no function and no font. No dependency: the
 * PNG is an indexed-colour image deflated with node's zlib.
 */
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { deflateSync } from "node:zlib"

import { GRID, HEX, MARK, iconSvg } from "../components/mascot/engine"

const ROOT = join(import.meta.dirname, "..")

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf: Buffer) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, "ascii"), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function hex(h: string) {
  const n = Number.parseInt(h.slice(1), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

/** An 8-bit indexed PNG. `pixels[y * size + x]` is a palette index. */
function png(size: number, palette: string[], pixels: Uint8Array) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 3 // indexed colour
  const raw = Buffer.alloc((size + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size + 1)] = 0 // filter: none
    for (let x = 0; x < size; x++) raw[y * (size + 1) + 1 + x] = pixels[y * size + x]
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("PLTE", Buffer.from(palette.flatMap(hex))),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

function appleIcon() {
  const size = 180
  const cell = 10
  const margin = (size - GRID * cell) / 2
  const index: Record<string, number> = { ".": 0, "#": 1, y: 2, k: 1 }
  const pixels = new Uint8Array(size * size)
  for (let y = 0; y < GRID * cell; y++) {
    for (let x = 0; x < GRID * cell; x++) {
      const c = MARK[Math.floor(y / cell)][Math.floor(x / cell)]
      pixels[(y + margin) * size + x + margin] = index[c] ?? 0
    }
  }
  return png(size, [HEX.paper, HEX.ink, HEX.sash], pixels)
}

writeFileSync(join(ROOT, "app/icon.svg"), iconSvg())
writeFileSync(join(ROOT, "app/apple-icon.png"), appleIcon())
console.log("wrote app/icon.svg and app/apple-icon.png")
