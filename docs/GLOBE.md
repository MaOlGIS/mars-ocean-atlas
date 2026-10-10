# Interactive Mars globe

Use **2D Map / 3D Globe** to change views. Both use the existing React-owned water height, area-weighted CDF, shading control, graticule control, inspection card, and USGS/IAU nomenclature controls. Switching views preserves the selected scenario and label filters. Camera reset is separate from **Reset to 71%**, which changes the ocean scenario. Each view starts with its own fit camera when activated.

## Rendering and planetary coordinates

The globe uses Three.js with OrbitControls through the same canvas/renderer lifecycle as the existing 2D map. Its module is imported only when the user selects 3D, so the initial 2D view does not load Three.js. React Three Fiber is not required for this existing renderer interface. No backend, new preprocessing output, NASA download, or Vercel configuration change is needed.

The display sphere has normalized radius 1, representing the existing **3,396,000 m reference sphere** used for ocean area. Latitude is planetocentric and longitude positive east, matching the existing atlas and nomenclature snapshot. The right-handed Cartesian frame is:

```
X = cos(latitude) × cos(east longitude)
Y = sin(latitude)
Z = −cos(latitude) × sin(east longitude)
```

North is +Y, south −Y, 0°E +X, and 90°E −Z. When viewing 0°E with north up, east lies to screen-right. The default camera faces approximately 12°N, 260°E; the small fractional offsets avoid placing the default inspection exactly on a raster cell boundary. Search aims the existing camera directly at the selected catalog coordinate. A perspective view offset leaves space for the simulation controls, using the same CSS-pixel origin as the 2D atlas.

The globe is a **smooth sphere without elevation displacement**. Tile patches use one shared 256×128 spherical vertex lattice at every LOD. Adjacent patches and ancestor/child patches share identical float32 vertices, including the 0°/360° seam. All polar vertices collapse exactly onto the axis. Face winding points outward; the hidden hemisphere is culled. This avoids different tessellation surfaces or radial layer offsets that could create cracks or z-fighting. Ancestors render first and finer tiles over them with depth writes disabled; all patches lie on the same lattice.

## MOLA terrain, water, and inspection

Existing numeric PNGs at `/data/tiles/{z}/{x}/{y}.png` are reused directly. Each texture is only **180×180 pixels**, with no oversized global atlas or texture-array layer requirement. Numeric elevation is encoded in RGB as `(elevation × 4 + 40000)`; alpha stores multidirectional hillshade. ImageBitmap decode explicitly disables premultiplication, color-space conversion, and image flipping. Textures use nearest sampling, no mipmaps, no sRGB conversion, and no canvas RGBA round trip that could corrupt low RGB bytes when unpremultiplying hillshade alpha.

`lib/terrain-shader.ts` contains the unchanged terrain fragment shader shared by both views: fixed absolute land elevation colors, strict `elevation < water` flooding, depth-dependent shallow/deep blues, underwater relief, land-side coast outlines, and optional graticule. Three's RawShaderMaterial applies that same shader without extra lighting, tone mapping, or automatic color conversion. It is a scientific atlas, with hillshade attached to terrain rather than a rotating sunlight/photorealistic model.

Low-resolution views use the same nearest-sampled MOLA overview tiles as the 2D atlas. Raster cell coastlines can simplify at these levels; visual resolution does not redefine the scientific water threshold or area. The view-dependent LOD is `clamp(ceil(log2(projected circumference / 360)), 0, min(maxZoom, 4))`. The projected circumference estimate uses camera distance, FOV, and CSS viewport height. Zoom beyond the finest available tiles enlarges the processed raster; it adds no source detail.

**Ocean coverage is never computed from globe pixels or the visible hemisphere.** Both views use the existing full-grid, area-weighted CDF and the same water level. The default remains +1377.125 m and 71.0206954313891% flooded area, with exact 0% and 100% endpoints. No new measurement radius, datum, or projected-area approximation is introduced.

Clicking casts an analytic ray against the unit sphere, converts its nearest intersection back to planetocentric/east coordinates, then calls the shared `ElevationSampler`. Both renderers fetch the exact same finest 16 ppd little-endian float32/quality chunks, independent of display LOD. The inspection card reports the selected cell's elevation and `max(0, water − elevation)`. Clicks are suppressed after drag or multitouch movement; old async inspection results cannot replace newer clicks.

## Controls and labels

- Left drag / one-finger drag rotates; wheel / two-finger pinch zooms.
- The globe does not auto-rotate. OrbitControls damping settles, and then frame rendering stops.
- **Zoom in/out**, **Reset globe camera**, and keyboard arrows/plus/minus/zero provide navigation. Reset/search clears residual drag inertia.
- Sliders, view buttons, labels, and search live outside the canvas event target, preventing gesture conflicts.
- Existing geographic labels use the globe camera's actual perspective projection. A feature is hidden when its surface normal points away from the camera (`point · cameraPosition ≤ 1` on the unit sphere), including the perspective horizon rather than only an orthographic hemisphere test.
- Existing size/type importance, zoom thresholds, hysteresis, collision spacing, reserved UI areas, toggles, filters, information cards, and search remain in use. Labels describe geological nomenclature and remain visible underwater. No names or coordinates were invented.

