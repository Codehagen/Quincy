#!/usr/bin/env bash
# A local take for /prototypes/cuts-mock: your own recording in place of the
# drawn studio take (plans/036, the owner's local take).
#
# Everything lands in public/prototypes/cuts-mock/local/, which is
# gitignored: the editing copy, the filmstrip sheet, the seek index and the
# 16 kHz audio the transcript is made from. Nothing derived from the video
# is ever committed; the mock falls back to the tracked take without it.
#
#   bash scripts/make-cuts-mock-local.sh path/to/video.mov
#   npx tsx --env-file=.env.local scripts/transcribe-cuts-mock-local.ts
#
# The second step is one Deepgram call (it spends) and writes words.json and
# manifest.json; the mock reads the take only once the manifest exists.
#
# Needs ffmpeg, ffprobe and node (npx tsx, for the repo's planFilmstrip).
set -euo pipefail

if [ $# -ne 1 ] || [ ! -f "$1" ]; then
  echo "Usage: bash scripts/make-cuts-mock-local.sh <video>" >&2
  exit 1
fi

SRC="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/prototypes/cuts-mock/local"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

SHORT=432 # the short side of the editing copy, as the tracked take's 768x432
FPS=30
GOP=$((FPS * 2)) # a keyframe every 2 s, as ingest's proxy

probe() { ffprobe -v error -select_streams v:0 -show_entries "$1" -of default=nw=1:nk=1 "$SRC" | head -n1; }
SW="$(probe stream=width)"
SH="$(probe stream=height)"
ROT="$(probe stream_side_data=rotation || true)"
DURATION="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$SRC")"

# Displayed size: a phone stores portrait as landscape plus a rotation, and
# ffmpeg applies that rotation when it decodes.
case "${ROT#-}" in 90 | 270) DW="$SH"; DH="$SW" ;; *) DW="$SW"; DH="$SH" ;; esac

# Keep the source's aspect; the short side becomes $SHORT, both sides even.
read -r W H < <(node -e '
  const [dw, dh, short] = process.argv.slice(1).map(Number)
  const even = (n) => Math.round(n / 2) * 2
  const s = short / Math.min(dw, dh)
  console.log(even(dw * s), even(dh * s))
' "$DW" "$DH" "$SHORT")
echo "Source ${DW}x${DH}, ${DURATION}s -> ${W}x${H} at ${FPS} fps"

# 1. The editing copy: H.264 + AAC, faststart, capped so 20-odd seconds stay
#    near 3 MB.
ffmpeg -hide_banner -loglevel error -y -i "$SRC" \
  -map 0:v:0 -map 0:a:0 \
  -vf "scale=${W}:${H}:flags=lanczos,fps=${FPS},format=yuv420p" \
  -c:v libx264 -preset slow -crf 25 -maxrate 1000k -bufsize 2000k \
  -g "$GOP" -keyint_min "$GOP" -sc_threshold 0 \
  -c:a aac -b:a 64k -ac 1 -ar 44100 \
  -map_metadata -1 -movflags +faststart "$OUT/take.mp4"

# The copy's own duration: the source's container can disagree by a frame.
DURATION="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT/take.mp4")"
DURATION_US="$(node -e 'console.log(Math.round(Number(process.argv[1]) * 1e6))' "$DURATION")"

# 2. The filmstrip, planned by ingest's own function.
PLAN="$(cd "$ROOT" && npx tsx -e '
  import { planFilmstrip } from "./lib/editor/media"
  console.log(JSON.stringify(planFilmstrip(Number(process.argv.at(-1)))))
' "$DURATION_US")"
read -r COUNT INTERVAL TW TH < <(node -e '
  const p = JSON.parse(process.argv[1]); console.log(p.count, p.intervalUs, p.tileWidth, p.tileHeight)
' "$PLAN")
ffmpeg -hide_banner -loglevel error -y -i "$OUT/take.mp4" \
  -vf "fps=1000000/${INTERVAL},scale=${TW}:${TH}:force_original_aspect_ratio=increase,crop=${TW}:${TH},tile=${COUNT}x1" \
  -frames:v 1 -q:v 6 "$OUT/filmstrip.jpg"

# 3. The audio the transcript is made from, and the seek index's peaks:
#    mono 16 kHz PCM, the shape ingest sends to Deepgram.
ffmpeg -hide_banner -loglevel error -y -i "$OUT/take.mp4" -vn -ac 1 -ar 16000 -f s16le "$OUT/voice.pcm"
node --input-type=module - "$OUT/voice.pcm" "$OUT/seek-index.json" "$DURATION" "$GOP" "$FPS" <<'EOF'
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

# 4. What the manifest needs that is not in the words. The transcript step
#    adds the words and the strong line and writes manifest.json.
node -e '
  const [out, w, h, fps, durationUs, plan] = process.argv.slice(1)
  const p = JSON.parse(plan)
  require("node:fs").writeFileSync(out, JSON.stringify({
    durationUs: Number(durationUs), width: Number(w), height: Number(h), fps: Number(fps),
    filmstrip: { tiles: p.count, intervalUs: p.intervalUs, tileWidth: p.tileWidth, tileHeight: p.tileHeight },
  }, null, 2))
' "$OUT/take.json" "$W" "$H" "$FPS" "$DURATION_US" "$PLAN"

ls -la "$OUT"
