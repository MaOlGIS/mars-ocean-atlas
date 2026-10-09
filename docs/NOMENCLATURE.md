# Martian geographical feature labels

The atlas uses an independent DOM label layer over the existing MOLA WebGL canvas. It shares the renderer's camera updates and native equirectangular transform. The renderer gained only a `locate(latitude, longitude)` camera method for search navigation; terrain shaders, texture management, MOLA measurements, ocean mathematics, and static Vercel hosting are unchanged.

## Official source and snapshot

Source: [USGS / IAU Gazetteer of Planetary Nomenclature, Mars](https://planetarynames.wr.usgs.gov/Page/MARS/target), [GIS downloads](https://planetarynames.wr.usgs.gov/GIS_Downloads).

The official `MARS_nomenclature_center_pts.zip` Shapefile was downloaded on 2026-10-09. Downloads are generated nightly, so later snapshots can differ. The archive includes SHP/SHX/DBF/CPG/PRJ and `metadata_nomenclature_points_MARS.xml`. The committed browser snapshot, `public/nomenclature/mars.json`, records retrieval time, the archive's SHA-256, source CRS, original field names, source geographic coverage, and attribution. No runtime requests to USGS are needed.

The inspected source contains 2,052 point rows, all marked `Adopted by IAU`, representing 2,051 distinct official identifiers. The two Bohar entries (ID 16054) are identical after normalization; the processor deduplicates them and rejects conflicting duplicate IDs. Unapproved/dropped records would be excluded on refresh. Proper names and diacritics are preserved. The compact JSON is 394,116 bytes, containing center coordinates, IAU type/code, approximate diameter/longest dimension in km, available approximate geographic extents, approval date, and official ID. Links are reconstructed as `https://planetarynames.wr.usgs.gov/Feature/{id}`.

DBF fields include `name`, `clean_name`, `approvaldt`, `origin`, `diameter`, `center_lon`, `center_lat`, `type`, `code`, `approval`, `min_lon`, `max_lon`, `min_lat`, `max_lat`, `ethnicity`, `continent`, `quad_name`, `quad_code`, and `link`. The lightweight browser snapshot omits name-origin/cultural and quadrangle text, retaining the identifying and geographic fields needed for map labels. Zero/nonpositive sizes and all-zero extents become unavailable values rather than invented dimensions. Bounds are approximate extents, not outline polygons or surveyed footprints.

## Coordinate conventions — explicitly verified

[USGS target coordinate systems](https://planetarynames.wr.usgs.gov/TargetCoordinates) lists both Mars systems: planetocentric/+east and planetographic/+west. [USGS website documentation](https://planetarynames.wr.usgs.gov/Page/Website) explains that these latitudes differ on the Martian ellipsoid, and KML uses planetocentric/east coordinates. Do not infer which convention a dataset uses from its file extension.

For this actual Shapefile, the bundled XML specifically says `lattype=Planetocentric`, `londir=Positive East`, and `londom=0 to 360`. The PRJ identifies `GCS_Mars_2000`, datum `D_Mars_2000`, spheroid `Mars_2000_IAU_IAG`, equatorial radius 3,396,190 m and inverse flattening 169.894447223612 (ESRI 104905). This is **not Earth WGS84**. The XML also describes a spherical cartographic radius of 3,396,190 m. The generic ellipsoidal PRJ does not override the explicit planetary latitude convention in the metadata. No Earth reprojection or ellipsoid-based latitude conversion is performed.

Geometry is read in native SHP x/y order (longitude/latitude), and every point is checked against DBF center_lon/center_lat. Latitude is retained unchanged. Longitude is normalized using `longitude % 360`, so a source center at 360° maps to 0°E. Extents retain their source endpoints, including 360° where it marks the domain edge; never sort west/east endpoints to repair a wrap-crossing extent. The source centers cover latitude −86.876° to +88.88° and longitude 0.0014° to 360°. Absence of a named center at an exact pole does not mean the MOLA terrain omits the poles.

Planetary JSON is used rather than RFC 7946 GeoJSON, whose default coordinate reference is Earth WGS84. This keeps the Mars body, latitude convention, and longitude convention explicit. The atlas projects names with the same normalized plane as terrain: `x=longitude/360`, `y=(90-latitude)/360`. Geographic extents and Gazetteer dimensions do not change the MOLA sphere radius or ocean area weights.

Known adopted centers verified from the snapshot:

| Feature | Official ID | Planetocentric latitude | East longitude | Approximate size / longest dimension |
| --- | --- | --- | --- | --- |
| Olympus Mons | 4453 | 18.6528° | 226.1975° | 610.13 km |
| Valles Marineris | 6288 | −14.0059° | 301.4123° | 3761.2778 km |
| Hellas Planitia | 2432 | −42.4301° | 70.5025° | 2299.1624 km |

The Gazetteer identifies the Mars control network as MDIM 2.1. Named center positions are approximate catalog anchors; they may not coincide with a summit, deepest basin cell, or every apparent boundary in the processed MOLA grid. This layer does not infer feature-specific elevation or water depth from a point name.

## Cartographic behavior

- Olympus Mons, Valles Marineris, and Hellas Planitia receive global prominence. Other features progressively appear according to size, descriptor group, and CSS pixels per world width. Major mountains, valleys, plains, and large craters are prioritized; other descriptor classes remain searchable and appear at detailed zoom.
- Feature groups are cartographic filters: Mountains (MO/TH/DO), Valleys (VA/CH/FO), Plains (PL/PM), Craters (AA), and Other (remaining descriptors). The popup retains the exact official type, rather than replacing it with an inferred geological classification.
- Labels stay centered on catalog coordinates, including all visible periodic longitude copies. Stable importance/ID order, measured fixed Arial typography, 4px collision clearance, and a 8% disappearance hysteresis prevent zoom-threshold chatter. Reduced-motion settings disable the short appearance fade. Collision decisions also reserve visible map-control/popup regions.
- Collision layout is deterministic at a stationary view and bounds density by available screen space. Names can disappear when they collide during a pan; they are not detached or shifted away from their catalog centers to preserve visibility. At a wrap crossing, hysteresis follows the feature ID rather than the longitude-copy key.
- Cached text widths and the small local catalog keep redraw work bounded. No labels alter terrain rendering or ocean calculations. Unoccupied overlay space passes pointer/pinch/wheel events through to the canvas. Label buttons and search results support keyboard access; Escape closes feature information.
- Search is case/diacritic insensitive, offers up to eight results, enables the relevant type, and moves the existing camera to the feature. Labels can be switched off independently. Submerged features retain names: nomenclature describes geographical features, not the currently exposed land surface.

## Refresh processing data

Only a deliberate source update needs Python/GDAL (already available in the processing environment). Normal builds use the committed snapshot without downloading anything:

```bash
# Refresh the official nightly archive and convert it:
python scripts/process_nomenclature.py --download
# Reconvert the locally downloaded archive:
npm run process:names
npm test
npm run typecheck
npm run build
npm run test:production
```

Raw Shapefile/XML/archive files remain under ignored `derived/nomenclature/`. The processor checks metadata/geometry/identifiers and writes only `public/nomenclature/mars.json`; it never reads or changes original MOLA rasters. Review source/date/hash, count changes, and known coordinates before committing an updated catalog. Future official coordinate revisions may require intentionally updating reference-coordinate tests after independent verification.

Build verification checks the names' planetary conventions and identifiers, known landmark centers, and exact equality between the committed JSON and its exported copy. Existing MOLA asset hashes are checked independently. Static exports serve `/nomenclature/mars.json`; no backend, credential, environment variable, hosting change, or remote publication is required.

## Attribution and verification

Visible controls link to the USGS / IAU Gazetteer and each feature card links to its official record. The Gazetteer is maintained by USGS for the IAU Working Group for Planetary System Nomenclature with NASA support. Attribution is retained inside the snapshot.

Tests cover landmark identifiers/coordinates and browser pixel alignment, collision-free label boxes, zoom-dependent detail and hysteresis, longitude-copy projection, both visibility/type controls, search, mobile layout, and label persistence at 100% ocean coverage. The existing terrain/slider/zoom/GPU regression suite runs alongside the new tests. Browser QA uses Chromium software WebGL and the actual static export; it does not test every GPU/browser or publish a new Vercel version.

Final local verification on 2026-10-09: Node 24 production build and TypeScript checks passed; 6 TypeScript label/ocean tests passed; all 7 Python scientific tests passed without skips; all 7 browser tests passed against both development and static production. Browser landmark centers aligned within 1 CSS pixel, stationary labels did not collide, and labels retained their identities at 100% flooded coverage. Detailed-view label anchors stayed aligned after an 80-step longitude pan crossing the seam. The 4K terrain regression still made exactly 514 requests for 514 unique URLs with no reloads; LOD/GPU checks passed. Independent terrain palette comparisons at five locations had zero channel error with the label layer switched off. All 1,707 MOLA asset hashes were unchanged, the exported 394,116-byte nomenclature snapshot matched its source exactly, and all 375 original NASA MD5 entries matched. No commit, push, or Vercel deployment was performed for this update.
