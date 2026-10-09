#!/usr/bin/env python3
"""Convert the official USGS Mars point Shapefile to planetary JSON (no Earth reprojection)."""
import argparse, hashlib, json, math, re, urllib.request, zipfile
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET
from osgeo import ogr

ROOT=Path(__file__).resolve().parents[1]
URL='https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MARS_nomenclature_center_pts.zip'

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--download',action='store_true',help='Explicitly refresh the official nightly snapshot')
    args=parser.parse_args()
    folder=ROOT/'derived/nomenclature';folder.mkdir(parents=True,exist_ok=True)
    archive=folder/'mars.zip'
    if args.download:
        with urllib.request.urlopen(URL,timeout=90) as response:archive.write_bytes(response.read())
    if not archive.exists():raise SystemExit('First run with --download')
    with zipfile.ZipFile(archive) as source:
        for name in source.namelist():
            if Path(name).name!=name:raise ValueError('Unexpected archive path')
        source.extractall(folder)
    metadata=ET.parse(folder/'metadata_nomenclature_points_MARS.xml').getroot()
    assert metadata.findtext('.//lattype')=='Planetocentric'
    assert metadata.findtext('.//londir')=='Positive East'
    ogr.UseExceptions()
    dataset=ogr.Open(str(folder/'MARS_nomenclature_center_pts.shp'));layer=dataset.GetLayer()
    assert 'Mars_2000' in layer.GetSpatialRef().ExportToWkt()
    fields=[layer.GetLayerDefn().GetFieldDefn(i).GetName() for i in range(layer.GetLayerDefn().GetFieldCount())]
    features=[];excluded=0
    for row in layer:
        p=row.items()
        if p['approval']!='Adopted by IAU':excluded+=1;continue
        lon,lat=p['center_lon'],p['center_lat'];g=row.GetGeometryRef()
        assert math.isfinite(lon) and math.isfinite(lat) and -90<=lat<=90 and 0<=lon<=360
        assert abs(g.GetX()-lon)<1e-8 and abs(g.GetY()-lat)<1e-8
        identifier=int(re.search(r'/Feature/(\d+)',p['link'])[1])
        bounds=[p['min_lon'],p['min_lat'],p['max_lon'],p['max_lat']]
        assert all(math.isfinite(v) for v in bounds)
        features.append({'id':identifier,'name':p['name'],'type':p['type'],'code':p['code'],
          'longitude':round(lon%360,7),'latitude':round(lat,7),
          'sizeKm':p['diameter'] if p['diameter']>0 else None,
          'bounds': [round(v,7) for v in bounds] if bounds!=[0,0,0,0] else None,
          'approved':p['approvaldt'].split(' ')[0]})
    unique={}
    for feature in features:
        if feature['id'] in unique:assert unique[feature['id']]==feature,'Conflicting duplicate feature ID'
        unique[feature['id']]=feature
    duplicates=len(features)-len(unique);features=sorted(unique.values(),key=lambda f:f['id'])
    catalog={'version':1,'body':'Mars','latitudeType':'planetocentric','longitudeDirection':'east','longitudeRange':[0,360],
      'attribution':'USGS / IAU Gazetteer of Planetary Nomenclature; NASA-supported',
      'source':URL,'retrieved':datetime.fromtimestamp(archive.stat().st_mtime,timezone.utc).isoformat(),'sourceSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),
      'sourceCrs':layer.GetSpatialRef().ExportToWkt(),'sourceFields':fields,'sourceCoverage':list(layer.GetExtent()),
      'duplicateRows':duplicates,'excludedUnapproved':excluded,'features':features}
    out=ROOT/'public/nomenclature';out.mkdir(exist_ok=True)
    (out/'mars.json').write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+'\n')
    print(f'{len(features)} approved features → {out}/mars.json')
if __name__=='__main__':main()
