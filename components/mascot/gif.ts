/**
 * A GIF89a encoder for the friend's frames, without a dependency.
 *
 * The friend has at most four colours (background, ink, sash, keep-ink), so
 * one global palette of four entries covers every frame and the LZW code
 * stream starts at the minimum code size, 2. Framework-free and pure, like
 * the engine: bytes in, bytes out.
 */

export type GifFrame = {
  /** Palette indices, row-major, `width × height`. */
  readonly indices: Uint8Array
  /** How long the frame shows, in ms. GIF counts in hundredths. */
  readonly delay: number
}

export type GifOptions = {
  width: number
  height: number
  /** Four `#rrggbb` colours, indices 0–3. */
  palette: readonly [string, string, string, string]
  /** Index 0 is transparent (default true). */
  transparent?: boolean
  /** `true` loops for ever; `false` plays once and stops on its last frame. */
  loop: boolean
}

const MIN_CODE_SIZE = 2

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

/** LZW, variable code width, clear code at 4096, as the spec reads it. */
export function lzw(indices: Uint8Array, minCodeSize = MIN_CODE_SIZE): Uint8Array {
  const clear = 1 << minCodeSize
  const eoi = clear + 1
  const out: number[] = []
  let size = minCodeSize + 1
  let next = eoi + 1
  let cur = 0
  let shift = 0
  const emit = (code: number) => {
    cur |= code << shift
    shift += size
    while (shift >= 8) {
      out.push(cur & 0xff)
      cur >>>= 8
      shift -= 8
    }
  }
  let table = new Map<number, number>()
  emit(clear)
  if (indices.length === 0) {
    emit(eoi)
    if (shift > 0) out.push(cur & 0xff)
    return Uint8Array.from(out)
  }
  let prefix = indices[0]
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i]
    const key = (prefix << 8) | k
    const code = table.get(key)
    if (code !== undefined) {
      prefix = code
      continue
    }
    emit(prefix)
    if (next === 4096) {
      emit(clear)
      next = eoi + 1
      size = minCodeSize + 1
      table = new Map()
    } else {
      if (next >= 1 << size) size++
      table.set(key, next++)
    }
    prefix = k
  }
  emit(prefix)
  emit(eoi)
  if (shift > 0) out.push(cur & 0xff)
  return Uint8Array.from(out)
}

export function encodeGif(frames: readonly GifFrame[], opts: GifOptions): Uint8Array {
  const { width, height, palette, loop, transparent = true } = opts
  const b: number[] = []
  const u16 = (n: number) => b.push(n & 0xff, (n >> 8) & 0xff)
  const ascii = (s: string) => {
    for (let i = 0; i < s.length; i++) b.push(s.charCodeAt(i))
  }

  ascii("GIF89a")
  u16(width)
  u16(height)
  // Global colour table, 2^(1+1) = 4 entries, 2 bits of colour resolution.
  b.push(0x80 | (1 << 4) | 1, 0, 0)
  for (const c of palette) b.push(...rgb(c))

  if (loop) {
    // NETSCAPE2.0: loop count 0, for ever.
    b.push(0x21, 0xff, 0x0b)
    ascii("NETSCAPE2.0")
    b.push(0x03, 0x01, 0x00, 0x00, 0x00)
  }

  for (const fr of frames) {
    // Graphic control: dispose to background (2), so a transparent pixel in
    // this frame clears what the last frame drew there.
    b.push(0x21, 0xf9, 0x04, (2 << 2) | (transparent ? 1 : 0))
    u16(Math.max(2, Math.round(fr.delay / 10)))
    b.push(0, 0x00)
    // Image descriptor: the whole canvas, no local table, not interlaced.
    b.push(0x2c)
    u16(0)
    u16(0)
    u16(width)
    u16(height)
    b.push(0)
    b.push(MIN_CODE_SIZE)
    const data = lzw(fr.indices)
    for (let i = 0; i < data.length; i += 255) {
      const chunk = data.subarray(i, i + 255)
      b.push(chunk.length, ...chunk)
    }
    b.push(0)
  }
  b.push(0x3b)
  return Uint8Array.from(b)
}
