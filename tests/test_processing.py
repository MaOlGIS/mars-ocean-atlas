import json, math, unittest
from pathlib import Path
import numpy as np
from PIL import Image
from scripts.process_mola import row_cell_areas, distribution, coverage_at, encode, decode, RADIUS_M

ROOT = Path(__file__).resolve().parents[1]
class Mathematics(unittest.TestCase):
    def test_exact_spherical_area_and_pole_weighting(self):
        areas = row_cell_areas(360,180)
        self.assertAlmostEqual(float(areas.sum()*360/(4*math.pi*RADIUS_M**2)),1,places=12)
        self.assertLess(areas[0],areas[90]*.01)
        self.assertAlmostEqual(areas[0],areas[-1],places=2)
    def test_strict_threshold_and_discrete_quantile(self):
        grid = np.array([[-1,-1],[2,2],[5,5],[8,8]],dtype=np.float32)
        levels,cdf,water,coverage,bin_fraction=distribution(grid)
        self.assertEqual(coverage_at(levels,cdf,-1),0)
        self.assertAlmostEqual(coverage_at(levels,cdf,2), (1-math.sin(math.pi/4))/2)
        self.assertEqual(coverage_at(levels,cdf,9),1)
        self.assertGreaterEqual(coverage,.71)
        self.assertLess(coverage_at(levels,cdf,water-.125),.71)
        self.assertGreater(bin_fraction,0)
    def test_lossless_quarter_meter_encoding(self):
        elevation=np.array([[-8208,-.25,0],[.25,1377.125,21249]],dtype=np.float32)
        # Fractional water thresholds are not raster heights; raster heights are quarter meters.
        elevation[1,1]=1377.25
        shade=np.array([[0,1,127],[128,200,255]],dtype=np.uint8)
        np.testing.assert_array_equal(decode(encode(elevation,shade)),elevation)

@unittest.skipUnless((ROOT/'derived/elevation.npy').exists(),'Regenerate data for integration checks')
class ProcessedData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data=json.loads((ROOT/'public/data/manifest.json').read_text())
        cls.elevation=np.load(ROOT/'derived/elevation.npy',mmap_mode='r')
        cls.quality=np.load(ROOT/'derived/quality.npy',mmap_mode='r')
    def test_global_complete_and_both_caps(self):
        h,w=self.elevation.shape
        self.assertEqual((w,h),(self.data['width'],self.data['height']))
        self.assertTrue(np.isfinite(self.elevation).all())
        self.assertTrue(np.all(self.quality[:2*self.data['ppd']]>=2))
        self.assertTrue(np.all(self.quality[-2*self.data['ppd']:]>=2))
        self.assertTrue(np.all(self.quality[2*self.data['ppd']:-2*self.data['ppd']]<2))
    def test_independent_weighted_71_percent_and_monotonic(self):
        areas=row_cell_areas(self.data['width'],self.data['height'])
        total=4*math.pi*RADIUS_M**2
        measured=float(np.sum((self.elevation<self.data['defaultWaterM']).sum(axis=1)*areas)/total*100)
        self.assertAlmostEqual(measured,self.data['defaultCoverage'],places=9)
        self.assertGreaterEqual(measured,71)
        self.assertLess(measured-71,self.data['defaultBinAreaPercent']+1e-8)
        self.assertLess(abs(measured-71),.1)
        self.assertTrue(np.all(np.diff(self.data['cumulative'])>0))
        self.assertEqual(coverage_at(np.array(self.data['elevations']),np.array(self.data['cumulative']),self.data['waterMinimumM']),0)
        self.assertEqual(coverage_at(np.array(self.data['elevations']),np.array(self.data['cumulative']),self.data['waterMaximumM']),100)
    def test_numeric_click_tile_matches_global_grid(self):
        size=self.data['tileSize'];x,y=min(17,2**(self.data['maxZoom']+1)-1),min(9,2**self.data['maxZoom']-1)
        values=np.fromfile(ROOT/f'public/data/samples/{x}/{y}.f32',dtype='<f4').reshape(size,size)
        np.testing.assert_array_equal(values,self.elevation[y*size:(y+1)*size,x*size:(x+1)*size])
    def test_tile_roundtrip_and_longitude_edges(self):
        size=self.data['tileSize'];z=self.data['maxZoom']
        for x,y in [(0,0),(2**(z+1)-1,2**z-1),(min(17,2**(z+1)-1),min(9,2**z-1))]:
            encoded=np.array(Image.open(ROOT/f'public/data/tiles/{z}/{x}/{y}.png'))
            np.testing.assert_array_equal(decode(encoded),self.elevation[y*size:(y+1)*size,x*size:(x+1)*size])
        self.assertTrue(self.data['validation']['sourceFilesUnchanged'])
        for p in self.data['validation']['polarOverlap']:
            self.assertLess(p['median_abs_difference_m'],250)
if __name__=='__main__':unittest.main()
