#!/usr/bin/env bash
# The fixture take for /prototypes/cuts-mock (plans/036, phase F).
#
# A 37 s talking head made from shapes: a warm studio backdrop with slow
# out-of-focus lights, a softly lit presenter who moves a little while the
# words play and holds still in the pauses, and a lower-third name card from
# 2 s to 6 s. Every layer is drawn here, so the file is reproducible and
# holds nobody's face.
#
# The voice track is sound exactly where the transcript fixture has a word
# and real silence everywhere else, so the pauses the editor reads from the
# words are pauses the waveform draws. Also writes the filmstrip sheet and
# the seek index (peaks + keyframes) in the shapes ingest produces
# (lib/editor/media.ts: planFilmstrip, filmstripArgs, peaksFromPcm at 20 ms).
#
#   bash scripts/make-cuts-mock-take.sh
#
# Needs ffmpeg (with drawtext) and node. Rerun after editing the word fixture.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORDS="$ROOT/app/prototypes/cuts-mock/take-words.json"
OUT="$ROOT/public/prototypes/cuts-mock"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

DURATION=37
FPS=24
W=768
H=432
GOP=48 # a keyframe every 2 s
mkdir -p "$OUT"

FONT=""
for f in /System/Library/Fonts/HelveticaNeue.ttc /System/Library/Fonts/Helvetica.ttc \
  /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf /usr/share/fonts/dejavu/DejaVuSans.ttf; do
  if [ -f "$f" ]; then FONT="$f"; break; fi
done
if [ -z "$FONT" ]; then echo "No font found for the name card" >&2; exit 1; fi

# 1. The voice: a soft, band-limited hum per word, pitch gliding inside the
#    word and moving word to word, silent between words.
node --input-type=module - "$WORDS" "$TMP/voice.wav" "$DURATION" <<'EOF'
import { readFileSync, writeFileSync } from "node:fs"
const [words, out, seconds] = process.argv.slice(2)
const list = JSON.parse(readFileSync(words, "utf8"))
const rate = 16000
const pcm = new Int16Array(Math.round(Number(seconds) * rate))
list.forEach((w, i) => {
  const from = Math.round(w.start * rate)
  const to = Math.round(w.end * rate)
  const len = (to - from) / rate
  const f0 = 165 + ((i * 37) % 60)
  const loud = 0.4 + ((i * 53) % 35) / 100
  let phase = 0
  for (let n = from; n < to && n < pcm.length; n++) {
    const t = (n - from) / rate
    const env = Math.sin(Math.PI * Math.min(1, t / 0.04, (len - t) / 0.06) / 2) ** 2
    const f = f0 * (1.04 - 0.1 * (t / len))
    phase += (2 * Math.PI * f) / rate
    const syllable = 0.7 + 0.3 * Math.sin(2 * Math.PI * 4.2 * t + i)
    const s = Math.sin(phase) + 0.22 * Math.sin(2 * phase) + 0.06 * Math.sin(3 * phase)
    pcm[n] = Math.round((s / 1.28) * env * syllable * loud * 32767)
  }
})
const head = Buffer.alloc(44)
head.write("RIFF", 0); head.writeUInt32LE(36 + pcm.byteLength, 4); head.write("WAVE", 8)
head.write("fmt ", 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22)
head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34)
head.write("data", 36); head.writeUInt32LE(pcm.byteLength, 40)
writeFileSync(out, Buffer.concat([head, Buffer.from(pcm.buffer)]))
EOF

# 2. The layers, drawn as raw RGBA stills, and the motion as ffmpeg
#    expressions: the presenter sways only inside spoken phrases.
node --input-type=module - "$WORDS" "$TMP" "$W" "$H" <<'EOF'
import { readFileSync, writeFileSync } from "node:fs"
const [words, dir, Ws, Hs] = process.argv.slice(2)
const W = Number(Ws), H = Number(Hs)
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t) }
const mix = (a, b, t) => a + (b - a) * t
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]

