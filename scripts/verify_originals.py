#!/usr/bin/env python3
"""Verify every supplied cart MD5 manifest without writing to the source dataset."""
import argparse, hashlib
from pathlib import Path

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,default=Path(__file__).resolve().parents[1]/'20261009T122401589809')
    args=parser.parse_args();source=args.source.resolve();checked=0
    manifests=sorted(source.glob('*_manifest.txt'))
    if not manifests:raise SystemExit('No ODE checksum manifests found')
    for manifest in manifests:
        directory=source if manifest.name=='ODECartHTMLList_manifest.txt' else source/manifest.name.removesuffix('_manifest.txt')
        for line in manifest.read_text().splitlines():
            expected,name=line.split(None,1)
            path=directory/name.strip()
            if not path.is_relative_to(source):raise SystemExit('Unexpected manifest path outside source directory')
            digest=hashlib.md5()
            with path.open('rb') as f:
                while block:=f.read(8*1024*1024):digest.update(block)
            if digest.hexdigest()!=expected:raise SystemExit(f'Checksum mismatch: {path}')
            checked+=1
    print(f'All {checked} supplied MD5 entries match; original data opened read-only.')
if __name__=='__main__':main()