## Loading and resource management

A conservative spherical-cap test requests tiles that may intersect the visible limb, including polar tiles. Two root tiles provide fallback while the target LOD loads; previously loaded intermediate levels remain useful. Up to **six tile requests** run concurrently. Pending keys deduplicate requests. Failed visible tiles retry after a 15-second backoff. A callback after view teardown cannot create or retain a texture.

Visible textures and fallbacks are protected from eviction. A maximum of **64 idle non-root textures** is retained in LRU order. The finite 682-tile dataset bounds absolute texture storage, while the visible working set and idle budget keep normal use much smaller. One RGBA tile occupies 129,600 bytes; the desktop regression requires resident texture payload below 40 MiB. That measurement excludes geometry, driver overhead, framebuffer/MSAA allocations, and temporary browser objects.

DPR is capped at 1.5 for the globe. Materials share identical shader source, so Three reuses its compiled program. Textures, geometry, materials, controls, observers, timers, requests, renderer state, and retired WebGL contexts are released when switching modes. CPU ImageBitmaps close immediately after explicit texture upload. Unexpected context loss offers reload or return to 2D; closed bitmaps are not presented as automatically recoverable texture sources.

## Verification

```bash
npm test
npm run test:data
npm run typecheck
npm run build
npm run test:production
python tests/check_gpu_screenshot.py
python tests/check_globe_screenshot.py
npm run test:browser
```

The screenshot checks run after their corresponding browser tests generate artifacts. The globe check independently reconstructs captured projection/model-view matrices, casts rays, intersects the float32 triangle lattice, interpolates geographic UVs, decodes the actual PNG samples, and calculates land/sea palette, coast outline, graticule, and hillshade. It covers wet and dry terrain, including the Olympus region; it does not infer correct terrain alignment only from overlaid names.

Unit tests cover all catalog coordinate round trips, north/south/east orientation, exact seam/pole/ancestor vertex agreement, outward winding, conservative visibility near the limb and both poles, and far-side label rejection. Browser tests cover scenario preservation between views, 0/71/100 flooding, exact finest-grid click/depth measurements, visible Olympus/Valles and hidden Hellas, mobile search, mouse drag, actual touch drag/pinch, idle-frame cessation, resource payload bounds, WebGL errors, and the original 2D controls/labels/zoom regressions. Browser QA uses Chromium software WebGL; actual device GPU performance can differ.

The static build verifies every existing MOLA browser asset hash and exact nomenclature export. Original NASA data remains excluded and unchanged. The GitHub → Vercel deployment workflow is unchanged; this work does not commit, push, or deploy automatically.

Verified locally on 2026-10-11: Node 24 production build and TypeScript checks passed; 9 unit tests, 7 scientific tests, and 9 browser tests in each of development and static-production mode passed. The independent screenshot checks matched all five sampled locations in each view with zero RGB channel error. All 375 original NASA file MD5 checks passed. The exported 1,707 MOLA browser assets and 2,051 nomenclature features passed their integrity checks. Browser interaction and GPU checks used Chromium software WebGL, rather than physical mobile hardware.

## Future phase: true geometric terrain

Displacement is deferred until a separately validated follow-up. A plausible first approximation is:

```
terrain radius = 3,396,000 m + MOLA areoid elevation × exaggeration
water radius = 3,396,000 m + scenario water elevation × exaggeration
```

These would be concentric radial surfaces. **This is a simplified spherical approximation, not an actual constant-potential Martian ocean.** MOLA heights refer to the GMM3/mgm1025 degree/order-50 Martian areoid, whose spatial shape is not represented by a constant-radius sphere. A physically consistent equipotential water surface would require the actual areoid/geopotential field and a carefully defined mapping from height to Cartesian radius.

A future configurable exaggeration must affect terrain and the illustrative water surface consistently while leaving all heights, depths, thresholds, the CDF, and reported coverage unexaggerated. A water shell at exaggerated height without matching terrain exaggeration would produce a visually inconsistent shoreline. Shallow and deep water coloring must continue to use the original elevation differences.

Before adding displacement, evaluate geometric LOD and memory cost, shared edge vertices and samples, parent/child transition stitching, normal reconstruction, exact polar fans, and how to avoid seams/cracks and exaggerated relief errors. Explicitly distinguish illustrative elevation displacement from physical water potential. Keep click measurements on the authoritative finest numeric grid; do not replace the existing area-weighted scientific model with displaced triangle area or visible screen area.
