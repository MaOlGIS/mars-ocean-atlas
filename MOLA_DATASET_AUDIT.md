# MOLA dataset technical audit

Inspection date: **2026-10-09 (Europe/Prague)**. Workspace: `/home/ayabp/mars`.
Dataset root: `/home/ayabp/mars/20261009T122401589809`.

## 1. Executive summary

**Verdict: PARTIALLY READY — suitable source data for the proposed map, with preprocessing and explicit metadata handling required.** No additional elevation download is needed for an initial complete global map. This is an inspection only: no map, raster conversion, mosaicking, tiles, or software installation was performed. Only this report was added to the workspace. Inspection scripts and results were written under `/tmp`; temporary symlinks were removed. Original dataset file sizes and modification timestamps were unchanged across the main audit; GDAL sidecar writing was disabled.

The download contains **89 raster products**, each with IMG, PDS4 XML, PDS3 LBL, and ENVI HDR companions. The extracted products include complete global topography at 4, 16, 32, and 64 pixels per degree (ppd), 16 cylindrical topography tiles at 128 ppd spanning **88°N to 88°S**, and north/south polar topography at nominal 128, 256, and 512 ppd. Planetary shape, observation counts, and two areoid grids are also present.

All **375 supplied MD5 manifest entries match**, all **16 TAR archives match their extracted contents**, and all **89 IMG byte sizes match their PDS4 binary layouts**. Every IMG was scanned in bounded blocks. Actual topography reaches **−8,208 to +21,249 m** in the 128 ppd cylindrical products. There are no nonfinite topography values or occurrences of the candidate integer sentinel −32768 in those cylindrical grids.

Important handling requirements:

- Literal backslashes in extracted filenames break detached-label resolution on Linux. Direct GDAL opening can even silently read XML bytes through the ENVI driver. Read through correctly named staging links and explicitly select/check the PDS4 driver.
- **26 observation-count HDR files declare 16-bit data, while XML, LBL sample bits, and actual file sizes establish 8-bit data.** Do not use those HDR files to read counts.
- Every inspected HDR declares zero as ignored data. Cylindrical topography contains legitimate zero-meter cells; zero-count cells express lack of direct observations, not missing coordinates. Do not inherit this mask automatically.
- Four polar shape PDS3 labels have incorrect record-byte totals. Their PDS4 float layouts and actual data sizes agree.
- PDS3-derived georeferencing can shift global data or misplace polar data. Prefer the revised PDS4 transformations, cross-checked against the local projection catalog and ENVI guide.
- Polar shape documentation contains conflicting projection descriptions. Use **MEGT** topography for terrain; reserve polar MEGR shape products until that conflict is resolved.

Recommended first release: **32 ppd global MEGT** for a complete, manageable baseline; later add **128 ppd cylindrical MEGT plus validated polar MEGT**, preserving the baseline as fallback. Use Python/GDAL for preparation, a custom Mars equirectangular CRS in Leaflet for the first complete 2D map, and a separate numeric elevation lookup path. CesiumJS is the stronger future globe option.

## 2. Discovered files and folder structure

The ODE HTML cart identifies the PDS4 bundle `urn:nasa:pds:mgs_mola_topography_derived` and a cart selection time of 2026-10-09 12:23 (the HTML does not specify its timezone). XML product labels identify mission Mars Global Surveyor, instrument MOLA, target Mars, and the IAU2000_MARS reference frame. XML labels inspected here are the 2026 migration of older science products, not new 2026 observations.

```text
20261009T122401589809/
  cartOrder.tar
  cartOrder_part_0002.tar … cartOrder_part_0015.tar
  ODECartHTMLList.tar
  cartOrder_manifest.txt
  cartOrder_part_0002_manifest.txt … cartOrder_part_0015_manifest.txt
  ODECartHTMLList_manifest.txt
  download_urls.txt
  odecarthtmllist.htm
  cartOrder/
    cartorder\dsmap.cat
    cartorder\dsmap_polar.cat
    cartorder\mola_envi.pdf
    cartorder\<product>.{img,xml,lbl,hdr}
    readme_split_volume.txt
  cartOrder_part_0002/ … cartOrder_part_0015/
    cartorder\<product>.{img,xml,lbl,hdr}
    readme_split_volume.txt
```

