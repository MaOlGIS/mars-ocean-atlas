#!/usr/bin/env python3
"""Build a deterministic, area-weighted Mars prototype without writing to PDS sources."""
from __future__ import annotations
import argparse, hashlib, json, math, tempfile, time, xml.etree.ElementTree as ET
from pathlib import Path
import numpy as np
from PIL import Image
from osgeo import gdal, osr

gdal.UseExceptions()
gdal.SetConfigOption('GDAL_PAM_ENABLED', 'NO')
ROOT = Path(__file__).resolve().parents[1]
RADIUS_M = 3396000.0
TILE_SIZE = 180  # 2x1 root => native power-of-two ppd without a final resize
DTYPES = {'SignedMSB2': '>i2', 'UnsignedMSB2': '>u2', 'UnsignedByte': 'u1'}
ENCODING_OFFSET = 40000

def field(root, tag, default=None):
    return next((e.text for e in root.iter() if e.tag.rsplit('}', 1)[-1] == tag), default)

class Product:
    def __init__(self, path: Path):
        self.path = path
        self.root = ET.parse(path).getroot()
        self.name = field(self.root, 'file_name').removesuffix('.img')
        self.image = path.with_suffix('.img')
        axes = [e for e in self.root.iter() if e.tag.rsplit('}', 1)[-1] == 'Axis_Array']
        sizes = {field(a, 'axis_name'): int(field(a, 'elements')) for a in axes}
        self.width, self.height = sizes['Sample'], sizes['Line']
        self.dtype = np.dtype(DTYPES[field(self.root, 'data_type')])
        array = next(e for e in self.root.iter() if e.tag.rsplit('}', 1)[-1] == 'Array_2D_Image')
        self.offset = int(field(array, 'offset'))
        self.scale = float(field(array, 'scaling_factor', '1'))
        self.value_offset = float(field(array, 'value_offset', '0'))
        self.ppd = float(field(self.root, 'pixel_scale_x'))
        self.projection = field(self.root, 'map_projection_name')
        self.extent = [float(field(self.root, k)) for k in ('west_bounding_coordinate', 'east_bounding_coordinate', 'south_bounding_coordinate', 'north_bounding_coordinate')]
        self.radius = 1000 * float(field(self.root, 'a_axis_radius'))
        self.step = 1000 * float(field(self.root, 'pixel_resolution_x'))
        self.ulx = float(field(self.root, 'upperleft_corner_x'))
        self.uly = float(field(self.root, 'upperleft_corner_y'))
        self.special = [float(e.text) for e in array.iter() if e.tag.rsplit('}', 1)[-1].endswith('_constant')]
        expected = self.offset + self.width * self.height * self.dtype.itemsize
        if self.image.stat().st_size != expected:
            raise ValueError(f'{self.image}: expected {expected} bytes')
        self.raw = np.memmap(self.image, dtype=self.dtype, mode='r', offset=self.offset, shape=(self.height, self.width))

    def sample(self, lat, lon):
        if self.projection == 'Equirectangular':
            west, _, _, north = self.extent
            col = np.floor((lon - west) * self.ppd).astype(int)
            row = np.floor((north - lat) * self.ppd).astype(int)
        else:
            rho = 2 * self.radius * np.tan(np.deg2rad(90 - np.abs(lat)) / 2)
            x = rho * np.sin(np.deg2rad(lon))
            y = (-1 if self.extent[3] > 0 else 1) * rho * np.cos(np.deg2rad(lon))
            col = np.floor((x - self.ulx) / self.step).astype(int)
            row = np.floor((self.uly - y) / self.step).astype(int)
        if np.any(row < 0) or np.any(row >= self.height) or np.any(col < 0) or np.any(col >= self.width):
            raise ValueError(f'Out-of-bounds sample in {self.name}')
        raw = self.raw[row, col]
        if not np.isfinite(raw).all() or any(np.any(raw == x) for x in self.special):
            raise ValueError(f'Missing source samples in {self.name}; refusing to fill')
        return raw.astype(np.float32) * self.scale + self.value_offset

    def validate_driver(self, stage):
        for suffix in ('.xml', '.img', '.lbl', '.hdr'):
            src = self.path.with_suffix(suffix)
            dst = stage / (self.name + suffix)
            if not dst.exists():
                dst.symlink_to(src.resolve())
        ds = gdal.OpenEx(str(stage / (self.name + '.xml')), gdal.OF_RASTER | gdal.OF_READONLY, allowed_drivers=['PDS4'])
        if ds.GetDriver().ShortName != 'PDS4' or (ds.RasterXSize, ds.RasterYSize) != (self.width, self.height):
            raise ValueError(f'Incorrect driver/dimensions for {self.name}')
        np.testing.assert_array_equal(ds.GetRasterBand(1).ReadAsArray(0, 0, 2, 2), self.raw[:2, :2])
        np.testing.assert_allclose(ds.GetGeoTransform(), (self.ulx, self.step, 0, self.uly, 0, -self.step), atol=1e-6)
        ds = None