function layer(w, h) { return { w, h, px: new Float32Array(w * h * 4) } }
// Paint colour c with coverage a over what is there (straight alpha).
function over(L, x, y, c, a) {
  if (a <= 0) return
  const i = (y * L.w + x) * 4, p = L.px
  const oa = p[i + 3], na = a + oa * (1 - a)
  for (let k = 0; k < 3; k++) p[i + k] = na ? (c[k] * a + p[i + k] * oa * (1 - a)) / na : 0
  p[i + 3] = na
}
function save(L, name, opaque = false) {
  const b = Buffer.alloc(L.w * L.h * 4)
  for (let i = 0; i < L.px.length; i++) b[i] = Math.round(clamp(L.px[i] / ((i & 3) === 3 ? 1 : 255)) * 255)
  if (opaque) for (let i = 3; i < b.length; i += 4) b[i] = 255
  writeFileSync(`${dir}/${name}.rgba`, b)
}
// Deterministic noise, so a rerun draws the same picture.
let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

// The backdrop: a warm eased radial glow behind the presenter, a vignette.
const bg = layer(W, H)
const glow = [164, 124, 96], mid = [104, 74, 58], edge = [34, 24, 22]
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const dx = (x - W * 0.5) / W, dy = (y - H * 0.42) / H
  const d = Math.sqrt(dx * dx * 1.2 + dy * dy * 1.9)
  let c = mix3(glow, mid, smooth(0, 0.42, d))
  c = mix3(c, edge, smooth(0.3, 0.85, d))
  const dither = (rnd() - 0.5) * 2.2
  over(bg, x, y, c.map((v) => v + dither), 1)
}
save(bg, "bg", true)

// Out-of-focus lights: two wide strips that drift at different speeds.
function bokeh(name, w, count, rMin, rMax, alpha) {
  const L = layer(w, H)
  for (let n = 0; n < count; n++) {
    const cx = rnd() * w, cy = H * (0.08 + rnd() * 0.55), r = rMin + rnd() * (rMax - rMin)
    const warm = rnd()
    const c = mix3([255, 214, 160], [255, 176, 120], warm)
    const a = alpha * (0.5 + rnd() * 0.5)
    for (let y = Math.max(0, Math.floor(cy - r - 3)); y < Math.min(H, cy + r + 3); y++)
      for (let x = Math.max(0, Math.floor(cx - r - 3)); x < Math.min(w, cx + r + 3); x++) {
        const d = Math.hypot(x - cx, y - cy)
        const disc = 1 - smooth(r - 2.5, r + 1.5, d)
        const rim = 0.7 + 0.3 * smooth(r * 0.55, r, d)
        over(L, x, y, c, a * disc * rim)
      }
  }
  save(L, name)
}
bokeh("bokeh-far", 1000, 16, 10, 22, 0.16)
bokeh("bokeh-near", 1100, 9, 26, 44, 0.12)

// The presenter. Key light from the left, a warm rim on the right edge.
const skin = [178, 132, 108], skinShade = [96, 64, 54]
const hair = [46, 32, 28], hairLit = [92, 64, 50]
const knit = [58, 72, 80], knitShade = [26, 32, 38]
const CX = W / 2

// Body: shoulders and neck. Drawn under the head.
const body = layer(W, H)
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const dx = x - CX
  // Neck
  const nw = 35 - 3 * smooth(270, 310, y)
  const neckA = (1 - smooth(nw - 1.5, nw + 1.5, Math.abs(dx))) * smooth(250, 254, y)
  if (neckA > 0) {
    const lit = clamp(0.55 - dx / 70 - smooth(285, 320, y) * 0.35)
    over(body, x, y, mix3(skinShade, skin, lit * 0.8), neckA)
  }
  // Shoulders: a squared ellipse from under the jaw to past the frame edge.
  const sx = Math.abs(dx) / 300, sy = Math.abs(y - (H + 92)) / 220
  const v = Math.pow(sx, 3.2) + Math.pow(sy, 2.0)
  const shA = 1 - smooth(0.985, 1.015, v)
  if (shA > 0) {
    const lit = clamp(0.62 - dx / 330 - (y - 300) / 420)
    let c = mix3(knitShade, knit, lit)
    const rim = smooth(0.9, 1.0, v) * smooth(60, 260, dx)
    c = mix3(c, [210, 150, 110], rim * 0.55)
    // A collar: the neckline sits a little darker.
    const collar = 1 - smooth(0, 16, Math.hypot(dx * 0.7, y - 304) - 34)
    c = mix3(c, knitShade, collar * 0.5)
    over(body, x, y, c, shA)
  }
}
save(body, "body")