`cartorder\` above is a **literal part of each filename**, not a directory. The original MEG004/016/032/064/128/polar collection directories were flattened by the cart packaging. Collection membership is established from the cart source URLs, product IDs, and XML pixel scales.

Total: **408 files, 24,997,837,899 bytes = 24.998 GB = 23.281 GiB**. This includes both archives and extracted copies; the science rasters alone are 12,496,572,416 bytes (11.638 GiB).

| Extension | Count | Total bytes |
| --- | --- | --- |
| .cat | 2 | 5,918 |
| .hdr | 89 | 92,163 |
| .htm | 1 | 204,974 |
| .img | 89 | 12,496,572,416 |
| .lbl | 89 | 359,996 |
| .pdf | 1 | 186,901 |
| .tar | 16 | 12,499,077,120 |
| .txt | 32 | 39,289 |
| .xml | 89 | 1,299,122 |

No GeoTIFF, VRT, application files, or web tiles were found. Supporting material includes `cartOrder/cartorder\dsmap.cat` (cylindrical equations and pixel-center convention), `cartOrder/cartorder\dsmap_polar.cat` (polar equations), and `cartOrder/cartorder\mola_envi.pdf` (2017 guide explaining precision and GDAL offset problems). The 15 split-volume README copies explain packaging rather than scientific interpretation. Appendix C lists every file and its size.

## 3. Dataset specifications

All products are single-band, two-dimensional, row-major rasters: XML `Array_2D_Image/offset = 0`, `axis_index_order = Last Index Fastest`, Line sequence 1, Sample sequence 2. There is no binary header or per-row padding in the verified PDS4 layout. Multibyte data are big-endian; byte order is immaterial for 8-bit counts. XML element units are meters for elevation/shape/areoid products; counts are dimensionless observations.

| Collection / products | Products | Raster dimensions (W × H) | Measurements present |
| --- | --- | --- | --- |
| MEG004 / *cb | 4 | 1440 × 720 | MEGA, MEGC, MEGR, MEGT |
| MEG016 / *eb | 4 | 5760 × 2880 | MEGA, MEGC, MEGR, MEGT |
| MEG032 / *fb | 3 | 11520 × 5760 | MEGC, MEGR, MEGT |
| MEG064 / *gb | 12 | 11520 × 5760 per tile; 4 tiles per measurement | MEGC, MEGR, MEGT |
| MEG128 / *hb | 48 | 11520 × 5632 per tile; 16 tiles per measurement | MEGC, MEGR, MEGT |
| Polar 128 | 6 | 10240 × 10240 | North/south MEGC, MEGR, MEGT |
| Polar 256 | 6 | 11520 × 11520 | North/south MEGC, MEGR, MEGT |
| Polar 512 | 6 | 12288 × 12288 | North/south MEGC, MEGR, MEGT |

| Product family | Stored type | Physical interpretation |
| --- | --- | --- |
| Cylindrical MEGT | SignedMSB2: int16 | Elevation in m relative to GMM3 areoid; scale 1, offset 0 |
| Cylindrical MEGR | SignedMSB2: int16 | Radius in m = stored + 3,396,000 |
| MEGA (4/16 ppd) | SignedMSB2: int16 | Areoid radius in m = stored + 3,396,000 |
| MEGC (4/16/32 ppd) | SignedMSB2: int16 | Observation count per bin |
| MEGC (64/128 ppd and all polar) | UnsignedByte: uint8 | Observation count per bin |
| Polar MEGT *_1 | UnsignedMSB2: uint16 | Areoid elevation in m = stored × 0.25 − 8,000 |
| Polar MEGR | IEEE754MSBSingle: float32 | Radius residual in m relative to 3,396,000 m spherical datum; XML scale 1 / offset 0; add datum explicitly to obtain absolute radius |

Representative evidence: `20261009T122401589809/cartOrder/cartorder\mega90n000cb.xml` has `Element_Array/value_offset = 3396000`; `20261009T122401589809/cartOrder_part_0014/cartorder\megt_n_128_1.xml` has `UnsignedMSB2`, `scaling_factor = 0.25`, `value_offset = -8000`. `20261009T122401589809/cartOrder_part_0011/cartorder\megr_n_128.lbl` states that shape samples are mean radius relative to a 3,396,000 m spherical datum. Its PDS4 Element_Array does not encode that addition.

### Coordinates and georeferencing

**Verified global convention:** planetocentric latitude, positive-east longitude, 0–360° source extent, body-fixed rotating IAU2000_MARS frame; rows run north to south and samples west to east. The global projection is PDS4 **Equirectangular**, equivalent to the catalog's simple cylindrical projection, with standard parallel 0°, central meridian 180°, and a **3,396,000 m sphere** (all three axes equal). A suitable explicit projected definition is `+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=180 +R=3396000 +units=m +type=crs`. Geographic coordinates use a custom Mars sphere, not EPSG:4326's terrestrial datum. EPSG identifiers for generic angular/metre units within a WKT do not make its planetary datum terrestrial.

`dsmap.cat` establishes area pixels. For tile west W, north N and resolution P, the center of zero-based column c / row r is `longitude = W + (c + 0.5)/P`, `latitude = N − (r + 0.5)/P`. Bounding coordinates describe pixel edges. At a pole, the grid's outer edge reaches ±90°; pixel centers do not lie exactly on that edge. Define an explicit limiting/interpolation rule for an exact-pole click.

For example, `megt44n270hb.xml` specifies extent 270–360°E, 0–44°N, pixel scale 128, and upper-left projected corner (5,334,424.326, 2,607,940.782) m. GDAL PDS4 reads a pixel step of 463.0576672 m; its ENVI transformation agrees to submillimeter rounding in this test. `megt90n000cb.xml` specifies upper-left (−10,668,848.651, 5,334,424.326) m and 14,817.845349 m pixels.

**Verified polar topography convention:** PDS4 Polar Stereographic, projection origin ±90°, central meridian 0°, sphere radius **3,376,200 m**. The nominal projected step is πR/(180P). Example north 128: upper-left (−2,357,032.248, +2,357,032.248) m, step 460.357861 m. North longitude 0 extends downward from center and 90°E to the right; south longitude 0 extends upward and 90°E right. The north/south orientation must be tested separately. A suitable definition is `+proj=stere +lat_0=90 +lon_0=0 +k=1 +R=3376200 +units=m +type=crs` (use −90 for the south). The projection sphere is a horizontal mapping convention, not the elevation zero surface.

Polar MEGR XML uses a different sphere, **3,396,000 m**, and declares stereographic despite prose containing a sine-based formula. All polar products are square maps; latitude bounds are corner extrema, not a cap extending equally far from the pole in every longitude.

### Missing data and special constants

No PDS4 `Special_Constants` were found in any of the 89 arrays. Therefore zero is not declared a PDS4 missing value. All HDRs declare `data ignore value = 0`; applying it blindly would remove valid terrain and meaningful zero-count quality cells. PDS3 GDAL supplies format-default nodata (for example −32768 for int16, zero for uint16, and a large negative float value); these driver defaults are not independently verified science-product missing constants. Candidate integer extrema are reported in Appendix A. The block scan found every sample finite, all cylindrical MEGT values inside plausible Martian elevation ranges, and no −32768 cylindrical MEGT cells. Absence of explicit missing values does not mean every cell was directly measured.

## 4. Coverage and resolution analysis

**A complete global map is supported by the downloaded data.** Global 4, 16, and 32 ppd products each span 0–360°E and −90 to +90°. At 64 ppd, four tiles per measurement form two 180° longitude columns and two 90° latitude rows, including both poles. Their full mosaic would be 23,040 × 11,520 cells.

At 128 ppd, 16 tiles per measurement form four 90° longitude columns and four 44° latitude rows: [88,44], [44,0], [0,−44], [−44,−88]. Their cylindrical mosaic is 46,080 × 22,528. There are **two missing 2° polar caps in this cylindrical collection**, together approximately `1 − sin(88°) = 0.0609%` of spherical surface area. Evidence: `megt88n000hb.xml` has north=88 / south=44; `megt44s000hb.xml` has north=−44 / south=−88.

Downloaded polar MEGT fills those caps with substantial overlap. At nominal 128/256/512, square corner latitude reaches about |37.45°| / |58.96°| / |73.15°|, while full-longitude coverage is guaranteed only poleward of approximately |51.52°| / |67.78°| / |78.04°| respectively, under the declared stereographic equations. All are sufficient for the missing ±88–90° caps. These square polar grids must be reprojected and masked to their actual footprint, not interpreted as rectangular longitude/latitude rasters.

The cylindrical tile bounding rectangles partition their stated domains with no positive-area gaps or overlaps at each resolution. Their dimensions exactly match width/height in degrees times ppd. Edges share geographic boundaries, not duplicated pixel centers. Multiple resolutions and polar squares deliberately overlap. Different resolutions are alternate representations, not additional adjacent terrain.

### Ground spacing

Using the dataset's own 3,396,000 m sphere, equatorial/meridional spacing is `πR/(180P)`. East–west spacing at planetocentric latitude φ is this value times cos φ. This is spacing of the grid, not independent observational resolution. Using a mean Mars radius around 3,389.5 km would lower the figures by about 0.19%; the source sphere is retained for consistency.

| Cylindrical ppd | Angular spacing | N–S / equatorial E–W (m) | E–W at 60° (m) | E–W at 80° (m) |
| --- | --- | --- | --- | --- |
| 4 | 0.25° | 14,817.85 | 7,408.92 | 2,573.09 |
| 16 | 0.0625° | 3,704.46 | 1,852.23 | 643.27 |
| 32 | 0.03125° | 1,852.23 | 926.12 | 321.64 |
| 64 | 0.015625° | 926.12 | 463.06 | 160.82 |
| 128 | 0.0078125° | 463.06 | 231.53 | 80.41 |

Polar MEGT nominal projected spacing is **460.36, 230.18, and 115.09 m** at 128/256/512 ppd. For a sphere and stereographic k₀=1, local projection scale is `sec²(colatitude/2)`; actual surface spacing is projected spacing times `cos²(colatitude/2)`, so it decreases away from the pole. Polar ppd is a nominal scale at the pole, not uniform angular pixel spacing.

### Seams and realistic detail

All 37 cylindrical MEGT adjacency comparisons, including each band's 360°/0° wrap, read full boundary rows/columns. Median absolute differences across neighboring cell centers are 30 m at 4 ppd, 15 m at 16, 10 m at 32, 2–12 m at 64, and 1–16 m at 128. Largest adjacent-cell difference is 1,496 m at 4 ppd and 887 m at 128. These compare different physical positions: natural slopes can produce nonzero differences. No wholesale positional discontinuity is established, but these measurements do **not** prove absence of subtle striping, interpolation artifacts, polar transition seams, or differences between resolutions. Appendix B gives all boundary results. Polar-to-cylindrical numerical co-registration was not resampled or validated during this audit.

The 128 ppd map has nominal ~463 m equatorial cells: large craters, volcanoes, valleys, and regional relief can be rendered well. Individual boulders, rover-scale terrain, and fine cliff geometry are beyond it. Even polar ~115 m grids do not imply 115 m independent observations everywhere. Higher frontend zoom can enlarge pixels/interpolate; it cannot add measured detail. HRSC, CTX-derived DTMs, or HiRISE DTMs would be later regional additions if finer topography is required.

## 5. Integrity validation results

The checks below are verified against the local download, rather than inferred from file naming:

- All 89 XML files parse as well-formed XML, with two axes and expected dimensions. All accompanying XML/LBL/HDR/IMG quartets are present.
- All 359 unique science/document filenames linked from `odecarthtmllist.htm` are present: 89 × 4 product files plus the two CATs and PDF. This establishes completeness of **this cart**, not a full mission bundle or all archived MOLA observations.
- All 375 lines across 16 supplied MD5 manifests were checked against extracted file bytes. No missing files or hash mismatches.
- All 375 regular archive members across 16 TAR files were read and compared byte-for-byte to their extracted counterparts; no differences. `ODECartHTMLList.tar` contains the HTML extracted directly at the dataset root. No archive extraction was performed.
- Every IMG size equals `offset + width × height × bytes_per_sample` from PDS4. XML and PDS3 image dimensions agree for all products.
- Every original raster was memory-mapped read-only and scanned in ≤128-row blocks. Computation uses temporary float64 blocks, not entire-raster copies.
- All 89 products open with the PDS4 driver and permit a 2×2 read when addressed through temporary correctly named symlinks. Driver, dimensions, transformations, scale, offset, and returned values were checked. Original files were not renamed.

### Discovered inconsistencies and consequences

**1. Detached references and silent driver fallback.** All XML file references expect unprefixed names such as `megt90n000cb.img`, but actual basenames contain literal `cartorder\`. GDAL normalizes the backslash path as a separator when looking for an image. Direct opening of the original XML failed for 81 products. Eight smaller XML labels appeared to open, but this was an **ENVI fallback interpreting the label itself as image bytes**. Direct `megt90n000cb.xml` returned sample `[15423, 30829]`, while PDS4 through normalized links returned correct `[-1971, −1968]`. A successful `gdal.Open` is insufficient: verify driver `PDS4`, expected file list, dimensions, and actual samples. Future processing should stage correctly named links and restrict open drivers, or create derived labels/VRTs outside the originals.

**2. Count HDR types are wrong.** All four 64 ppd and sixteen 128 ppd MEGC HDRs declare ENVI type 2 (int16), and all six polar MEGC HDRs declare type 12 (uint16). Their XML is `UnsignedByte`, PDS3 `SAMPLE_BITS = 8`, and IMG size is exactly W×H bytes. Thus 26 headers would ask a reader for twice the actual data. Byte-order=1 in those headers is irrelevant for the correct uint8 interpretation. Low-resolution count HDRs correctly use int16. Trust verified XML and binary sizes here.

**3. Four polar shape PDS3 record totals are wrong.** See the table below. Their `SAMPLE_BITS=32`, ENVI float type, XML IEEE754MSBSingle, and observed IMG lengths agree with a 4-byte element. These are label defects, not truncated downloads.

| Polar shape product | PDS3 RECORD_BYTES × FILE_RECORDS | Declared bytes | Actual / XML bytes |
| --- | --- | --- | --- |
| megr_n_128 | 10240 × 10240 | 104,857,600 | 419,430,400 |
| megr_n_256 | 11520 × 11520 | 132,710,400 | 530,841,600 |
| megr_s_128 | 10240 × 10240 | 104,857,600 | 419,430,400 |
| megr_s_256 | 11520 × 11520 | 132,710,400 | 530,841,600 |

**4. PDS3 georeferencing is unsafe without corrections.** In GDAL 3.13.3, the normalized-link PDS3 read of `megt90n000cb.lbl` gives upper-left (−10,683,778, 5,349,298) m, step 14,818 m, versus PDS4 (−10,668,848.651, 5,334,424.326), step 14,817.845349 m. The offsets are approximately one coarse pixel. For polar `megt_n_128_1.lbl`, GDAL gives upper-left (−230,+230) m because PDS3 offsets are N/A, versus PDS4 approximately (−2.357 million,+2.357 million) m. The local PDF explicitly documents GDAL offset and rounded MAP_SCALE problems. Its conversion examples are guidance, not commands executed in this audit.

**5. Some HDR polar map scales differ from revised XML.** For north 128 MEGT, HDR step 460.38987367 m differs from XML 460.357861 m, giving ~164 m corner displacement. For south 512 MEGC, HDR 115.10262218 m differs from XML 115.089465 m, about 81 m at the corner. Do not mix header transforms into a PDS4 mosaic. The XML modification history dated 2026-09-15 explicitly replaces three-decimal PDS3 scales with πR/(180P) and computed upper-left corners.

**6. Polar shape projection ambiguity.** Polar MEGR labels declare Polar Stereographic but prose gives `2*sin(colatitude/2)` rather than the stereographic tangent relation. The catalog `dsmap_polar.cat` gives an arctangent inverse; the supplied MEGR corner latitudes agree numerically with that stereographic inverse. This favors the declared stereographic interpretation but is not independent ground control. The quoted sine formula also omits an explicit degrees/radians scale conversion. Further producer clarification or a controlled cross-product registration test is needed before scientific use of polar MEGR. Polar MEGT does not contain that conflicting shape formula and is the preferred terrain input.

XML validation here is structural and semantic inspection, **not formal XSD/Schematron PDS validation**. No schema downloads or PDS validator installation were performed. No producer-signed archive checksum was supplied; matching local manifests establishes consistency with those manifests, not independent authenticity. Overlap co-registration against another mission and absolute measurement accuracy were not tested.

## 6. Raster statistics and elevation quality

The statistics below are **full-data scans**, not only samples. Raw values are decoded according to each product's scale/offset before reporting physical extrema. All 89 products contain only finite values. For cylindrical MEGT, scale 1 means raw and physical elevation coincide.

| ppd | MEGT cells scanned | Minimum m | Maximum m | Valid zero-meter cells | Zero-count fraction (MEGC) |
| --- | --- | --- | --- | --- | --- |
| 4 | 1,036,800 | -8,068 | 21,134 | 147 | 0.88% |
| 16 | 16,588,800 | -8,177 | 21,171 | 2,128 | 5.45% |
| 32 | 66,355,200 | -8,206 | 21,181 | 8,431 | 18.74% |
| 64 | 265,420,800 | -8,199 | 21,218 | 34,107 | 42.05% |
| 128 | 1,038,090,240 | -8,208 | 21,249 | 136,772 | 66.57% |

The downloaded global range at 128 ppd agrees exactly with `megt44n270hb.xml/Array_2D_Image/description`, which records −8208 / 21249 m and defines topography as planetary radius minus areoid radius. At 64 ppd, measured −8199 / 21218 m also matches the XML description. Different resolution extrema need not match: bin aggregation and interpolation differ.

| Polar MEGT | Decoded minimum m | Decoded maximum m | Raw zero cells |
| --- | --- | --- | --- |
| megt_n_128_1 | -7,034.5 | 980 | 0 |
| megt_n_256_1 | -6,577 | -2,262 | 0 |
| megt_n_512_1 | -6,443.25 | -2,262 | 0 |
| megt_s_128_1 | -7,946 | 6,126 | 0 |
| megt_s_256_1 | -1,840.25 | 4,798 | 0 |
| megt_s_512_1 | -112.25 | 4,799.5 | 0 |

A verified first 2×2 block in north 128 polar MEGT is `[[29484,29501],[29491,29499]]` as uint16, decoding to `[[-629.00,-624.75],[-627.25,-625.25]]` m. A north 256 polar MEGR sample is about −16,429 m: that is a **spherical radius residual**, not −16 km areoid elevation. Absolute radius requires adding 3,396,000 m. MEGA and cylindrical MEGR XML offsets must likewise be honored. GDAL `ReadAsArray` returns stored values, even where band metadata advertises scale and offset; processing must apply those factors explicitly once.

The science labels define topography relative to the **Goddard Mars potential model GMM3 (mgm1025), evaluated to degree and order 50**, in IAU2000. This is the historical areoid definition explicitly stated in the labels; do not substitute a modern similarly named gravity solution by name alone. It is neither Earth sea level nor height above the horizontal projection sphere. Shape uses mean radius while topography uses median bin elevation, so subtracting independently aggregated MEGR and MEGA will not necessarily reproduce MEGT cell-for-cell.

**Quality limits:** Labels describe interpolated values wherever no observations fall in a bin, excluded poor orbit solutions/cloud/noise returns, roughly 600 million observations, and gaps up to 12 km between profiles. Their repeated generic statement that roughly 55% of equatorial bins have observations is not resolution-specific enough to use as this download's measured coverage. The scanned global zero-count fractions above provide a stronger resolution-specific indicator: approximately **66.57%** of the 128 ppd cylindrical count cells are zero, versus 18.74% at 32 ppd. This indicates substantial interpolation; it is not 66.57% blank terrain. Poleward sampling differs, and each count product's map geometry should be verified before associating it with terrain.

The terrain is suitable for hillshade, color ramps, contours, and elevation lookup at its grid scale. Preserve MEGC as a quality layer and expose interpolated/direct-observation status where the bin correspondence is established. Integer meter quantization globally and quarter-meter encoding in polar MEGT describe encoding precision, not measurement accuracy. Actual vertical accuracy, uncertainty per pixel, shot-level provenance, and temporal polar changes are not established by this inspection. No photorealistic imagery is included.

## 7. Compatibility with web mapping tools

| Tool | Fit for this project | Mars-specific requirements / limitations |
| --- | --- | --- |
| MapLibre GL JS | Strong GPU raster rendering, styled overlays, smooth interaction; optional raster-dem terrain | Default Mercator tile model excludes exact poles; globe display does not by itself validate planetary radius, polar coverage, or height reference. Geographic angle placement can be reused as a display adapter, but Earth-derived distances, meter scaling, altitude and terrain exaggeration need Mars-specific correction/testing. Arbitrary native Mars equirectangular/polar CRS is not a simple configuration switch. |
| Leaflet | Recommended initial complete 2D map; raster pyramid, click handling, markers and overlays | Implement a custom equirectangular Mars CRS and rectangular tile matrix; override Earth radius/distance defaults and longitude wrapping. Additional polar views can use a custom stereographic CRS. No native terrain mesh or planetary globe. |
| CesiumJS | Recommended future globe; custom spherical/ellipsoidal bodies, geographic tiling, imagery and terrain | Configure Mars ellipsoid consistently across globe, tiling, camera math, picking and terrain provider; align planetocentric source coordinates and terrain height reference. Avoid default Earth terrain/geocoder/imagery. Modern Cesium includes a Mars mean-radius sphere constant, which differs from this dataset's 3396 km projection sphere. |
| GDAL | Installed; primary inspection and future processing engine | PDS4 supports planetary georeferencing, derived GeoTIFF/VRT/overviews and reprojection. Explicitly select PDS4, decode scaling, handle masks, supply planetary CRS and pixel edges. Avoid silently transforming between Earth and Mars datums. |
| Rasterio | Optional Python raster interface, windowed reads and derived raster workflows | Not installed. Uses GDAL underneath; actual PDS4 driver availability depends on build. Preserve planetary WKT and scale/offset; do not let a common EPSG default replace the source. |
| NumPy + Python GDAL | Already sufficient for local processing and numeric sampling | Efficient memmap/windowed operations; supply georeferencing/quality semantics explicitly. SciPy/pyproj may help later but are not prerequisites for the verified raw read. |

Current official references: [MapLibre projection specification](https://maplibre.org/maplibre-style-spec/projection/) and [raster DEM source/encodings](https://maplibre.org/maplibre-style-spec/sources/); [Leaflet CRS methods, wrapping, and equirectangular tile matrix](https://leafletjs.com/reference.html#crs); [Cesium Ellipsoid including MARS](https://cesium.com/learn/cesiumjs/ref-doc/Ellipsoid.html) and [GeographicTilingScheme](https://cesium.com/learn/cesiumjs/ref-doc/GeographicTilingScheme.html); [GDAL PDS4 driver](https://gdal.org/en/stable/drivers/raster/pds4.html); [Rasterio windowed operations](https://rasterio.readthedocs.io/en/stable/topics/windowed-rw.html). These establish API capabilities, not a tested application in this workspace.

### Planetary pitfalls to resolve in the design

Normalize longitude for lookup as `((lon % 360) + 360) % 360`. If displaying −180…180°, split/reorder raster longitude ranges or explicitly adapt the tile matrix; changing a CRS string alone does not rearrange 0…360 pixels. Choose and document the visible seam and support wrapped panning without duplicate markers. Wrap longitude only; clamp latitude.

For native cylindrical clicks, use the inverse area-pixel formula, select the tile by edge bounds, and sample decoded elevation; bilinear interpolation is an explicit alternative to a nearest-cell value. For polar products, inverse-project the click to the product's native grid. Return meters above the labeled areoid, source resolution, and quality flag. Colorized imagery is unsuitable for recovering exact elevation.

For a globe, terrain height must be relative to the renderer's body surface. On a **sphere**, the radial height is `radius_at_location − globe_radius`; deriving it from MEGT requires adding the matching areoid radius first. The 16 ppd MEGA can supply a smooth preliminary areoid field, but interpolation/aggregation and registration must be assessed. On an oblate ellipsoid, planetocentric latitude differs from geodetic latitude and radial displacement differs from ellipsoid-normal height; a proper Cartesian/radial-to-geodetic conversion is needed. Simply changing an ellipsoid constant while feeding areoid heights creates datum errors. Keep scientific areoid elevation and display-body-relative height as separate quantities.

## 8. Recommended technology stack

Start with **Python + existing GDAL + NumPy**, derived tiled GeoTIFF/COG elevation, static color/hillshade tiles, **Leaflet with custom Mars equirectangular CRS**, and a lightweight windowed GDAL elevation endpoint. Static HTTP hosting with caching is sufficient for visual tiles; COG range requests or an indexed tile lookup can support numeric sampling. Keep raw source references and a derived-data manifest. No database is necessary initially; add one if feature search or large editable overlays later warrants it.

Use **32 ppd `megt90n000fb`** as the initial full-planet source: one raster, ~1.85 km equatorial spacing, 126.56 MiB raw, easy to inspect and process. 16 ppd is a smaller overview; 4 ppd is a coarse debug/overview source. Generate a pyramid from the chosen elevation source rather than switching between independent source resolutions at arbitrary zooms, which can change heights and produce visible transitions.

Later use **128 ppd MEGT** for the main cylindrical high-detail surface and **polar 128/256/512 MEGT** for cap coverage and polar regional detail. 64 ppd is a useful intermediate all-planet fallback but not essential to process if a unified pyramid is generated. Retain the lower-resolution global raster underneath until polar registration and masks are validated. Consider CesiumJS when globe geometry is a required deliverable; MapLibre remains an option for a primarily Mercator experience if separate polar views and Earth-metric corrections are accepted.

## 9. Suggested data-processing architecture (not executed)

1. **Immutable sources → staging references.** Build a separate derived/staging directory containing correctly named symbolic links or detached derived labels pointing to original bytes. Explicitly restrict GDAL to PDS4; reject wrong drivers and dimension/size discrepancies. Save input hashes, science/product IDs, and metadata decisions.
2. **Interpret values and masks.** Decode MEGT scale/offset into meters once. Use PDS4 array definitions; disregard erroneous count HDR types and unverified zero masks. Keep count quality separately. Carry areoid and spherical residual definitions explicitly.
3. **Validate spatial metadata.** Use revised PDS4 corner transforms and radius/ppd calculations, area pixel centers and declared north/south orientation. Test known-feature locations and cross-product alignment. Resolve the polar shape formula if using MEGR. Use a custom Mars CRS throughout analytical processing.
4. **Mosaic within consistent projections.** A VRT can combine 64 ppd quadrants or the sixteen 128 ppd cylindrical tiles without materializing a huge array. Reproject polar MEGT separately into a chosen global coordinate grid or serve it in polar views. Establish a deterministic priority/mask across overlaps. Validate differences before blending; blending for display must not silently redefine scientific elevation lookup.
5. **Write derived georeferenced elevation.** Use tiled GeoTIFF/COG, with appropriate integer or float physical samples, explicit CRS and nodata semantics. Float32 preserves quarter-meter polar values; int16 suffices for the global unscaled MEGT range. Use lossless compression and overviews. Choose BigTIFF where derived sizes can exceed 4 GiB. GeoTIFF custom planetary WKT must survive round-tripping.
6. **Compute color and hillshade.** Use a common elevation ramp based on areoid heights. Compute gradients with Mars ground distances, not Earth's ~111 km per degree. Even projected equirectangular x/y units in meters have latitude-dependent ground scale: adjust E–W gradients by cos φ or compute shading in locally appropriate projections. Use validated polar stereographic/local frames at high latitude. Use cross-tile halos and a wrapped longitude halo; define a polar lighting policy. GDAL supports explicit x/y scaling and recommends polar reprojection where high-latitude geographic shading is unreliable: [hillshade documentation](https://gdal.org/en/stable/programs/gdal_raster_hillshade.html).
7. **Build a multiresolution visual pyramid.** For full 2D coverage, use a documented 2:1 equirectangular world matrix (e.g. two 256×256 tiles at level zero), longitude wrap, top-origin y, and polar edges. Derive overviews consistently. Bilinear/average resampling is appropriate for continuous elevation/display; nearest or deliberate aggregation is appropriate for counts. Generate shading at suitable levels or downsample with documented tradeoffs. Record XYZ vs TMS y orientation.
8. **Optional numeric/terrain tiles.** Keep quantitative elevation as lossless numeric data or encoded lossless DEM PNGs, distinct from JPEG/WebP visual tiles. Terrain-RGB/Terrarium/custom decoders must handle negatives, quantization and nodata. A Mercator DEM pyramid does not solve missing poles. For Cesium, generate a geographic quadtree terrain representation with the configured Mars body and heights converted to its reference surface; validate shared vertices, edge skirts and level-of-detail errors.
9. **Serve and validate.** Cache/version static tiles through HTTP/CDN, serve COGs with byte ranges or a small elevation API, and preserve attribution. Validate prime-meridian wrapping, tile edges, both poles, known terrain landmarks and numeric click results. Mark source resolution/interpolation in responses. Profile on intended browsers and screen sizes.

## 10. Performance and storage considerations

| Elevation working set | Cells / shape | Uncompressed physical storage |
| --- | --- | --- |
| Global 32 ppd | 11520 × 5760 | 132,710,400 bytes int16 (126.56 MiB); float32 twice this |
| Global 64 ppd | 23040 × 11520 | 530,841,600 bytes int16 (506.25 MiB) |
| Cylindrical 128 ppd | 46080 × 22528 | 2,076,180,480 bytes int16 (1.934 GiB) |
| Full 128 ppd reference grid | 46080 × 23040 | 2,123,366,400 bytes int16; 4,246,732,800 bytes float32 |
| Two polar 512 ppd MEGT | 2 × 12288² | 603,979,776 bytes uint16; 1,207,959,552 bytes float32 |

All uncompressed global 128 color RGB pixels would require ~3.11 GB; RGBA ~4.15 GB, plus ~1.04 GB for byte hillshade. A factor-two pyramid adds approximately 1/3 of the full-resolution pixel storage. Compression depends on relief, color ramp, shading, nodata and codec; no compressed output was generated, so a precise compression ratio would be speculative.

For a geographic 2×1 root matrix of 256 px tiles, world width is `512 × 2^z`. The 32/64/128 ppd source widths correspond to continuous levels **4.49 / 5.49 / 6.49**. Levels 5/6/7 are reasonable maximum visual tile levels, with some oversampling; further zoom should be labeled enlargement. Through level 7 there are **43,690** possible geographic tiles. At an illustrative 20–80 KiB per tile, one complete visual layer is ~0.83–3.33 GiB; this is a planning assumption, not a measured output. Through level 5 there are 2,730 tiles (~53–213 MiB under the same assumption). Polar regional tiles can use their own matrix rather than forcing 512 ppd across the entire planet. Mercator zoom levels have different widths and latitude distortion and should not be compared directly with these levels.

Local hardware inspection: ~31 GiB RAM, ~18 GiB available at inspection, and **~41 GiB filesystem space free**. This is sufficient for bounded-window global processing and a staged initial release. A 32 ppd color/hillshade/COG pipeline should fit comfortably within a few GiB. Budget approximately **10–25 GiB additional space** for a carefully staged 128 ppd global pipeline with cap handling and a few output layers. Processing every source resolution, every polar grid, multiple float mosaics, and terrain/visual pyramids together can need **30–60+ GiB**, exceeding comfortable current disk headroom. Retain archives; their duplicate storage explains much of the current 23.28 GiB, but this audit does not recommend deleting originals.

Processing is O(number of output pixels) per scan/shade/color/resampling pass; pyramids add ~33% pixels, while repeated warps, terrain encoding and compression can dominate. An initial 32 ppd product is reasonably a minutes-to-tens-of-minutes local job, and a higher-resolution/polar/multilayer run may take tens of minutes to hours, depending on codec, threads and output choices. These are rough planning estimates, not timed conversion benchmarks. Use bounded windows and modest worker counts; avoid one float64 array for a billion-cell raster (~8.3 GB) plus equally large intermediate arrays. Static tile collections involve many files; an archive-backed HTTP tile format can reduce small-file overhead once frontend compatibility is selected.

## 11. Missing data, dependencies, and unresolved problems

**No required cart product is missing.** The absent cylindrical 128 polar caps are supplied by separate polar topography or lower-resolution global grids. Only 4 and 16 ppd MEGA are present; higher-resolution standalone areoid rasters are not in this cart. They are not necessary for 2D areoid-height display; a matching areoid evaluation/field or properly interpreted shape source is needed for a rigorous globe-height conversion. This is not a complete PDS bundle: bundle/collection XML, formal collection inventories, shot-level PEDRs, uncertainty fields, and the full science documentation set are absent. These do not block initial display, but complete provenance/formal validation may require additional archive metadata later.

Not included: photographic basemaps, feature-name gazetteer, feature vectors, rover tracks, regional high-resolution DTMs, prebuilt web tiles, and terrain meshes. A future naming overlay can use an authoritative planetary nomenclature source after checking its longitude/latitude and reference-frame conventions. No overlay download is required for this feasibility verdict.

The main unresolved issue is polar shape documentation; remaining implementation checks include polar-to-cylindrical registration, hemisphere orientation, overlap values, exact-pole sampling, temporal polar surface differences, and frontend Mars meter scaling. Checksums cannot resolve scientific metadata inconsistencies. No claim of independent centimeter/meter absolute vertical accuracy is made.

### Available software / optional installation guidance

Verified installed: **GDAL 3.13.3**, Python `osgeo.gdal`, NumPy, lxml, `gdalinfo`, `gdal_translate`, and `pdftotext`. Rasterio is **not installed**; it is optional because Python GDAL already provides the needed functionality. No software was installed. If Rasterio is desired later, an isolated environment is preferable and its PDS4 driver support must be checked:

```bash
python -m venv .venv-mola
.venv-mola/bin/python -m pip install numpy rasterio
```

These are instructions only. A wheel can carry a different GDAL build from the installed system GDAL; avoid assuming identical driver coverage. Current package installation guidance: [Rasterio installation](https://rasterio.readthedocs.io/en/stable/installation.html). A formal PDS4 validator is optional and was not installed or run. Frontend/server dependencies should be chosen when application work is authorized, not installed as part of this audit.

## 12. Final feasibility verdict

**PARTIALLY READY.** The source dataset is intact and scientifically usable for a globally accurate Mars elevation map at its stated grid scale. It supports panning/zooming, numeric elevation queries, hillshade, elevation colorization, and future marker/overlay layers after deriving web assets. Separate polar and low-resolution products provide full planetary coverage. A future 3D globe is feasible with deliberate body geometry and vertical-datum conversion.

It is not web-ready in its current raw/PDS layout. Filename staging, PDS4 driver enforcement, scale/offset decoding, correct masks, planetary CRS handling, polar integration, and a tile pyramid are necessary. The audit found real metadata defects but no missing critical cart files or corrupt raster bytes. Interpolated bins and track spacing limit meaningful detail even where the pixel grid is dense.

## 13. Recommended next steps

1. Keep the original download immutable and retain this audit as the preprocessing specification.
2. Approve the initial scope: complete 2D equirectangular Mars map using 32 ppd MEGT, scientific areoid elevation queries, static shaded/color tiles, and a custom Mars CRS.
3. In a separate authorized processing task, stage correctly named references, enforce PDS4 reads, and create a small derived georeferenced test output. Validate coordinates and zero-elevation handling before scaling up.
4. Build the initial elevation/visual pyramid and windowed lookup service. Check known terrain landmarks, wrapping and polar edge behavior before application integration.
5. Add 128 ppd cylindrical tiles and validate polar MEGT reprojection/overlap. Preserve lower-resolution fallback and observation-count quality information.
6. If a globe becomes a priority, specify the rendered Mars surface, source-coordinate conversion, and height datum before generating terrain. Resolve polar MEGR ambiguities with the producer or independent registration tests if those products are needed.

No processing or implementation in these steps has been performed.

## Appendix A. Product inventory and full-scan statistics

Paths are relative to the dataset root. Each XML path has an IMG, LBL, and HDR companion with the same literal basename. IMG bytes are exact. Extents are [west, east, south, north] in source degrees; polar bounds are square extrema. Physical values include XML scale/offset. **Polar MEGR values remain spherical radius residuals**, since their XML offset is zero. Zero denotes stored zero, not inferred nodata. No product has a nonfinite sample.

| XML path | W × H | Type | ppd | Extent W,E,S,N | IMG bytes | Scale / offset | Physical min / max | Stored zeros |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cartOrder/cartorder\mega90n000cb.xml` | 1440 × 720 | SignedMSB2 | 4 | 0,360,-90,90 | 2,073,600 | 1 / 3.396e+06 | 3,378,199 / 3,397,488 | 175 |
| `cartOrder/cartorder\mega90n000eb.xml` | 5760 × 2880 | SignedMSB2 | 16 | 0,360,-90,90 | 33,177,600 | 1 / 3.396e+06 | 3,378,199 / 3,397,488 | 2,906 |
| `cartOrder/cartorder\megc00n000gb.xml` | 11520 × 5760 | UnsignedByte | 64 | 0,180,-90,0 | 66,355,200 | 1 / 0 | 0 / 53 | 27,983,915 |
| `cartOrder/cartorder\megc00n180gb.xml` | 11520 × 5760 | UnsignedByte | 64 | 180,360,-90,0 | 66,355,200 | 1 / 0 | 0 / 47 | 28,030,896 |
| `cartOrder/cartorder\megc90n000cb.xml` | 1440 × 720 | SignedMSB2 | 4 | 0,360,-90,90 | 2,073,600 | 1 / 0 | 0 / 2,611 | 9,137 |
| `cartOrder/cartorder\megc90n000eb.xml` | 5760 × 2880 | SignedMSB2 | 16 | 0,360,-90,90 | 33,177,600 | 1 / 0 | 0 / 326 | 903,558 |
| `cartOrder/cartorder\megc90n000fb.xml` | 11520 × 5760 | SignedMSB2 | 32 | 0,360,-90,90 | 132,710,400 | 1 / 0 | 0 / 125 | 12,434,182 |
| `cartOrder/cartorder\megc90n000gb.xml` | 11520 × 5760 | UnsignedByte | 64 | 0,180,0,90 | 66,355,200 | 1 / 0 | 0 / 35 | 27,671,945 |
| `cartOrder/cartorder\megr90n000cb.xml` | 1440 × 720 | SignedMSB2 | 4 | 0,360,-90,90 | 2,073,600 | 1 / 3.396e+06 | 3,373,069 / 3,417,241 | 60 |
| `cartOrder/cartorder\megr90n000eb.xml` | 5760 × 2880 | SignedMSB2 | 16 | 0,360,-90,90 | 33,177,600 | 1 / 3.396e+06 | 3,372,830 / 3,417,280 | 1,021 |
| `cartOrder/cartorder\megr90n000fb.xml` | 11520 × 5760 | SignedMSB2 | 32 | 0,360,-90,90 | 132,710,400 | 1 / 3.396e+06 | 3,372,798 / 3,417,293 | 4,487 |
| `cartOrder/cartorder\megt90n000cb.xml` | 1440 × 720 | SignedMSB2 | 4 | 0,360,-90,90 | 2,073,600 | 1 / 0 | -8,068 / 21,134 | 147 |
| `cartOrder/cartorder\megt90n000eb.xml` | 5760 × 2880 | SignedMSB2 | 16 | 0,360,-90,90 | 33,177,600 | 1 / 0 | -8,177 / 21,171 | 2,128 |
| `cartOrder/cartorder\megt90n000fb.xml` | 11520 × 5760 | SignedMSB2 | 32 | 0,360,-90,90 | 132,710,400 | 1 / 0 | -8,206 / 21,181 | 8,431 |
| `cartOrder_part_0002/cartorder\megc90n180gb.xml` | 11520 × 5760 | UnsignedByte | 64 | 180,360,0,90 | 66,355,200 | 1 / 0 | 0 / 35 | 27,921,778 |
| `cartOrder_part_0002/cartorder\megr00n000gb.xml` | 11520 × 5760 | SignedMSB2 | 64 | 0,180,-90,0 | 132,710,400 | 1 / 3.396e+06 | 3,378,213 / 3,400,803 | 6,105 |
| `cartOrder_part_0002/cartorder\megr00n180gb.xml` | 11520 × 5760 | SignedMSB2 | 64 | 180,360,-90,0 | 132,710,400 | 1 / 3.396e+06 | 3,378,633 / 3,414,709 | 4,415 |
| `cartOrder_part_0002/cartorder\megr90n000gb.xml` | 11520 × 5760 | SignedMSB2 | 64 | 0,180,0,90 | 132,710,400 | 1 / 3.396e+06 | 3,373,279 / 3,406,957 | 4,120 |
| `cartOrder_part_0002/cartorder\megr90n180gb.xml` | 11520 × 5760 | SignedMSB2 | 64 | 180,360,0,90 | 132,710,400 | 1 / 3.396e+06 | 3,372,782 / 3,417,341 | 3,088 |
| `cartOrder_part_0002/cartorder\megt00n000gb.xml` | 11520 × 5760 | SignedMSB2 | 64 | 0,180,-90,0 | 132,710,400 | 1 / 0 | -8,199 / 5,475 | 8,842 |
| `cartOrder_part_0003/cartorder\megc00n000hb.xml` | 11520 × 5632 | UnsignedByte | 128 | 0,90,-44,0 | 64,880,640 | 1 / 0 | 0 / 12 | 44,542,961 |
| `cartOrder_part_0003/cartorder\megc00n090hb.xml` | 11520 × 5632 | UnsignedByte | 128 | 90,180,-44,0 | 64,880,640 | 1 / 0 | 0 / 16 | 44,494,962 |
| `cartOrder_part_0003/cartorder\megc00n180hb.xml` | 11520 × 5632 | UnsignedByte | 128 | 180,270,-44,0 | 64,880,640 | 1 / 0 | 0 / 15 | 44,506,458 |
| `cartOrder_part_0003/cartorder\megc00n270hb.xml` | 11520 × 5632 | UnsignedByte | 128 | 270,360,-44,0 | 64,880,640 | 1 / 0 | 0 / 14 | 44,538,588 |
| `cartOrder_part_0003/cartorder\megc44n000hb.xml` | 11520 × 5632 | UnsignedByte | 128 | 0,90,0,44 | 64,880,640 | 1 / 0 | 0 / 14 | 44,329,454 |
| `cartOrder_part_0003/cartorder\megt00n180gb.xml` | 11520 × 5760 | SignedMSB2 | 64 | 180,360,-90,0 | 132,710,400 | 1 / 0 | -5,739 / 17,759 | 9,285 |
| `cartOrder_part_0003/cartorder\megt90n000gb.xml` | 11520 × 5760 | SignedMSB2 | 64 | 0,180,0,90 | 132,710,400 | 1 / 0 | -7,032 / 14,072 | 8,393 |
| `cartOrder_part_0003/cartorder\megt90n180gb.xml` | 11520 × 5760 | SignedMSB2 | 64 | 180,360,0,90 | 132,710,400 | 1 / 0 | -6,669 / 21,218 | 7,587 |
| `cartOrder_part_0004/cartorder\megc44n090hb.xml` | 11520 × 5632 | UnsignedByte | 128 | 90,180,0,44 | 64,880,640 | 1 / 0 | 0 / 13 | 44,313,374 |
| `cartOrder_part_0004/cartorder\megc44n180hb.xml` | 11520 × 5632 | UnsignedByte | 128 | 180,270,0,44 | 64,880,640 | 1 / 0 | 0 / 16 | 44,429,054 |
| `cartOrder_part_0004/cartorder\megc44n270hb.xml` | 11520 × 5632 | UnsignedByte | 128 | 270,360,0,44 | 64,880,640 | 1 / 0 | 0 / 13 | 44,363,507 |
| `cartOrder_part_0004/cartorder\megc44s000hb.xml` | 11520 × 5632 | UnsignedByte | 128 | 0,90,-88,-44 | 64,880,640 | 1 / 0 | 0 / 20 | 42,045,888 |
| `cartOrder_part_0004/cartorder\megc44s090hb.xml` | 11520 × 5632 | UnsignedByte | 128 | 90,180,-88,-44 | 64,880,640 | 1 / 0 | 0 / 22 | 42,092,401 |
| `cartOrder_part_0004/cartorder\megc44s180hb.xml` | 11520 × 5632 | UnsignedByte | 128 | 180,270,-88,-44 | 64,880,640 | 1 / 0 | 0 / 18 | 42,002,408 |
| `cartOrder_part_0004/cartorder\megc44s270hb.xml` | 11520 × 5632 | UnsignedByte | 128 | 270,360,-88,-44 | 64,880,640 | 1 / 0 | 0 / 20 | 42,245,951 |
| `cartOrder_part_0004/cartorder\megc88n000hb.xml` | 11520 × 5632 | UnsignedByte | 128 | 0,90,44,88 | 64,880,640 | 1 / 0 | 0 / 16 | 41,614,060 |
| `cartOrder_part_0004/cartorder\megc88n090hb.xml` | 11520 × 5632 | UnsignedByte | 128 | 90,180,44,88 | 64,880,640 | 1 / 0 | 0 / 22 | 41,615,693 |
| `cartOrder_part_0004/cartorder\megc88n180hb.xml` | 11520 × 5632 | UnsignedByte | 128 | 180,270,44,88 | 64,880,640 | 1 / 0 | 0 / 20 | 41,827,766 |
| `cartOrder_part_0004/cartorder\megc88n270hb.xml` | 11520 × 5632 | UnsignedByte | 128 | 270,360,44,88 | 64,880,640 | 1 / 0 | 0 / 17 | 42,072,397 |
| `cartOrder_part_0004/cartorder\megr00n000hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 0,90,-44,0 | 129,761,280 | 1 / 3.396e+06 | 3,380,364 / 3,400,375 | 9,075 |
| `cartOrder_part_0005/cartorder\megr00n090hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 90,180,-44,0 | 129,761,280 | 1 / 3.396e+06 | 3,382,146 / 3,401,759 | 15,417 |
| `cartOrder_part_0005/cartorder\megr00n180hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 180,270,-44,0 | 129,761,280 | 1 / 3.396e+06 | 3,386,238 / 3,414,715 | 9,847 |
| `cartOrder_part_0005/cartorder\megr00n270hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 270,360,-44,0 | 129,761,280 | 1 / 3.396e+06 | 3,382,825 / 3,402,451 | 7,672 |
| `cartOrder_part_0005/cartorder\megr44n000hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 0,90,0,44 | 129,761,280 | 1 / 3.396e+06 | 3,382,921 / 3,399,291 | 12,876 |
| `cartOrder_part_0005/cartorder\megr44n090hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 90,180,0,44 | 129,761,280 | 1 / 3.396e+06 | 3,381,755 / 3,407,017 | 3,743 |
| `cartOrder_part_0005/cartorder\megr44n180hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 180,270,0,44 | 129,761,280 | 1 / 3.396e+06 | 3,382,500 / 3,417,362 | 6,206 |
| `cartOrder_part_0006/cartorder\megr44n270hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 270,360,0,44 | 129,761,280 | 1 / 3.396e+06 | 3,381,413 / 3,400,789 | 5,943 |
| `cartOrder_part_0006/cartorder\megr44s000hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 0,90,-88,-44 | 129,761,280 | 1 / 3.396e+06 | 3,378,211 / 3,390,463 | 0 |
| `cartOrder_part_0006/cartorder\megr44s090hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 90,180,-88,-44 | 129,761,280 | 1 / 3.396e+06 | 3,379,407 / 3,391,955 | 0 |
| `cartOrder_part_0006/cartorder\megr44s180hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 180,270,-88,-44 | 129,761,280 | 1 / 3.396e+06 | 3,379,062 / 3,390,954 | 0 |
| `cartOrder_part_0006/cartorder\megr44s270hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 270,360,-88,-44 | 129,761,280 | 1 / 3.396e+06 | 3,378,633 / 3,390,913 | 0 |
| `cartOrder_part_0006/cartorder\megr88n000hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 0,90,44,88 | 129,761,280 | 1 / 3.396e+06 | 3,373,198 / 3,388,145 | 0 |
| `cartOrder_part_0007/cartorder\megr88n090hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 90,180,44,88 | 129,761,280 | 1 / 3.396e+06 | 3,372,129 / 3,385,599 | 0 |
| `cartOrder_part_0007/cartorder\megr88n180hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 180,270,44,88 | 129,761,280 | 1 / 3.396e+06 | 3,372,631 / 3,392,861 | 0 |
| `cartOrder_part_0007/cartorder\megr88n270hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 270,360,44,88 | 129,761,280 | 1 / 3.396e+06 | 3,371,720 / 3,390,822 | 0 |
| `cartOrder_part_0007/cartorder\megt00n000hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 0,90,-44,0 | 129,761,280 | 1 / 0 | -8,208 / 4,686 | 9,789 |
| `cartOrder_part_0007/cartorder\megt00n090hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 90,180,-44,0 | 129,761,280 | 1 / 0 | -5,750 / 6,080 | 12,500 |
| `cartOrder_part_0007/cartorder\megt00n180hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 180,270,-44,0 | 129,761,280 | 1 / 0 | -4,903 / 17,774 | 9,475 |
| `cartOrder_part_0008/cartorder\megt00n270hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 270,360,-44,0 | 129,761,280 | 1 / 0 | -6,440 / 7,127 | 15,857 |
| `cartOrder_part_0008/cartorder\megt44n000hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 0,90,0,44 | 129,761,280 | 1 / 0 | -5,062 / 3,210 | 27,474 |
| `cartOrder_part_0008/cartorder\megt44n090hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 90,180,0,44 | 129,761,280 | 1 / 0 | -6,506 / 14,115 | 5,616 |
| `cartOrder_part_0008/cartorder\megt44n180hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 180,270,0,44 | 129,761,280 | 1 / 0 | -5,598 / 21,249 | 7,324 |
| `cartOrder_part_0008/cartorder\megt44n270hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 270,360,0,44 | 129,761,280 | 1 / 0 | -6,136 / 4,478 | 20,699 |
| `cartOrder_part_0008/cartorder\megt44s000hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 0,90,-88,-44 | 129,761,280 | 1 / 0 | -7,945 / 4,887 | 10,378 |
| `cartOrder_part_0009/cartorder\megt44s090hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 90,180,-88,-44 | 129,761,280 | 1 / 0 | -5,813 / 4,886 | 3,280 |
| `cartOrder_part_0009/cartorder\megt44s180hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 180,270,-88,-44 | 129,761,280 | 1 / 0 | -1,219 / 5,114 | 3,334 |
| `cartOrder_part_0009/cartorder\megt44s270hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 270,360,-88,-44 | 129,761,280 | 1 / 0 | -5,250 / 6,130 | 8,289 |
| `cartOrder_part_0009/cartorder\megt88n000hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 0,90,44,88 | 129,761,280 | 1 / 0 | -7,034 / 981 | 32 |
| `cartOrder_part_0009/cartorder\megt88n090hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 90,180,44,88 | 129,761,280 | 1 / 0 | -6,395 / -1,072 | 0 |
| `cartOrder_part_0009/cartorder\megt88n180hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 180,270,44,88 | 129,761,280 | 1 / 0 | -6,221 / 4,901 | 1,720 |
| `cartOrder_part_0010/cartorder\megc_n_128.xml` | 10240 × 10240 | UnsignedByte | 128 | 0,360,37.45,90 | 104,857,600 | 1 / 0 | 0 / 143 | 48,701,011 |
| `cartOrder_part_0010/cartorder\megc_n_256.xml` | 11520 × 11520 | UnsignedByte | 256 | 0,360,58.96,90 | 132,710,400 | 1 / 0 | 0 / 45 | 80,719,703 |
| `cartOrder_part_0010/cartorder\megc_n_512.xml` | 12288 × 12288 | UnsignedByte | 512 | 0,360,73.15,90 | 150,994,944 | 1 / 0 | 0 / 22 | 118,013,185 |
| `cartOrder_part_0010/cartorder\megc_s_128.xml` | 10240 × 10240 | UnsignedByte | 128 | 0,360,-90,-37.45 | 104,857,600 | 1 / 0 | 0 / 218 | 48,936,668 |
| `cartOrder_part_0010/cartorder\megc_s_256.xml` | 11520 × 11520 | UnsignedByte | 256 | 0,360,-90,-58.96 | 132,710,400 | 1 / 0 | 0 / 68 | 81,576,773 |
| `cartOrder_part_0010/cartorder\megt88n270hb.xml` | 11520 × 5632 | SignedMSB2 | 128 | 270,360,44,88 | 129,761,280 | 1 / 0 | -6,682 / 3,171 | 1,005 |
| `cartOrder_part_0011/cartorder\megc_s_512.xml` | 12288 × 12288 | UnsignedByte | 512 | 0,360,-90,-73.15 | 150,994,944 | 1 / 0 | 0 / 23 | 118,809,356 |
| `cartOrder_part_0011/cartorder\megr_n_128.xml` | 10240 × 10240 | IEEE754MSBSingle | 128 | 0,360,37.4532,90 | 419,430,400 | 1 / 0 | -23,220.13 / -5,904.25 | 0 |
| `cartOrder_part_0011/cartorder\megr_n_256.xml` | 11520 × 11520 | IEEE754MSBSingle | 256 | 0,360,58.9622,90 | 530,841,600 | 1 / 0 | -23,871.96 / -16,415.97 | 0 |
| `cartOrder_part_0012/cartorder\megr_n_512.xml` | 12288 × 12288 | IEEE754MSBSingle | 512 | 0,360,73.1519,90 | 603,979,776 | 1 / 0 | -24,280.98 / -19,703.53 | 0 |
| `cartOrder_part_0012/cartorder\megr_s_128.xml` | 10240 × 10240 | IEEE754MSBSingle | 128 | 0,360,-90,-37.4532 | 419,430,400 | 1 / 0 | -17,790.12 / -4,003.78 | 0 |
| `cartOrder_part_0013/cartorder\megr_s_256.xml` | 11520 × 11520 | IEEE754MSBSingle | 256 | 0,360,-90,-58.9622 | 530,841,600 | 1 / 0 | -17,369.65 / -11,045.6 | 0 |
| `cartOrder_part_0013/cartorder\megr_s_512.xml` | 12288 × 12288 | IEEE754MSBSingle | 512 | 0,360,-90,-73.1519 | 603,979,776 | 1 / 0 | -17,222.11 / -12,688.95 | 0 |
| `cartOrder_part_0014/cartorder\megt_n_128_1.xml` | 10240 × 10240 | UnsignedMSB2 | 128 | 0,360,37.45,90 | 209,715,200 | 0.25 / -8000 | -7,034.5 / 980 | 0 |
| `cartOrder_part_0014/cartorder\megt_n_256_1.xml` | 11520 × 11520 | UnsignedMSB2 | 256 | 0,360,58.96,90 | 265,420,800 | 0.25 / -8000 | -6,577 / -2,262 | 0 |
| `cartOrder_part_0014/cartorder\megt_n_512_1.xml` | 12288 × 12288 | UnsignedMSB2 | 512 | 0,360,73.15,90 | 301,989,888 | 0.25 / -8000 | -6,443.25 / -2,262 | 0 |
| `cartOrder_part_0015/cartorder\megt_s_128_1.xml` | 10240 × 10240 | UnsignedMSB2 | 128 | 0,360,-90,-37.45 | 209,715,200 | 0.25 / -8000 | -7,946 / 6,126 | 0 |
| `cartOrder_part_0015/cartorder\megt_s_256_1.xml` | 11520 × 11520 | UnsignedMSB2 | 256 | 0,360,-90,-58.96 | 265,420,800 | 0.25 / -8000 | -1,840.25 / 4,798 | 0 |
| `cartOrder_part_0015/cartorder\megt_s_512_1.xml` | 12288 × 12288 | UnsignedMSB2 | 512 | 0,360,-90,-73.15 | 301,989,888 | 0.25 / -8000 | -112.25 / 4,799.5 | 0 |

Candidate-value checks (raw −32768 / 32767 / 65535 / 255) are diagnostic rather than a nodata definition. The following products contain one or more such values:

| Product | −32768 | 32767 | 65535 | 255 |
| --- | --- | --- | --- | --- |
| mega90n000cb | 0 | 0 | 0 | 71 |
| mega90n000eb | 0 | 0 | 0 | 1131 |
| megc90n000cb | 0 | 0 | 0 | 328 |
| megc90n000eb | 0 | 0 | 0 | 106 |
| megr90n000cb | 0 | 0 | 0 | 38 |
| megr90n000eb | 0 | 0 | 0 | 518 |
| megr90n000fb | 0 | 0 | 0 | 2158 |
| megt90n000cb | 0 | 0 | 0 | 71 |
| megt90n000eb | 0 | 0 | 0 | 1284 |
| megt90n000fb | 0 | 0 | 0 | 4990 |
| megr00n000gb | 0 | 0 | 0 | 3288 |
| megr00n180gb | 0 | 0 | 0 | 1859 |
| megr90n000gb | 0 | 0 | 0 | 1853 |
| megr90n180gb | 0 | 0 | 0 | 1611 |
| megt00n000gb | 0 | 0 | 0 | 7144 |
| megt00n180gb | 0 | 0 | 0 | 5316 |
| megt90n000gb | 0 | 0 | 0 | 4038 |
| megt90n180gb | 0 | 0 | 0 | 3385 |
| megr00n000hb | 0 | 0 | 0 | 4945 |
| megr00n090hb | 0 | 0 | 0 | 8082 |
| megr00n180hb | 0 | 0 | 0 | 3802 |
| megr00n270hb | 0 | 0 | 0 | 3929 |
| megr44n000hb | 0 | 0 | 0 | 6082 |
| megr44n090hb | 0 | 0 | 0 | 1584 |
| megr44n180hb | 0 | 0 | 0 | 3387 |
| megr44n270hb | 0 | 0 | 0 | 2813 |
| megt00n000hb | 0 | 0 | 0 | 6801 |
| megt00n090hb | 0 | 0 | 0 | 7215 |
| megt00n180hb | 0 | 0 | 0 | 4637 |
| megt00n270hb | 0 | 0 | 0 | 9202 |
| megt44n000hb | 0 | 0 | 0 | 13345 |
| megt44n090hb | 0 | 0 | 0 | 2662 |
| megt44n180hb | 0 | 0 | 0 | 3888 |
| megt44n270hb | 0 | 0 | 0 | 8725 |
| megt44s000hb | 0 | 0 | 0 | 9106 |
| megt44s090hb | 0 | 0 | 0 | 5322 |
| megt44s180hb | 0 | 0 | 0 | 1833 |
| megt44s270hb | 0 | 0 | 0 | 5421 |
| megt88n000hb | 0 | 0 | 0 | 4 |
| megt88n180hb | 0 | 0 | 0 | 571 |
| megt88n270hb | 0 | 0 | 0 | 409 |
| megt_n_128_1 | 0 | 70 | 0 | 0 |
| megt_s_128_1 | 0 | 2558 | 0 | 0 |
| megt_s_256_1 | 0 | 2203 | 0 | 0 |
| megt_s_512_1 | 0 | 64 | 0 | 0 |

## Appendix B. Boundary comparisons

Differences compare neighboring pixel centers, not identical coordinates. Means use A edge minus B edge; maxima reflect both relief and potential artifacts.

| ppd | A → B | Boundary | Samples | Median |Δ| m | 99th pct |Δ| m | Max |Δ| m | Mean signed Δ m |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | megt90n000cb → megt90n000cb | longitude | 720 | 30 | 626.86 | 1,496 | -12.91 |
| 16 | megt90n000eb → megt90n000eb | longitude | 2880 | 15 | 442.84 | 1,121 | -5.05 |
| 32 | megt90n000fb → megt90n000fb | longitude | 5760 | 10 | 321 | 839 | -2.03 |
| 64 | megt00n000gb → megt00n180gb | longitude | 5760 | 5 | 129.41 | 422 | -0.86 |
| 64 | megt00n180gb → megt00n000gb | longitude | 5760 | 10 | 244.46 | 676 | -0.84 |
| 64 | megt90n000gb → megt00n000gb | latitude | 11520 | 12 | 255.81 | 537 | -0.99 |
| 64 | megt90n000gb → megt90n180gb | longitude | 5760 | 2 | 174.41 | 728 | -1.36 |
| 64 | megt90n180gb → megt00n180gb | latitude | 11520 | 9 | 318.81 | 931 | -1.92 |
| 64 | megt90n180gb → megt90n000gb | longitude | 5760 | 7 | 261.41 | 666 | -2.57 |
| 128 | megt00n000hb → megt00n090hb | longitude | 5632 | 6 | 123.69 | 323 | 1.19 |
| 128 | megt00n000hb → megt44s000hb | latitude | 11520 | 5 | 82 | 299 | -0.07 |
| 128 | megt00n090hb → megt00n180hb | longitude | 5632 | 5 | 101.38 | 240 | -1.07 |
| 128 | megt00n090hb → megt44s090hb | latitude | 11520 | 5 | 108.81 | 323 | -1.91 |
| 128 | megt00n180hb → megt00n270hb | longitude | 5632 | 3 | 168.38 | 381 | 2.91 |
| 128 | megt00n180hb → megt44s180hb | latitude | 11520 | 3 | 83 | 217 | 0.47 |
| 128 | megt00n270hb → megt00n000hb | longitude | 5632 | 14 | 316.69 | 688 | -2.17 |
| 128 | megt00n270hb → megt44s270hb | latitude | 11520 | 6 | 129 | 221 | 1.18 |
| 128 | megt44n000hb → megt00n000hb | latitude | 11520 | 9.5 | 186 | 424 | 1.53 |
| 128 | megt44n000hb → megt44n090hb | longitude | 5632 | 2 | 56 | 144 | 1.29 |
| 128 | megt44n090hb → megt00n090hb | latitude | 11520 | 8 | 201.81 | 527 | -2.53 |
| 128 | megt44n090hb → megt44n180hb | longitude | 5632 | 1 | 106 | 374 | -1.41 |
| 128 | megt44n180hb → megt00n180hb | latitude | 11520 | 5 | 103 | 471 | 1.09 |
| 128 | megt44n180hb → megt44n270hb | longitude | 5632 | 3 | 77 | 210 | 3.5 |
| 128 | megt44n270hb → megt00n270hb | latitude | 11520 | 9 | 298.81 | 887 | -3.13 |
| 128 | megt44n270hb → megt44n000hb | longitude | 5632 | 16 | 343.76 | 599 | -3.3 |
| 128 | megt44s000hb → megt44s090hb | longitude | 5632 | 3 | 51 | 117 | -2.21 |
| 128 | megt44s090hb → megt44s180hb | longitude | 5632 | 2 | 28 | 69 | 0.31 |
| 128 | megt44s180hb → megt44s270hb | longitude | 5632 | 2 | 29 | 150 | 0.06 |
| 128 | megt44s270hb → megt44s000hb | longitude | 5632 | 5 | 134.07 | 301 | -1.1 |
| 128 | megt88n000hb → megt44n000hb | latitude | 11520 | 4 | 112 | 232 | -1.99 |
| 128 | megt88n000hb → megt88n090hb | longitude | 5632 | 1 | 16 | 130 | 0.46 |
| 128 | megt88n090hb → megt44n090hb | latitude | 11520 | 2 | 28 | 104 | -0.66 |
| 128 | megt88n090hb → megt88n180hb | longitude | 5632 | 1 | 14 | 47 | 0.04 |
| 128 | megt88n180hb → megt44n180hb | latitude | 11520 | 2 | 45 | 216 | -1.59 |
| 128 | megt88n180hb → megt88n270hb | longitude | 5632 | 1 | 15 | 41 | 0.51 |
| 128 | megt88n270hb → megt44n270hb | latitude | 11520 | 3 | 96 | 286 | 0.49 |
| 128 | megt88n270hb → megt88n000hb | longitude | 5632 | 3 | 58 | 121 | -1.25 |

## Appendix C. Complete local file inventory

This records the original 408 files, before creation of this report. Sizes are exact bytes. Archives and extracted products are both listed; no archive payload is counted as a second extracted file in the file count.

| Relative path | Bytes |
| --- | --- |
| `ODECartHTMLList.tar` | 215,040 |
| `ODECartHTMLList_manifest.txt` | 56 |
| `cartOrder/cartorder\dsmap.cat` | 3,145 |
| `cartOrder/cartorder\dsmap_polar.cat` | 2,773 |
| `cartOrder/cartorder\mega90n000cb.hdr` | 1,057 |
| `cartOrder/cartorder\mega90n000cb.img` | 2,073,600 |
| `cartOrder/cartorder\mega90n000cb.lbl` | 3,748 |
| `cartOrder/cartorder\mega90n000cb.xml` | 14,419 |
| `cartOrder/cartorder\mega90n000eb.hdr` | 1,060 |
| `cartOrder/cartorder\mega90n000eb.img` | 33,177,600 |
| `cartOrder/cartorder\mega90n000eb.lbl` | 3,760 |
| `cartOrder/cartorder\mega90n000eb.xml` | 14,341 |
| `cartOrder/cartorder\megc00n000gb.hdr` | 1,041 |
| `cartOrder/cartorder\megc00n000gb.img` | 66,355,200 |
| `cartOrder/cartorder\megc00n000gb.lbl` | 3,088 |
| `cartOrder/cartorder\megc00n000gb.xml` | 13,854 |
| `cartOrder/cartorder\megc00n180gb.hdr` | 1,055 |
| `cartOrder/cartorder\megc00n180gb.img` | 66,355,200 |
| `cartOrder/cartorder\megc00n180gb.lbl` | 3,086 |
| `cartOrder/cartorder\megc00n180gb.xml` | 13,844 |
| `cartOrder/cartorder\megc90n000cb.hdr` | 1,057 |
| `cartOrder/cartorder\megc90n000cb.img` | 2,073,600 |
| `cartOrder/cartorder\megc90n000cb.lbl` | 3,066 |
| `cartOrder/cartorder\megc90n000cb.xml` | 13,835 |
| `cartOrder/cartorder\megc90n000eb.hdr` | 1,060 |
| `cartOrder/cartorder\megc90n000eb.img` | 33,177,600 |
| `cartOrder/cartorder\megc90n000eb.lbl` | 3,079 |
| `cartOrder/cartorder\megc90n000eb.xml` | 13,840 |
| `cartOrder/cartorder\megc90n000fb.hdr` | 1,061 |
| `cartOrder/cartorder\megc90n000fb.img` | 132,710,400 |
| `cartOrder/cartorder\megc90n000fb.lbl` | 3,084 |
| `cartOrder/cartorder\megc90n000fb.xml` | 13,856 |
| `cartOrder/cartorder\megc90n000gb.hdr` | 1,062 |
| `cartOrder/cartorder\megc90n000gb.img` | 66,355,200 |
| `cartOrder/cartorder\megc90n000gb.lbl` | 3,090 |
| `cartOrder/cartorder\megc90n000gb.xml` | 13,863 |
| `cartOrder/cartorder\megr90n000cb.hdr` | 1,057 |
| `cartOrder/cartorder\megr90n000cb.img` | 2,073,600 |
| `cartOrder/cartorder\megr90n000cb.lbl` | 4,550 |
| `cartOrder/cartorder\megr90n000cb.xml` | 15,174 |
| `cartOrder/cartorder\megr90n000eb.hdr` | 1,060 |
| `cartOrder/cartorder\megr90n000eb.img` | 33,177,600 |
| `cartOrder/cartorder\megr90n000eb.lbl` | 4,567 |
| `cartOrder/cartorder\megr90n000eb.xml` | 15,224 |
| `cartOrder/cartorder\megr90n000fb.hdr` | 1,061 |
| `cartOrder/cartorder\megr90n000fb.img` | 132,710,400 |
| `cartOrder/cartorder\megr90n000fb.lbl` | 4,574 |
| `cartOrder/cartorder\megr90n000fb.xml` | 15,232 |
| `cartOrder/cartorder\megt90n000cb.hdr` | 1,057 |
| `cartOrder/cartorder\megt90n000cb.img` | 2,073,600 |
| `cartOrder/cartorder\megt90n000cb.lbl` | 4,796 |
| `cartOrder/cartorder\megt90n000cb.xml` | 15,509 |
| `cartOrder/cartorder\megt90n000eb.hdr` | 1,060 |
| `cartOrder/cartorder\megt90n000eb.img` | 33,177,600 |
| `cartOrder/cartorder\megt90n000eb.lbl` | 4,813 |
| `cartOrder/cartorder\megt90n000eb.xml` | 15,528 |
| `cartOrder/cartorder\megt90n000fb.hdr` | 1,061 |
| `cartOrder/cartorder\megt90n000fb.img` | 132,710,400 |
| `cartOrder/cartorder\megt90n000fb.lbl` | 4,820 |
| `cartOrder/cartorder\megt90n000fb.xml` | 15,605 |
| `cartOrder/cartorder\mola_envi.pdf` | 186,901 |
| `cartOrder/readme_split_volume.txt` | 853 |
| `cartOrder.tar` | 738,723,840 |
| `cartOrder_manifest.txt` | 3,766 |
| `cartOrder_part_0002/cartorder\megc90n180gb.hdr` | 1,058 |
| `cartOrder_part_0002/cartorder\megc90n180gb.img` | 66,355,200 |
| `cartOrder_part_0002/cartorder\megc90n180gb.lbl` | 3,088 |
| `cartOrder_part_0002/cartorder\megc90n180gb.xml` | 13,853 |
| `cartOrder_part_0002/cartorder\megr00n000gb.hdr` | 1,041 |
| `cartOrder_part_0002/cartorder\megr00n000gb.img` | 132,710,400 |
| `cartOrder_part_0002/cartorder\megr00n000gb.lbl` | 4,577 |
| `cartOrder_part_0002/cartorder\megr00n000gb.xml` | 15,219 |
| `cartOrder_part_0002/cartorder\megr00n180gb.hdr` | 1,055 |
| `cartOrder_part_0002/cartorder\megr00n180gb.img` | 132,710,400 |
| `cartOrder_part_0002/cartorder\megr00n180gb.lbl` | 4,574 |
| `cartOrder_part_0002/cartorder\megr00n180gb.xml` | 15,209 |
| `cartOrder_part_0002/cartorder\megr90n000gb.hdr` | 1,062 |
| `cartOrder_part_0002/cartorder\megr90n000gb.img` | 132,710,400 |
| `cartOrder_part_0002/cartorder\megr90n000gb.lbl` | 4,579 |
| `cartOrder_part_0002/cartorder\megr90n000gb.xml` | 15,228 |
| `cartOrder_part_0002/cartorder\megr90n180gb.hdr` | 1,058 |
| `cartOrder_part_0002/cartorder\megr90n180gb.img` | 132,710,400 |
| `cartOrder_part_0002/cartorder\megr90n180gb.lbl` | 4,576 |
| `cartOrder_part_0002/cartorder\megr90n180gb.xml` | 15,218 |
| `cartOrder_part_0002/cartorder\megt00n000gb.hdr` | 1,041 |
| `cartOrder_part_0002/cartorder\megt00n000gb.img` | 132,710,400 |
| `cartOrder_part_0002/cartorder\megt00n000gb.lbl` | 4,822 |
| `cartOrder_part_0002/cartorder\megt00n000gb.xml` | 15,510 |
| `cartOrder_part_0002/readme_split_volume.txt` | 853 |
| `cartOrder_part_0002.tar` | 730,050,560 |
| `cartOrder_part_0002_manifest.txt` | 1,572 |
| `cartOrder_part_0003/cartorder\megc00n000hb.hdr` | 1,026 |
| `cartOrder_part_0003/cartorder\megc00n000hb.img` | 64,880,640 |
| `cartOrder_part_0003/cartorder\megc00n000hb.lbl` | 3,086 |
| `cartOrder_part_0003/cartorder\megc00n000hb.xml` | 13,850 |
| `cartOrder_part_0003/cartorder\megc00n090hb.hdr` | 1,026 |
| `cartOrder_part_0003/cartorder\megc00n090hb.img` | 64,880,640 |
| `cartOrder_part_0003/cartorder\megc00n090hb.lbl` | 3,088 |
| `cartOrder_part_0003/cartorder\megc00n090hb.xml` | 13,851 |
| `cartOrder_part_0003/cartorder\megc00n180hb.hdr` | 1,022 |
| `cartOrder_part_0003/cartorder\megc00n180hb.img` | 64,880,640 |
| `cartOrder_part_0003/cartorder\megc00n180hb.lbl` | 3,085 |
| `cartOrder_part_0003/cartorder\megc00n180hb.xml` | 13,841 |
| `cartOrder_part_0003/cartorder\megc00n270hb.hdr` | 1,027 |
| `cartOrder_part_0003/cartorder\megc00n270hb.img` | 64,880,640 |
| `cartOrder_part_0003/cartorder\megc00n270hb.lbl` | 3,090 |
| `cartOrder_part_0003/cartorder\megc00n270hb.xml` | 13,851 |
| `cartOrder_part_0003/cartorder\megc44n000hb.hdr` | 1,029 |
| `cartOrder_part_0003/cartorder\megc44n000hb.img` | 64,880,640 |
| `cartOrder_part_0003/cartorder\megc44n000hb.lbl` | 3,088 |
| `cartOrder_part_0003/cartorder\megc44n000hb.xml` | 13,859 |
| `cartOrder_part_0003/cartorder\megt00n180gb.hdr` | 1,055 |
| `cartOrder_part_0003/cartorder\megt00n180gb.img` | 132,710,400 |
| `cartOrder_part_0003/cartorder\megt00n180gb.lbl` | 4,820 |
| `cartOrder_part_0003/cartorder\megt00n180gb.xml` | 15,500 |
| `cartOrder_part_0003/cartorder\megt90n000gb.hdr` | 1,062 |
| `cartOrder_part_0003/cartorder\megt90n000gb.img` | 132,710,400 |
| `cartOrder_part_0003/cartorder\megt90n000gb.lbl` | 4,824 |
| `cartOrder_part_0003/cartorder\megt90n000gb.xml` | 15,519 |
| `cartOrder_part_0003/cartorder\megt90n180gb.hdr` | 1,058 |
| `cartOrder_part_0003/cartorder\megt90n180gb.img` | 132,710,400 |
| `cartOrder_part_0003/cartorder\megt90n180gb.lbl` | 4,820 |
| `cartOrder_part_0003/cartorder\megt90n180gb.xml` | 15,509 |
| `cartOrder_part_0003/readme_split_volume.txt` | 853 |
| `cartOrder_part_0003.tar` | 722,718,720 |
| `cartOrder_part_0003_manifest.txt` | 2,076 |
| `cartOrder_part_0004/cartorder\megc44n090hb.hdr` | 999 |
| `cartOrder_part_0004/cartorder\megc44n090hb.img` | 64,880,640 |
| `cartOrder_part_0004/cartorder\megc44n090hb.lbl` | 3,090 |
| `cartOrder_part_0004/cartorder\megc44n090hb.xml` | 13,860 |
| `cartOrder_part_0004/cartorder\megc44n180hb.hdr` | 1,025 |
| `cartOrder_part_0004/cartorder\megc44n180hb.img` | 64,880,640 |
| `cartOrder_part_0004/cartorder\megc44n180hb.lbl` | 3,087 |
| `cartOrder_part_0004/cartorder\megc44n180hb.xml` | 13,850 |
| `cartOrder_part_0004/cartorder\megc44n270hb.hdr` | 1,030 |
| `cartOrder_part_0004/cartorder\megc44n270hb.img` | 64,880,640 |
| `cartOrder_part_0004/cartorder\megc44n270hb.lbl` | 3,092 |
| `cartOrder_part_0004/cartorder\megc44n270hb.xml` | 13,860 |
| `cartOrder_part_0004/cartorder\megc44s000hb.hdr` | 1,030 |
| `cartOrder_part_0004/cartorder\megc44s000hb.img` | 64,880,640 |
| `cartOrder_part_0004/cartorder\megc44s000hb.lbl` | 3,092 |
| `cartOrder_part_0004/cartorder\megc44s000hb.xml` | 13,863 |
| `cartOrder_part_0004/cartorder\megc44s090hb.hdr` | 1,030 |
| `cartOrder_part_0004/cartorder\megc44s090hb.img` | 64,880,640 |
| `cartOrder_part_0004/cartorder\megc44s090hb.lbl` | 3,094 |
| `cartOrder_part_0004/cartorder\megc44s090hb.xml` | 13,864 |
| `cartOrder_part_0004/cartorder\megc44s180hb.hdr` | 1,026 |
| `cartOrder_part_0004/cartorder\megc44s180hb.img` | 64,880,640 |
| `cartOrder_part_0004/cartorder\megc44s180hb.lbl` | 3,091 |
| `cartOrder_part_0004/cartorder\megc44s180hb.xml` | 13,854 |
| `cartOrder_part_0004/cartorder\megc44s270hb.hdr` | 1,031 |
| `cartOrder_part_0004/cartorder\megc44s270hb.img` | 64,880,640 |
| `cartOrder_part_0004/cartorder\megc44s270hb.lbl` | 3,096 |
| `cartOrder_part_0004/cartorder\megc44s270hb.xml` | 13,864 |
| `cartOrder_part_0004/cartorder\megc88n000hb.hdr` | 1,030 |
| `cartOrder_part_0004/cartorder\megc88n000hb.img` | 64,880,640 |
| `cartOrder_part_0004/cartorder\megc88n000hb.lbl` | 3,090 |
| `cartOrder_part_0004/cartorder\megc88n000hb.xml` | 13,860 |
| `cartOrder_part_0004/cartorder\megc88n090hb.hdr` | 1,030 |
| `cartOrder_part_0004/cartorder\megc88n090hb.img` | 64,880,640 |
| `cartOrder_part_0004/cartorder\megc88n090hb.lbl` | 3,092 |
| `cartOrder_part_0004/cartorder\megc88n090hb.xml` | 13,861 |
| `cartOrder_part_0004/cartorder\megc88n180hb.hdr` | 1,026 |
| `cartOrder_part_0004/cartorder\megc88n180hb.img` | 64,880,640 |
| `cartOrder_part_0004/cartorder\megc88n180hb.lbl` | 3,089 |
| `cartOrder_part_0004/cartorder\megc88n180hb.xml` | 13,851 |
| `cartOrder_part_0004/cartorder\megc88n270hb.hdr` | 1,031 |
| `cartOrder_part_0004/cartorder\megc88n270hb.img` | 64,880,640 |
| `cartOrder_part_0004/cartorder\megc88n270hb.lbl` | 3,094 |
| `cartOrder_part_0004/cartorder\megc88n270hb.xml` | 13,861 |
| `cartOrder_part_0004/cartorder\megr00n000hb.hdr` | 1,026 |
| `cartOrder_part_0004/cartorder\megr00n000hb.img` | 129,761,280 |
| `cartOrder_part_0004/cartorder\megr00n000hb.lbl` | 4,573 |
| `cartOrder_part_0004/cartorder\megr00n000hb.xml` | 15,213 |
| `cartOrder_part_0004/readme_split_volume.txt` | 853 |
| `cartOrder_part_0004.tar` | 843,714,560 |
| `cartOrder_part_0004_manifest.txt` | 3,084 |
| `cartOrder_part_0005/cartorder\megr00n090hb.hdr` | 1,026 |
| `cartOrder_part_0005/cartorder\megr00n090hb.img` | 129,761,280 |
| `cartOrder_part_0005/cartorder\megr00n090hb.lbl` | 4,575 |
| `cartOrder_part_0005/cartorder\megr00n090hb.xml` | 15,214 |
| `cartOrder_part_0005/cartorder\megr00n180hb.hdr` | 1,022 |
| `cartOrder_part_0005/cartorder\megr00n180hb.img` | 129,761,280 |
| `cartOrder_part_0005/cartorder\megr00n180hb.lbl` | 4,572 |
| `cartOrder_part_0005/cartorder\megr00n180hb.xml` | 15,204 |
| `cartOrder_part_0005/cartorder\megr00n270hb.hdr` | 1,027 |
| `cartOrder_part_0005/cartorder\megr00n270hb.img` | 129,761,280 |
| `cartOrder_part_0005/cartorder\megr00n270hb.lbl` | 4,577 |
| `cartOrder_part_0005/cartorder\megr00n270hb.xml` | 15,214 |
| `cartOrder_part_0005/cartorder\megr44n000hb.hdr` | 1,029 |
| `cartOrder_part_0005/cartorder\megr44n000hb.img` | 129,761,280 |
| `cartOrder_part_0005/cartorder\megr44n000hb.lbl` | 4,575 |
| `cartOrder_part_0005/cartorder\megr44n000hb.xml` | 15,222 |
| `cartOrder_part_0005/cartorder\megr44n090hb.hdr` | 999 |
| `cartOrder_part_0005/cartorder\megr44n090hb.img` | 129,761,280 |
| `cartOrder_part_0005/cartorder\megr44n090hb.lbl` | 4,577 |
| `cartOrder_part_0005/cartorder\megr44n090hb.xml` | 15,223 |
| `cartOrder_part_0005/cartorder\megr44n180hb.hdr` | 1,025 |
| `cartOrder_part_0005/cartorder\megr44n180hb.img` | 129,761,280 |
| `cartOrder_part_0005/cartorder\megr44n180hb.lbl` | 4,574 |
| `cartOrder_part_0005/cartorder\megr44n180hb.xml` | 15,213 |
| `cartOrder_part_0005/readme_split_volume.txt` | 853 |
| `cartOrder_part_0005.tar` | 778,711,040 |
| `cartOrder_part_0005_manifest.txt` | 1,572 |
| `cartOrder_part_0006/cartorder\megr44n270hb.hdr` | 1,030 |
| `cartOrder_part_0006/cartorder\megr44n270hb.img` | 129,761,280 |
| `cartOrder_part_0006/cartorder\megr44n270hb.lbl` | 4,579 |
| `cartOrder_part_0006/cartorder\megr44n270hb.xml` | 15,223 |
| `cartOrder_part_0006/cartorder\megr44s000hb.hdr` | 1,030 |
| `cartOrder_part_0006/cartorder\megr44s000hb.img` | 129,761,280 |
| `cartOrder_part_0006/cartorder\megr44s000hb.lbl` | 4,579 |
| `cartOrder_part_0006/cartorder\megr44s000hb.xml` | 15,226 |
| `cartOrder_part_0006/cartorder\megr44s090hb.hdr` | 1,030 |
| `cartOrder_part_0006/cartorder\megr44s090hb.img` | 129,761,280 |
| `cartOrder_part_0006/cartorder\megr44s090hb.lbl` | 4,581 |
| `cartOrder_part_0006/cartorder\megr44s090hb.xml` | 15,227 |
| `cartOrder_part_0006/cartorder\megr44s180hb.hdr` | 1,026 |
| `cartOrder_part_0006/cartorder\megr44s180hb.img` | 129,761,280 |
| `cartOrder_part_0006/cartorder\megr44s180hb.lbl` | 4,578 |
| `cartOrder_part_0006/cartorder\megr44s180hb.xml` | 15,217 |
| `cartOrder_part_0006/cartorder\megr44s270hb.hdr` | 1,031 |
| `cartOrder_part_0006/cartorder\megr44s270hb.img` | 129,761,280 |
| `cartOrder_part_0006/cartorder\megr44s270hb.lbl` | 4,583 |
| `cartOrder_part_0006/cartorder\megr44s270hb.xml` | 15,227 |
| `cartOrder_part_0006/cartorder\megr88n000hb.hdr` | 1,030 |
| `cartOrder_part_0006/cartorder\megr88n000hb.img` | 129,761,280 |
| `cartOrder_part_0006/cartorder\megr88n000hb.lbl` | 4,577 |
| `cartOrder_part_0006/cartorder\megr88n000hb.xml` | 15,223 |
| `cartOrder_part_0006/readme_split_volume.txt` | 853 |
| `cartOrder_part_0006.tar` | 778,711,040 |
| `cartOrder_part_0006_manifest.txt` | 1,572 |
| `cartOrder_part_0007/cartorder\megr88n090hb.hdr` | 1,030 |
| `cartOrder_part_0007/cartorder\megr88n090hb.img` | 129,761,280 |
| `cartOrder_part_0007/cartorder\megr88n090hb.lbl` | 4,579 |
| `cartOrder_part_0007/cartorder\megr88n090hb.xml` | 15,224 |
| `cartOrder_part_0007/cartorder\megr88n180hb.hdr` | 1,026 |
| `cartOrder_part_0007/cartorder\megr88n180hb.img` | 129,761,280 |
| `cartOrder_part_0007/cartorder\megr88n180hb.lbl` | 4,576 |
| `cartOrder_part_0007/cartorder\megr88n180hb.xml` | 15,214 |
| `cartOrder_part_0007/cartorder\megr88n270hb.hdr` | 1,031 |
| `cartOrder_part_0007/cartorder\megr88n270hb.img` | 129,761,280 |
| `cartOrder_part_0007/cartorder\megr88n270hb.lbl` | 4,581 |
| `cartOrder_part_0007/cartorder\megr88n270hb.xml` | 15,224 |
| `cartOrder_part_0007/cartorder\megt00n000hb.hdr` | 1,026 |
| `cartOrder_part_0007/cartorder\megt00n000hb.img` | 129,761,280 |
| `cartOrder_part_0007/cartorder\megt00n000hb.lbl` | 4,818 |
| `cartOrder_part_0007/cartorder\megt00n000hb.xml` | 15,504 |
| `cartOrder_part_0007/cartorder\megt00n090hb.hdr` | 1,026 |
| `cartOrder_part_0007/cartorder\megt00n090hb.img` | 129,761,280 |
| `cartOrder_part_0007/cartorder\megt00n090hb.lbl` | 4,820 |
| `cartOrder_part_0007/cartorder\megt00n090hb.xml` | 15,505 |
| `cartOrder_part_0007/cartorder\megt00n180hb.hdr` | 1,022 |
| `cartOrder_part_0007/cartorder\megt00n180hb.img` | 129,761,280 |
| `cartOrder_part_0007/cartorder\megt00n180hb.lbl` | 4,817 |
| `cartOrder_part_0007/cartorder\megt00n180hb.xml` | 15,495 |
| `cartOrder_part_0007/readme_split_volume.txt` | 853 |
| `cartOrder_part_0007.tar` | 778,721,280 |
| `cartOrder_part_0007_manifest.txt` | 1,572 |
| `cartOrder_part_0008/cartorder\megt00n270hb.hdr` | 1,027 |
| `cartOrder_part_0008/cartorder\megt00n270hb.img` | 129,761,280 |
| `cartOrder_part_0008/cartorder\megt00n270hb.lbl` | 4,822 |
| `cartOrder_part_0008/cartorder\megt00n270hb.xml` | 15,505 |
| `cartOrder_part_0008/cartorder\megt44n000hb.hdr` | 1,029 |
| `cartOrder_part_0008/cartorder\megt44n000hb.img` | 129,761,280 |
| `cartOrder_part_0008/cartorder\megt44n000hb.lbl` | 4,820 |
| `cartOrder_part_0008/cartorder\megt44n000hb.xml` | 15,513 |
| `cartOrder_part_0008/cartorder\megt44n090hb.hdr` | 999 |
| `cartOrder_part_0008/cartorder\megt44n090hb.img` | 129,761,280 |
| `cartOrder_part_0008/cartorder\megt44n090hb.lbl` | 4,822 |
| `cartOrder_part_0008/cartorder\megt44n090hb.xml` | 15,514 |
| `cartOrder_part_0008/cartorder\megt44n180hb.hdr` | 1,025 |
| `cartOrder_part_0008/cartorder\megt44n180hb.img` | 129,761,280 |
| `cartOrder_part_0008/cartorder\megt44n180hb.lbl` | 4,819 |
| `cartOrder_part_0008/cartorder\megt44n180hb.xml` | 15,504 |
| `cartOrder_part_0008/cartorder\megt44n270hb.hdr` | 1,030 |
| `cartOrder_part_0008/cartorder\megt44n270hb.img` | 129,761,280 |
| `cartOrder_part_0008/cartorder\megt44n270hb.lbl` | 4,824 |
| `cartOrder_part_0008/cartorder\megt44n270hb.xml` | 15,514 |
| `cartOrder_part_0008/cartorder\megt44s000hb.hdr` | 1,030 |
| `cartOrder_part_0008/cartorder\megt44s000hb.img` | 129,761,280 |
| `cartOrder_part_0008/cartorder\megt44s000hb.lbl` | 4,824 |
| `cartOrder_part_0008/cartorder\megt44s000hb.xml` | 15,517 |
| `cartOrder_part_0008/readme_split_volume.txt` | 853 |
| `cartOrder_part_0008.tar` | 778,721,280 |
| `cartOrder_part_0008_manifest.txt` | 1,572 |
| `cartOrder_part_0009/cartorder\megt44s090hb.hdr` | 1,030 |
| `cartOrder_part_0009/cartorder\megt44s090hb.img` | 129,761,280 |
| `cartOrder_part_0009/cartorder\megt44s090hb.lbl` | 4,826 |
| `cartOrder_part_0009/cartorder\megt44s090hb.xml` | 15,518 |
| `cartOrder_part_0009/cartorder\megt44s180hb.hdr` | 1,026 |
| `cartOrder_part_0009/cartorder\megt44s180hb.img` | 129,761,280 |
| `cartOrder_part_0009/cartorder\megt44s180hb.lbl` | 4,823 |
| `cartOrder_part_0009/cartorder\megt44s180hb.xml` | 15,508 |
| `cartOrder_part_0009/cartorder\megt44s270hb.hdr` | 1,031 |
| `cartOrder_part_0009/cartorder\megt44s270hb.img` | 129,761,280 |
| `cartOrder_part_0009/cartorder\megt44s270hb.lbl` | 4,828 |
| `cartOrder_part_0009/cartorder\megt44s270hb.xml` | 15,518 |
| `cartOrder_part_0009/cartorder\megt88n000hb.hdr` | 1,030 |
| `cartOrder_part_0009/cartorder\megt88n000hb.img` | 129,761,280 |
| `cartOrder_part_0009/cartorder\megt88n000hb.lbl` | 4,822 |
| `cartOrder_part_0009/cartorder\megt88n000hb.xml` | 15,514 |
| `cartOrder_part_0009/cartorder\megt88n090hb.hdr` | 1,030 |
| `cartOrder_part_0009/cartorder\megt88n090hb.img` | 129,761,280 |
| `cartOrder_part_0009/cartorder\megt88n090hb.lbl` | 4,824 |
| `cartOrder_part_0009/cartorder\megt88n090hb.xml` | 15,515 |
| `cartOrder_part_0009/cartorder\megt88n180hb.hdr` | 1,026 |
| `cartOrder_part_0009/cartorder\megt88n180hb.img` | 129,761,280 |
| `cartOrder_part_0009/cartorder\megt88n180hb.lbl` | 4,821 |
| `cartOrder_part_0009/cartorder\megt88n180hb.xml` | 15,505 |
| `cartOrder_part_0009/readme_split_volume.txt` | 853 |
| `cartOrder_part_0009.tar` | 778,721,280 |
| `cartOrder_part_0009_manifest.txt` | 1,572 |
| `cartOrder_part_0010/cartorder\megc_n_128.hdr` | 992 |
| `cartOrder_part_0010/cartorder\megc_n_128.img` | 104,857,600 |
| `cartOrder_part_0010/cartorder\megc_n_128.lbl` | 2,954 |
| `cartOrder_part_0010/cartorder\megc_n_128.xml` | 12,941 |
| `cartOrder_part_0010/cartorder\megc_n_256.hdr` | 1,040 |
| `cartOrder_part_0010/cartorder\megc_n_256.img` | 132,710,400 |
| `cartOrder_part_0010/cartorder\megc_n_256.lbl` | 2,953 |
| `cartOrder_part_0010/cartorder\megc_n_256.xml` | 12,939 |
| `cartOrder_part_0010/cartorder\megc_n_512.hdr` | 1,040 |
| `cartOrder_part_0010/cartorder\megc_n_512.img` | 150,994,944 |
| `cartOrder_part_0010/cartorder\megc_n_512.lbl` | 2,954 |
| `cartOrder_part_0010/cartorder\megc_n_512.xml` | 12,939 |
| `cartOrder_part_0010/cartorder\megc_s_128.hdr` | 1,047 |
| `cartOrder_part_0010/cartorder\megc_s_128.img` | 104,857,600 |
| `cartOrder_part_0010/cartorder\megc_s_128.lbl` | 2,957 |
| `cartOrder_part_0010/cartorder\megc_s_128.xml` | 12,944 |
| `cartOrder_part_0010/cartorder\megc_s_256.hdr` | 1,042 |
| `cartOrder_part_0010/cartorder\megc_s_256.img` | 132,710,400 |
| `cartOrder_part_0010/cartorder\megc_s_256.lbl` | 2,957 |
| `cartOrder_part_0010/cartorder\megc_s_256.xml` | 12,940 |
| `cartOrder_part_0010/cartorder\megt88n270hb.hdr` | 1,031 |
| `cartOrder_part_0010/cartorder\megt88n270hb.img` | 129,761,280 |
| `cartOrder_part_0010/cartorder\megt88n270hb.lbl` | 4,826 |
| `cartOrder_part_0010/cartorder\megt88n270hb.xml` | 15,515 |
| `cartOrder_part_0010/readme_split_volume.txt` | 853 |
| `cartOrder_part_0010.tar` | 756,019,200 |
| `cartOrder_part_0010_manifest.txt` | 1,532 |
| `cartOrder_part_0011/cartorder\megc_s_512.hdr` | 1,042 |
| `cartOrder_part_0011/cartorder\megc_s_512.img` | 150,994,944 |
| `cartOrder_part_0011/cartorder\megc_s_512.lbl` | 2,957 |
| `cartOrder_part_0011/cartorder\megc_s_512.xml` | 12,942 |
| `cartOrder_part_0011/cartorder\megr_n_128.hdr` | 1,005 |
| `cartOrder_part_0011/cartorder\megr_n_128.img` | 419,430,400 |
| `cartOrder_part_0011/cartorder\megr_n_128.lbl` | 4,046 |
| `cartOrder_part_0011/cartorder\megr_n_128.xml` | 14,179 |
| `cartOrder_part_0011/cartorder\megr_n_256.hdr` | 1,029 |
| `cartOrder_part_0011/cartorder\megr_n_256.img` | 530,841,600 |
| `cartOrder_part_0011/cartorder\megr_n_256.lbl` | 4,045 |
| `cartOrder_part_0011/cartorder\megr_n_256.xml` | 14,179 |
| `cartOrder_part_0011/readme_split_volume.txt` | 853 |
| `cartOrder_part_0011.tar` | 1,101,332,480 |
| `cartOrder_part_0011_manifest.txt` | 792 |
| `cartOrder_part_0012/cartorder\megr_n_512.hdr` | 1,041 |
| `cartOrder_part_0012/cartorder\megr_n_512.img` | 603,979,776 |
| `cartOrder_part_0012/cartorder\megr_n_512.lbl` | 4,046 |
| `cartOrder_part_0012/cartorder\megr_n_512.xml` | 14,177 |
| `cartOrder_part_0012/cartorder\megr_s_128.hdr` | 1,043 |
| `cartOrder_part_0012/cartorder\megr_s_128.img` | 419,430,400 |
| `cartOrder_part_0012/cartorder\megr_s_128.lbl` | 4,026 |
| `cartOrder_part_0012/cartorder\megr_s_128.xml` | 14,160 |
| `cartOrder_part_0012/readme_split_volume.txt` | 853 |
| `cartOrder_part_0012.tar` | 1,023,457,280 |
| `cartOrder_part_0012_manifest.txt` | 548 |
| `cartOrder_part_0013/cartorder\megr_s_256.hdr` | 1,043 |
| `cartOrder_part_0013/cartorder\megr_s_256.img` | 530,841,600 |
| `cartOrder_part_0013/cartorder\megr_s_256.lbl` | 4,184 |
| `cartOrder_part_0013/cartorder\megr_s_256.xml` | 14,160 |
| `cartOrder_part_0013/cartorder\megr_s_512.hdr` | 1,043 |
| `cartOrder_part_0013/cartorder\megr_s_512.img` | 603,979,776 |
| `cartOrder_part_0013/cartorder\megr_s_512.lbl` | 4,028 |
| `cartOrder_part_0013/cartorder\megr_s_512.xml` | 14,158 |
| `cartOrder_part_0013/readme_split_volume.txt` | 853 |
| `cartOrder_part_0013.tar` | 1,134,868,480 |
| `cartOrder_part_0013_manifest.txt` | 548 |
| `cartOrder_part_0014/cartorder\megt_n_128_1.hdr` | 992 |
| `cartOrder_part_0014/cartorder\megt_n_128_1.img` | 209,715,200 |
| `cartOrder_part_0014/cartorder\megt_n_128_1.lbl` | 3,874 |
| `cartOrder_part_0014/cartorder\megt_n_128_1.xml` | 13,701 |
| `cartOrder_part_0014/cartorder\megt_n_256_1.hdr` | 1,040 |
| `cartOrder_part_0014/cartorder\megt_n_256_1.img` | 265,420,800 |
| `cartOrder_part_0014/cartorder\megt_n_256_1.lbl` | 3,873 |
| `cartOrder_part_0014/cartorder\megt_n_256_1.xml` | 13,697 |
| `cartOrder_part_0014/cartorder\megt_n_512_1.hdr` | 1,040 |
| `cartOrder_part_0014/cartorder\megt_n_512_1.img` | 301,989,888 |
| `cartOrder_part_0014/cartorder\megt_n_512_1.lbl` | 3,874 |
| `cartOrder_part_0014/cartorder\megt_n_512_1.xml` | 13,699 |
| `cartOrder_part_0014/readme_split_volume.txt` | 853 |
| `cartOrder_part_0014.tar` | 777,195,520 |
| `cartOrder_part_0014_manifest.txt` | 816 |
| `cartOrder_part_0015/cartorder\megt_s_128_1.hdr` | 1,047 |
| `cartOrder_part_0015/cartorder\megt_s_128_1.img` | 209,715,200 |
| `cartOrder_part_0015/cartorder\megt_s_128_1.lbl` | 3,877 |
| `cartOrder_part_0015/cartorder\megt_s_128_1.xml` | 13,704 |
| `cartOrder_part_0015/cartorder\megt_s_256_1.hdr` | 1,042 |
| `cartOrder_part_0015/cartorder\megt_s_256_1.img` | 265,420,800 |
| `cartOrder_part_0015/cartorder\megt_s_256_1.lbl` | 3,877 |
| `cartOrder_part_0015/cartorder\megt_s_256_1.xml` | 13,700 |
| `cartOrder_part_0015/cartorder\megt_s_512_1.hdr` | 1,042 |
| `cartOrder_part_0015/cartorder\megt_s_512_1.img` | 301,989,888 |
| `cartOrder_part_0015/cartorder\megt_s_512_1.lbl` | 3,877 |
| `cartOrder_part_0015/cartorder\megt_s_512_1.xml` | 13,702 |
| `cartOrder_part_0015/readme_split_volume.txt` | 853 |
| `cartOrder_part_0015.tar` | 777,195,520 |
| `cartOrder_part_0015_manifest.txt` | 816 |
| `download_urls.txt` | 3,028 |
| `odecarthtmllist.htm` | 204,974 |

## Appendix D. Manifest and archive validation

| Manifest | Matching entries | Failures |
| --- | --- | --- |
| ODECartHTMLList_manifest.txt | 1 | 0 |
| cartOrder_manifest.txt | 60 | 0 |
| cartOrder_part_0002_manifest.txt | 25 | 0 |
| cartOrder_part_0003_manifest.txt | 33 | 0 |
| cartOrder_part_0004_manifest.txt | 49 | 0 |
| cartOrder_part_0005_manifest.txt | 25 | 0 |
| cartOrder_part_0006_manifest.txt | 25 | 0 |
| cartOrder_part_0007_manifest.txt | 25 | 0 |
| cartOrder_part_0008_manifest.txt | 25 | 0 |
| cartOrder_part_0009_manifest.txt | 25 | 0 |
| cartOrder_part_0010_manifest.txt | 25 | 0 |
| cartOrder_part_0011_manifest.txt | 13 | 0 |
| cartOrder_part_0012_manifest.txt | 9 | 0 |
| cartOrder_part_0013_manifest.txt | 9 | 0 |
| cartOrder_part_0014_manifest.txt | 13 | 0 |
| cartOrder_part_0015_manifest.txt | 13 | 0 |

| Archive | Regular members matching extracted bytes | Failures |
| --- | --- | --- |
| ODECartHTMLList.tar | 1 | 0 |
| cartOrder.tar | 60 | 0 |
| cartOrder_part_0002.tar | 25 | 0 |
| cartOrder_part_0003.tar | 33 | 0 |
| cartOrder_part_0004.tar | 49 | 0 |
| cartOrder_part_0005.tar | 25 | 0 |
| cartOrder_part_0006.tar | 25 | 0 |
| cartOrder_part_0007.tar | 25 | 0 |
| cartOrder_part_0008.tar | 25 | 0 |
| cartOrder_part_0009.tar | 25 | 0 |
| cartOrder_part_0010.tar | 25 | 0 |
| cartOrder_part_0011.tar | 13 | 0 |
| cartOrder_part_0012.tar | 9 | 0 |
| cartOrder_part_0013.tar | 9 | 0 |
| cartOrder_part_0014.tar | 13 | 0 |
| cartOrder_part_0015.tar | 13 | 0 |

