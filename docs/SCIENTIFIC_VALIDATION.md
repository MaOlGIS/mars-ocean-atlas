# Prototype scientific validation

The first generated run uses a 3,396 km reference sphere and a **5760 × 2880** global area-pixel grid. Its height values are nearest samples from 128 ppd MEGT over −88…+88°, and 512 ppd MEGT in both remaining polar caps. The default run does not use shape/radius products or the ambiguous polar shape formula.

## Measured results

| Check | Result |
| --- | --- |
| Complete output | 16,588,800 finite cells; zero missing cells |
| Latitude extent | Pixel edges +90° to −90°, including both caps |
| Longitude extent | Pixel edges 0° to 360°E; x wraps, y does not |
| Processed elevation range | −8,181 to +21,178 m above source areoid |
| Target 71% water elevation | +1,377.125 m |
| Actual flooded coverage | 71.0206954313891% |
| Previous elevation bin's coverage | 70.99850535660443% |
| Sphere area closure relative error | 0 at serialized float precision (tested tolerance 10⁻¹²) |
| Independent boolean-mask coverage | 71.02069543138903% |
| PDS4 read validations | 36 topography/count products, explicit driver and raw sample equality |
| Original files | Sizes/timestamps unchanged; no original file created or overwritten |
| Numeric tile encoding | Lossless at source quarter-meter precision |
| Visual levels | 682 total tiles at levels 0…4; 180 px each |

After application development, all **375** supplied ODE MD5 manifest entries were verified again, and the original tree still contained exactly **408** files. The original audit hash also matches the processing manifest.

The data generation manifest records the source image and label SHA-256 hashes and audit hash. All data are read with original big-endian interpretation, XML element scaling and offsets. `Special_Constants` are inspected; the supplied arrays have none. NoData is not inferred from zero-valued elevations or zero observation counts. Processing fails on actual missing samples.

## Alignment and polar transition checks

Pixel centers are selected from source bounding edges and resolution, following the area-pixel convention in `dsmap.cat`. Polar coordinates use the declared stereographic sphere and PDS4 transformations, with x=ρ sin(longitude), y=−ρ cos(longitude) north / +ρ cos(longitude) south. This handles the different hemisphere orientations. PDS4 driver transformations and dimensions are cross-checked against parsed metadata through temporary correctly named links; the raw NumPy samples match GDAL samples.

At ±87.5°, 72 overlapping positions per pole (5° longitude spacing) were sampled independently in the cylindrical and polar grids:

| Pole | Median absolute difference | Maximum absolute difference |
| --- | --- | --- |
| North | 104.50 m | 426.25 m |
| South | 127.75 m | 889.75 m |

These differences are significant and are **not** claimed to be an alignment certificate. The grids have different binning, interpolation, pixel locations and science production histories. The hemisphere/radius/transform checks establish consistency with supplied metadata; independent surveyed ground control or shot-level reconciliation was not available. The maximum difference between neighboring output rows straddling either ±88° join is **1,037.25 m**, which contains both natural terrain variation and cross-product differences. Heights are not blended to hide this. The cap join occupies a small region but should be revisited before scientific use of local polar heights. Some shoreline changes can occur at the join at particular water levels.

Known MOLA coordinate metadata was validated analytically and against the PDS4 reader. No comparison to an independent mission DTM, feature gazetteer, or absolute vertical reference was performed. This prototype is not a high-accuracy local terrain survey.

## Deliberate approximations

- Coverage is **reference-sphere** surface area, not relief-dependent physical surface area. The radius follows the MOLA map projection. Switching to another sphere changes area, though not the area-weighted percentage for the same latitude grid.
- The first prototype is nearest-sampled 16 ppd (~3.70 km meridional/equatorial cells), not a full-resolution 128 ppd ocean solution. Downsampling can miss narrow valleys, small islands, extrema or channels. Regenerate at 32 ppd to reduce this limitation; native/source detail still limits meaningful coastlines.
- All retained prototype elevations equal selected original sample values. Neither averaging nor bilinear interpolation is used to fabricate heights. Source MOLA interpolation is retained and quality-flagged. This does not make every prototype cell directly observed.
- The entire cell floods as one area element when its sample height is below H. Within-cell slopes/coastlines are not modeled. Finite equal-height bins make the inverse CDF nonunique between elevations and exact target percentages generally unattainable.
- The inverse selects the first cumulative bin meeting/exceeding the target. H is bin elevation +0.125 m, placing it between possible quarter-meter source levels. 0% uses H=min; 100% uses H=max+0.125. Equality to H remains exposed.
- GPU colors use nearest numeric samples, not interpolation of encoded RGB bytes. Coarser zoom levels are nested nearest subsets; the visible overview may omit small flooded cells included in the finest-grid statistics. Clicks and statistics always use the finest processed grid. Exact ±90° clicks clamp to the first/last cell center; there is no invented exact-pole height. Tile ancestors fill while child requests load.
- A one-cell coastline stroke highlights actual threshold changes within each displayed tile. It is not an independently surveyed vector shoreline.
- Hillshade uses spherical central differences with longitude wrap and latitude-dependent ground spacing. At the first and last rows, latitude derivatives are one-sided; exact-pole illumination is undefined. It is a cartographic shaded relief, not time-dependent solar illumination.
- Water fills disconnected depressions too. No climate, fluid, basin-connectivity or water-budget solver is present.

## UI and rendering checks

Automated Chromium tests cover synchronized sliders and reset, 0/100 endpoints, numeric clicked elevation, ocean depth updates, map zoom/wheel and fit, shading without altered coverage, scientific explanation, and mobile overflow. Screenshots are saved under `test-results` by those tests. An independent CPU calculation of palette and hillshade matched five sampled GPU screenshot pixels exactly (zero RGB channel error), including exposed land and submerged terrain. Numeric click results were independently compared to the underlying little-endian sample chunks, and changing ocean sliders issued no new visual-tile requests after initial loading. Hardware/browser performance may differ from the installed Chromium software-WebGL test environment.

The native WebGL renderer has no Earth geographic or EPSG assumptions. Its equirectangular map uses the full geographic domain including polar edges, with correct source-coordinate lookup. Any future globe will require separate areoid-to-renderer-height conversion and planetary body configuration; no globe height conversion is implied by this implementation.