// Head: hair behind, face, a fringe across the top.
const head = layer(W, H)
const HX = CX, HY = 202, RX = 64, RY = 82
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const dx = x - HX, dy = y - HY
  const back = Math.hypot(dx / (RX + 10), (dy + 8) / (RY + 8))
  const backA = (1 - smooth(0.98, 1.02, back)) * (1 - smooth(HY + 30, HY + 70, y))
  if (backA > 0) over(head, x, y, mix3(hair, hairLit, clamp(0.5 - dx / 120 - dy / 200)), backA)
  const f = Math.hypot(dx / RX, dy / RY)
  const faceA = 1 - smooth(0.975, 1.02, f)
  if (faceA > 0) {
    const lit = clamp(0.78 - dx / 95 - Math.max(0, dy) / 260)
    let c = mix3(skinShade, skin, lit)
    c = mix3(c, [236, 170, 130], smooth(0.86, 1.0, f) * smooth(25, 60, dx) * 0.6)
    // Soft hollows where the eyes and the mouth would catch shadow.
    const eyes = Math.max(0, 1 - Math.hypot((Math.abs(dx) - 22) / 13, (dy + 8) / 6))
    const mouth = Math.max(0, 1 - Math.hypot(dx / 18, (dy - 38) / 4))
    c = mix3(c, skinShade, eyes * 0.35 + mouth * 0.22)
    over(head, x, y, c, faceA)
  }
  const fringe = HY - RY * 0.42 + 14 * Math.pow(dx / RX, 2) + 6 * Math.sin(dx / 14)
  const capA = faceA * (1 - smooth(fringe - 1.5, fringe + 1.5, y))
  if (capA > 0) over(head, x, y, mix3(hair, hairLit, clamp(0.55 - dx / 110 - (dy + RY) / 160)), capA)
}
save(head, "head")

// The name card: a dark glass plate with a warm accent bar; text added by ffmpeg.
const cw = 232, ch = 58, card = layer(cw, ch)
for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
  const r = 10, qx = Math.max(Math.abs(x + 0.5 - cw / 2) - (cw / 2 - r), 0), qy = Math.max(Math.abs(y + 0.5 - ch / 2) - (ch / 2 - r), 0)
  const a = 1 - smooth(r - 1, r + 0.5, Math.hypot(qx, qy))
  over(card, x, y, [24, 18, 16], a * 0.62)
  if (x >= 12 && x < 15 && y >= 13 && y < ch - 13) over(card, x, y, [232, 170, 112], a)
}
save(card, "card")

// Motion: each spoken phrase (words closer than 0.35 s) eases in and out.
const list = JSON.parse(readFileSync(words, "utf8"))
const phrases = []
for (const w of list) {
  const last = phrases.at(-1)
  if (last && w.start - last[1] < 0.35) last[1] = w.end
  else phrases.push([w.start, w.end])
}
const env = phrases.map(([a, b]) => `clip(min(t-${a.toFixed(3)},${b.toFixed(3)}-t)/0.3,0,1)`).join("+")
writeFileSync(`${dir}/env.txt`, `(${env})`)
EOF

ENV="$(cat "$TMP/env.txt")"
HEAD_X="(${ENV})*(3*sin(2*PI*t*0.37)+1.5*sin(2*PI*t*1.1))"
HEAD_Y="(${ENV})*(2.5*sin(2*PI*t*1.7)+1.2*sin(2*PI*t*2.9))"
BODY_X="(${ENV})*1.2*sin(2*PI*t*0.37+0.4)"
BODY_Y="(${ENV})*1.0*sin(2*PI*t*0.9)"

