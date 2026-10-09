# Zoom rendering investigation

## Reproduced cause

At a 3840 × 2160 viewport, Fit selects level 4 and exposes all 512 finest-level tiles, plus two root fallbacks. The old eviction logic ran whenever the texture cache exceeded 220 entries, then reduced it to 180 entries without distinguishing visible textures from idle textures. It deleted textures just drawn in the current frame. The next asynchronous tile completion/redraw requested those deleted tiles again. This created a repeating load → draw → delete → reload loop with changing mixtures of fine tiles and coarse fallback detail.

Before changing the renderer, the automated stationary-view test failed with **514 unique tile URLs, 1,111 requests, and 338 URLs requested repeatedly** (examples reloaded two to four times). This reproduces a concrete zoom-dependent failure rather than inferring the cause from an image alone.

After the fix, the same viewport requests **514 unique URLs exactly once: 514 requests and zero repeated URLs**. The regression additionally redraws after changing water height, so stability does not depend on leaving the canvas untouched.

## Fix

Every draw records visible tile keys across the selected LOD and ancestor fallback levels. Eviction considers only non-root textures outside that set. It retains up to 220 idle textures and trims idle entries to 180 in LRU order when that budget is exceeded. Active memory necessarily scales with the viewport's working set; raising a single global capacity would only conceal the incorrect eligibility rule. At this dataset size, the absolute ceiling is the finite 682-tile pyramid (about 84.3 MiB of RGBA texture data, excluding browser/GPU overhead).

The longitude selection upper bound is now `ceil(right * columns) - 1`, avoiding an extra offscreen column. Wrapped keys still share one texture across repeated longitude copies. Failed visible loads schedule a redraw after their 15-second retry backoff; previously a stationary camera could leave a failed tile indefinitely unretried. Success clears failure state, and destruction cancels the timer along with frames, requests, listeners, and GPU resources.

## Investigation and validation

- **LOD:** selection remains `clamp(ceil(log2(scale / 360)), 0, maxZoom)`. Browser instrumentation observes the finest drawn level immediately below/above world widths of 360, 720, 1440, and 2880 CSS pixels. Ancestors remain available beneath children while loading.
- **Selection/position/seam:** native equirectangular positions use the 2×1 root grid, latitude rows clamp at the poles, longitude wraps modulo the level's column count, and repeated copies reuse texture keys. Tests pan across both wrap directions and assert successful responses.
- **Precision/shaders/filtering:** camera longitude stays normalized; the bounded zoom and normalized coordinates do not explain the observed deletion/reload cycle. The vertex/fragment shaders are unchanged. Numeric elevation remains nearest sampled with `texelFetch`, explicit unpremultiplied/non-color-converted image decode, and no interpolation of encoded RGB bytes. Independent screenshot/palette checks compare rendered colors with decoded numeric PNG samples.
- **Loading/races:** the pending-key set prevents concurrent duplicate requests; loaded ancestors provide progressive rendering. Browser QA delays level-3 responses while changing views, checks no page errors, and injects a 503 response to verify autonomous stationary retry.
- **GPU lifecycle:** actual browser draw calls are instrumented with `getError()`; transition/seam tests require zero WebGL errors. Evicted textures are deleted, and teardown aborts fetches and deletes textures, buffer, and program. Context loss continues to show a reload message; automatic context restoration is not added.
- **Science:** no changes to `lib/ocean.ts`, generated browser data, processing code, or original NASA files. The default remains +1377.125 m and 71.0206954313891% area-weighted coverage, with strict `elevation < water` flooding and unchanged quarter-meter measurements.

The automated suite tests the original 4K eviction reproduction, all four LOD boundaries, delayed loading, both seam directions, transient failure recovery, mobile/desktop controls, exact click samples/depth, water coverage endpoints, and reset. It runs against both an isolated development server and a plain static production export. Tests use Chromium software WebGL; they do not establish compatibility with every GPU/driver or prove that an unspecified different glitch cannot exist. No live Vercel deployment has been created or verified.

## Final verification — 2026-10-09

| Check | Result |
| --- | --- |
| TypeScript (`npm run typecheck`) | Passed in workspace and clean Node 24 deployment copy |
| Ocean model (`npm test`) | 3 passed; also passed on Node 24 |
| Scientific processing (`npm run test:data`) | 7 passed, none skipped in the original workspace |
| Production build | Passed; static `/` and not-found pages exported |
| Development browser suite | 5 passed |
| Clean Node 24 production browser suite | 5 passed |
| 4K regression | 514 unique tile URLs, 514 requests, 0 duplicates |
| LOD / seam browser instrumentation | All four boundaries checked; zero page/WebGL errors or unsuccessful data responses |
| GPU screenshot numeric palette comparison | Five locations matched exactly (0 channel error) |
| Export asset inventory | All 1,707 files / 121,768,051 bytes matched recorded SHA-256 hashes |
| Negative asset checks in disposable deployment copy | Missing PNG, corrupt PNG, truncated float32 chunk all rejected; originals restored |
| Clean deployment install | Node 24.21.0, `npm ci`, no original NASA dataset or derived grids; successful build and browser QA |
| Original NASA audit | All 375 supplied MD5 entries matched; source files opened read-only |
| Publication | Local Git initialized; no commit, remote, push, or deployment |