def row_cell_areas(width, height, radius=RADIUS_M):
    """Exact spherical area of each longitude cell, by row, in square meters."""
    edges = np.linspace(math.pi / 2, -math.pi / 2, height + 1)
    return radius ** 2 * (2 * math.pi / width) * (np.sin(edges[:-1]) - np.sin(edges[1:]))


def distribution(elevation, radius=RADIUS_M):
    h, w = elevation.shape
    areas = row_cell_areas(w, h, radius)
    codes = np.rint(elevation * 4).astype(np.int32)
    low, high = int(codes.min()), int(codes.max())
    hist = np.zeros(high - low + 1, dtype=np.float64)
    for row in range(h):
        hist += np.bincount(codes[row] - low, minlength=len(hist)) * areas[row]
    occupied = np.flatnonzero(hist)
    levels = (occupied + low) / 4
    area = hist[occupied]
    cumulative = np.cumsum(area) / (4 * math.pi * radius ** 2)
    assert np.all(np.diff(cumulative) > 0)
    assert abs(cumulative[-1] - 1) < 2e-12
    cumulative[-1] = 1.0
    index = int(np.searchsorted(cumulative, 0.71, side='left'))
    water = float(levels[index] + 0.125)  # strictly below H, includes the crossing bin
    return levels, cumulative, water, float(cumulative[index]), float(area[index] / (4 * math.pi * radius ** 2))


def coverage_at(levels, cumulative, height):
    index = int(np.searchsorted(levels, height, side='left')) - 1
    return 0.0 if index < 0 else float(cumulative[index])


def hillshade(elevation):
    """Four light directions, true spherical ground spacings, no height exaggeration."""
    h, w = elevation.shape
    lat = np.deg2rad(90 - (np.arange(h) + .5) * 180 / h)
    dx = RADIUS_M * (2 * math.pi / w) * np.cos(lat)
    dy = RADIUS_M * math.pi / h
    east_gradient = (np.roll(elevation, -1, axis=1) - np.roll(elevation, 1, axis=1)) / (2 * dx[:, None])
    north_gradient = -np.gradient(elevation, dy, axis=0)
    denominator = np.sqrt(1 + east_gradient ** 2 + north_gradient ** 2)
    result = np.zeros(elevation.shape, dtype=np.float32)
    for az in (225, 270, 315, 360):
        azimuth, altitude = math.radians(az), math.radians(45)
        light = (-east_gradient * math.sin(azimuth) * math.cos(altitude)
                 - north_gradient * math.cos(azimuth) * math.cos(altitude) + math.sin(altitude)) / denominator
        result += np.clip(light, 0, 1).astype(np.float32) / 4
    return np.rint(np.clip(result, 0, 1) * 255).astype(np.uint8)


def encode(elevation, shade):
    code = np.rint(elevation * 4 + ENCODING_OFFSET).astype(np.uint32)
    assert np.all(code > 0) and np.all(code < 2 ** 24)
    return np.stack(((code >> 16) & 255, (code >> 8) & 255, code & 255, shade), axis=-1).astype(np.uint8)