# 3. The take: compose the layers, 432p, faststart.
RAW="-f rawvideo -pix_fmt rgba"
ffmpeg -hide_banner -loglevel error -y \
  $RAW -s "${W}x${H}" -framerate "$FPS" -stream_loop -1 -t "$DURATION" -i "$TMP/bg.rgba" \
  $RAW -s "1000x${H}" -framerate "$FPS" -stream_loop -1 -t "$DURATION" -i "$TMP/bokeh-far.rgba" \
  $RAW -s "1100x${H}" -framerate "$FPS" -stream_loop -1 -t "$DURATION" -i "$TMP/bokeh-near.rgba" \
  $RAW -s "${W}x${H}" -framerate "$FPS" -stream_loop -1 -t "$DURATION" -i "$TMP/body.rgba" \
  $RAW -s "${W}x${H}" -framerate "$FPS" -stream_loop -1 -t "$DURATION" -i "$TMP/head.rgba" \
  $RAW -s "232x58" -framerate "$FPS" -stream_loop -1 -t "$DURATION" -i "$TMP/card.rgba" \
  -i "$TMP/voice.wav" \
  -filter_complex "
    [1]gblur=sigma=2.5[far];
    [2]gblur=sigma=4[near];
    [0][far]overlay=x='-110+70*sin(2*PI*t/46)':y='4*sin(2*PI*t/19)':eval=frame[b1];
    [b1][near]overlay=x='-180+120*sin(2*PI*t/37+1)':y='6*sin(2*PI*t/23)':eval=frame[b2];
    [3]gblur=sigma=0.6[body];
    [4]gblur=sigma=0.6[head];
    [b2][body]overlay=x='${BODY_X}':y='${BODY_Y}':eval=frame[b3];
    [b3][head]overlay=x='${HEAD_X}':y='${HEAD_Y}':eval=frame[b4];
    [5]format=rgba,
      drawtext=fontfile='${FONT}':text='Mia Hansen':fontsize=17:fontcolor=white@0.96:x=26:y=12,
      drawtext=fontfile='${FONT}':text='Founder':fontsize=12:fontcolor=0xF0D2B8@0.85:x=26:y=34,
      fade=t=in:st=2:d=0.45:alpha=1,fade=t=out:st=5.55:d=0.45:alpha=1[card];
    [b4][card]overlay=x=36:y=$((H - 58 - 30)):eval=frame,format=yuv420p[v]
  " \
  -map "[v]" -map 6:a \
  -c:v libx264 -preset slow -crf 27 -tune film -pix_fmt yuv420p -r "$FPS" -g "$GOP" -keyint_min "$GOP" -sc_threshold 0 \
  -c:a aac -b:a 48k -ac 1 -ar 32000 \
  -movflags +faststart -t "$DURATION" "$OUT/take.mp4"

# 4. The filmstrip: planFilmstrip(37 s) is 78 tiles of 156x88, one every 474359 us.
ffmpeg -hide_banner -loglevel error -y -i "$OUT/take.mp4" \
  -vf "fps=1000000/474359,scale=156:88:force_original_aspect_ratio=increase,crop=156:88,tile=78x1" \
  -frames:v 1 -q:v 6 "$OUT/filmstrip.jpg"

# 5. The seek index: peaks from the take's own audio, decoded back.
ffmpeg -hide_banner -loglevel error -y -i "$OUT/take.mp4" -vn -ac 1 -ar 16000 -f s16le "$TMP/back.pcm"
node --input-type=module - "$TMP/back.pcm" "$OUT/seek-index.json" "$DURATION" "$GOP" "$FPS" <<'EOF'
import { readFileSync, writeFileSync } from "node:fs"
const [pcmPath, out, seconds, gop, fps] = process.argv.slice(2)
const raw = readFileSync(pcmPath)
const pcm = new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 2))
const intervalUs = 20000
const bucket = Math.round((16000 * intervalUs) / 1e6)
const values = []
for (let i = 0; i < pcm.length; i += bucket) {
  let peak = 0
  for (let j = i; j < Math.min(pcm.length, i + bucket); j++) peak = Math.max(peak, Math.abs(pcm[j]))
  values.push(Math.round(Math.min(1, peak / 32768) * 1000) / 1000)
}
const step = Math.round((Number(gop) / Number(fps)) * 1e6)
const keyframesUs = []
for (let t = 0; t < Number(seconds) * 1e6; t += step) keyframesUs.push(t)
writeFileSync(out, JSON.stringify({ intervalUs, values, keyframesUs }))
EOF

ls -la "$OUT"
