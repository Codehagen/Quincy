# Notices

Most files in `components/showcase/` are ported from, or written after,
**Stageshow** (https://benji.org/stageshow), which is MIT licensed. Each such
file names its Stageshow source in a header comment. The demos in `demos/`
are Quincy's own scenes built on those parts.

What changed in the port: the parts Quincy's demos need were taken, not the
whole kit; every `--ss-*` token is pointed at a `--kit-*` token
(`theme.css`); the lucide glyphs are replaced by hugeicons (`icon.tsx`);
annotations are rewritten in Quincy's marks (Caveat notes and beat
brackets). The stage, script, cursor, measuring and motion behaviour is
unchanged.

## Stageshow's own notices, carried with the copy

Product and operating-system names, familiar device geometry, app icons, and
illustrated interfaces are used as examples. Those names and marks remain
with their owners; the Stageshow license does not grant trademark rights or
imply endorsement. Adapt examples to the product you are illustrating.

None of Stageshow's bundled third-party artwork (app icons, the brand
registry, photographs) was copied into this folder. No third-party fonts are
bundled; Inter and Caveat come from `components/kit/fonts.ts`.

`Phone frame="photo"` is optional. Supply your own permitted bezel image via
`--ss-phone-photo-light: url(...)` and optionally `--ss-phone-photo-dark`.
Without it, the kit uses its CSS-drawn `pro` frame. No bezel photographs are
bundled.

## License

MIT License

Copyright (c) 2026 Benji Taylor

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