def decode(encoded):
    a = encoded.astype(np.uint32)
    return ((a[..., 0] * 65536 + a[..., 1] * 256 + a[..., 2]).astype(np.float32) - ENCODING_OFFSET) / 4


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as f:
        while block := f.read(8 * 1024 * 1024):
            digest.update(block)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / '20261009T122401589809')
    parser.add_argument('--ppd', type=int, choices=(4, 8, 16, 32), default=16)
    parser.add_argument('--output', type=Path, default=ROOT / 'public/data')
    parser.add_argument('--derived', type=Path, default=ROOT / 'derived')
    args = parser.parse_args()
    audit = ROOT / 'MOLA_DATASET_AUDIT.md'
    if not audit.exists() or 'PARTIALLY READY' not in audit.read_text():
        raise ValueError('Read and preserve MOLA_DATASET_AUDIT.md before processing')
    source = args.source.resolve()
    for output in (args.output.resolve(), args.derived.resolve()):
        if output == source or source in output.parents:
            raise ValueError('Outputs must be outside the original dataset')
    original = {p: (p.stat().st_size, p.stat().st_mtime_ns) for p in source.rglob('*') if p.is_file()}
    args.output.mkdir(parents=True, exist_ok=True)
    args.derived.mkdir(parents=True, exist_ok=True)
    by_name = {field(ET.parse(p).getroot(), 'file_name').removesuffix('.img'): p for p in source.rglob('*.xml')}
    selected_names = sorted(n for n in by_name if n.startswith('megt') and n.endswith('hb'))
    selected_names += ['megt_n_512_1', 'megt_s_512_1']
    if len(selected_names) != 18:
        raise ValueError('Expected 16 cylindrical and 2 polar topography products')
    products = [Product(by_name[n]) for n in selected_names]
    counts = {p.name: Product(by_name[p.name.replace('megt', 'megc').removesuffix('_1')]) for p in products}
    with tempfile.TemporaryDirectory(prefix='mola-stage-') as d:
        for p in products + list(counts.values()):
            p.validate_driver(Path(d))
    print('Validated 36 PDS4 topography/count products; originals opened read-only.', flush=True)
    w, h = 360 * args.ppd, 180 * args.ppd
    elevation = np.full((h, w), np.nan, dtype=np.float32)
    quality = np.full((h, w), 255, dtype=np.uint8)  # 0=interpolated,1=observed,2=polar interpolated,3=polar observed
    lon = (np.arange(w) + .5) / args.ppd
    lat = 90 - (np.arange(h) + .5) / args.ppd
    for p in products:
        q = counts[p.name]
        if (q.width, q.height, q.projection, q.ppd, q.extent) != (p.width, p.height, p.projection, p.ppd, p.extent):
            raise ValueError(f'Count geometry differs: {q.name}')
        if p.projection == 'Equirectangular':
            west, east, south, north = p.extent
            rows = np.flatnonzero((lat <= north) & (lat > south))
            cols = np.flatnonzero((lon >= west) & (lon < east))
        else:
            rows = np.flatnonzero(lat > 88 if p.name.startswith('megt_n') else lat < -88)
            cols = np.arange(w)
        for rr in np.array_split(rows, max(1, math.ceil(len(rows) / 64))):
            if not len(rr):
                continue
            yy, xx = np.meshgrid(lat[rr], lon[cols], indexing='ij')
            values = p.sample(yy, xx)
            observations = q.sample(yy, xx)
            if np.isfinite(elevation[np.ix_(rr, cols)]).any():
                raise ValueError('Unexpected overlapping output cells')
            elevation[np.ix_(rr, cols)] = values
            quality[np.ix_(rr, cols)] = (observations > 0).astype(np.uint8) + (2 if p.projection != 'Equirectangular' else 0)
        print(f'Sampled {p.name}', flush=True)
    if not np.isfinite(elevation).all() or np.any(quality == 255):
        raise ValueError('Incomplete global grid; refusing to interpolate missing cells')
    if not (-8300 < elevation.min() < -7000 and 18000 < elevation.max() < 22000):
        raise ValueError('Elevation range sanity check failed')
    # Independently compare polar coordinates against catalog arctangent inverse.
    alignment = []
    for pole in ('n', 's'):
        p = next(x for x in products if x.name == f'megt_{pole}_512_1')
        sign = 1 if pole == 'n' else -1
        samples = []
        for longitude in range(0, 360, 5):
            latitude = 87.5 * sign
            cylindrical = next(x for x in products if x.projection == 'Equirectangular' and x.extent[0] <= longitude < x.extent[1] and x.extent[2] <= latitude < x.extent[3])
            a, b = float(p.sample(np.array(latitude), np.array(longitude))), float(cylindrical.sample(np.array(latitude), np.array(longitude)))
            samples.append(a - b)
        median = float(np.median(np.abs(samples)))
        if median > 250:
            raise ValueError(f'Polar registration sanity check failed: {pole}, median {median} m')
        alignment.append({'pole': pole, 'latitude': 87.5 * sign, 'samples': len(samples), 'median_abs_difference_m': median, 'max_abs_difference_m': float(np.max(np.abs(samples)))})
    levels, cumulative, water, fraction, bin_fraction = distribution(elevation)
    np.save(args.derived / 'elevation.npy', elevation, allow_pickle=False)
    np.save(args.derived / 'quality.npy', quality, allow_pickle=False)
    # Authoritative derived raster with custom Mars georeferencing.
    ds = gdal.GetDriverByName('GTiff').Create(str(args.derived / 'mars-elevation.tif'), w, h, 1, gdal.GDT_Float32,
        options=['TILED=YES', 'COMPRESS=DEFLATE', 'PREDICTOR=3'])
    srs = osr.SpatialReference()
    srs.ImportFromProj4('+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=180 +R=3396000 +units=m +type=crs')
    step = math.pi * RADIUS_M / (180 * args.ppd)
    ds.SetProjection(srs.ExportToWkt())
    ds.SetGeoTransform((-math.pi * RADIUS_M, step, 0, math.pi * RADIUS_M / 2, 0, -step))
    ds.GetRasterBand(1).SetUnitType('m')
    ds.GetRasterBand(1).WriteArray(elevation)
    ds.SetMetadata({'HEIGHT_REFERENCE': 'MOLA GMM3 (mgm1025), degree/order 50 areoid', 'SAMPLING': 'Nearest source cell, no missing-cell interpolation', 'PIXEL_CONVENTION': 'Area'})
    ds.FlushCache(); ds = None
    shade = hillshade(elevation)
    max_zoom = int(math.log2(args.ppd))
    tile_count = 0
    # Each lower level is a nested nearest subset; no invented mean heights/coastlines.
    for z in range(max_zoom + 1):
        factor = 2 ** (max_zoom - z)
        overview = elevation[factor // 2::factor, factor // 2::factor]
        lighting = shade[factor // 2::factor, factor // 2::factor]
        for y in range(2 ** z):
            for x in range(2 ** (z + 1)):
                chunk = encode(overview[y*TILE_SIZE:(y+1)*TILE_SIZE, x*TILE_SIZE:(x+1)*TILE_SIZE], lighting[y*TILE_SIZE:(y+1)*TILE_SIZE, x*TILE_SIZE:(x+1)*TILE_SIZE])
                path = args.output / 'tiles' / str(z) / str(x) / f'{y}.png'
                path.parent.mkdir(parents=True, exist_ok=True)
                Image.fromarray(chunk).save(path, compress_level=6)
                tile_count += 1
        print(f'Encoded tile level {z}', flush=True)
    # Click-to-inspect numeric/quality chunks at maximum zoom, fetched individually.
    for y in range(2 ** max_zoom):
        for x in range(2 ** (max_zoom + 1)):
            ys, xs = slice(y*TILE_SIZE,(y+1)*TILE_SIZE), slice(x*TILE_SIZE,(x+1)*TILE_SIZE)
            path = args.output / 'samples' / str(x)
            path.mkdir(parents=True, exist_ok=True)
            elevation[ys,xs].astype('<f4').tofile(path / f'{y}.f32')
            quality[ys,xs].tofile(path / f'{y}.u8')
    rgba = encode(elevation[:180,:180], shade[:180,:180])
    np.testing.assert_array_equal(decode(rgba), elevation[:180,:180])
    np.testing.assert_allclose(row_cell_areas(w,h).sum()*w, 4*math.pi*RADIUS_M**2, rtol=1e-12)
    # Full grid independent boolean-mask check of the default ocean scenario.
    flooded = np.sum((elevation < water).sum(axis=1) * row_cell_areas(w,h)) / (4*math.pi*RADIUS_M**2)
    assert abs(flooded - fraction) < 1e-12
    input_records = []
    for p in products + list(counts.values()):
        input_records.append({'product':p.name,'label':str(p.path.relative_to(ROOT)) if p.path.is_relative_to(ROOT) else str(p.path), 'image':str(p.image.relative_to(ROOT)) if p.image.is_relative_to(ROOT) else str(p.image), 'image_sha256':sha256(p.image), 'label_sha256':sha256(p.path)})
    unchanged = all((p.stat().st_size,p.stat().st_mtime_ns)==s for p,s in original.items())
    if not unchanged:
        raise ValueError('Original dataset changed during processing')
    metadata = {
        'version':1,'width':w,'height':h,'ppd':args.ppd,'tileSize':TILE_SIZE,'maxZoom':max_zoom,
        'radiusM':RADIUS_M,'totalAreaKm2':4*math.pi*RADIUS_M**2/1e6,
        'minimumM':float(elevation.min()),'maximumM':float(elevation.max()),
        'waterMinimumM':float(elevation.min()),'waterMaximumM':float(elevation.max()+.125),
        'defaultWaterM':water,'defaultCoverage':fraction*100,'defaultTargetCoverage':71,
        'defaultBinAreaPercent':bin_fraction*100,'elevations':levels.tolist(),'cumulative':(cumulative*100).tolist(),
        'encoding':{'offset':ENCODING_OFFSET,'scale':4,'order':'RGB big-endian 24-bit elevation, A hillshade'},
        'sampling':'Nearest source cell; no interpolation; 128 ppd cylindrical with 512 ppd MEGT polar caps',
        'heightReference':'GMM3 (mgm1025), degree/order 50 Martian areoid',
        'pixelConvention':'Area, 0–360°E, north-to-south; equality H=z is exposed',
        'gridApproximationKm':step/1000,'tileCount':tile_count,
        'qualityPercent':{str(code):float(np.count_nonzero(quality==code)*100/elevation.size) for code in range(4)},
        'inputs':input_records,'auditSha256':sha256(audit),
        'validation':{'finiteCells':int(elevation.size),'missingCells':0,'sourceFilesUnchanged':unchanged,
            'areaClosureRelativeError':float(abs(row_cell_areas(w,h).sum()*w/(4*math.pi*RADIUS_M**2)-1)),
            'coverageDirectPercent':float(flooded*100),'polarOverlap':alignment,
            'capBoundaryMaxDeltaM':float(max(np.abs(elevation[int(2*args.ppd)]-elevation[int(2*args.ppd)-1]).max(),np.abs(elevation[-int(2*args.ppd)]-elevation[-int(2*args.ppd)-1]).max()))},
    }
    (args.output/'manifest.json').write_text(json.dumps(metadata,separators=(',',':')))
    summary = {k:v for k,v in metadata.items() if k not in ('elevations','cumulative')}
    (args.derived/'validation.json').write_text(json.dumps(summary,indent=2))
    print(json.dumps({'default_water_m':water,'coverage_percent':fraction*100,'grid':[w,h],'range_m':[float(elevation.min()),float(elevation.max())],'tiles':tile_count,'polar_overlap':alignment},indent=2),flush=True)

if __name__ == '__main__':
    main()
