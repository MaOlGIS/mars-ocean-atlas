import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { coverageAt, heightAt, cellAt, waterDepth } from '../lib/ocean.ts';
const data={elevations:[-8000,0,1000,20000],cumulative:[10,60,75,100],waterMinimumM:-8000,waterMaximumM:20000.125};
test('strict flooded threshold, endpoints, monotonicity',()=>{
  assert.equal(coverageAt(data,-8000),0);assert.equal(coverageAt(data,0),10);assert.equal(coverageAt(data,.125),60);assert.equal(coverageAt(data,20000.125),100);
  assert.equal(heightAt(data,0),-8000);assert.equal(heightAt(data,100),20000.125);
  for(let p=1;p<100;p++)assert.ok(coverageAt(data,heightAt(data,p))>=p);
});
test('longitude wrapping, poles and pixel boundaries',()=>{
  const grid={width:5760,height:2880,ppd:16};
  assert.deepEqual(cellAt(grid,90,360),{x:0,y:0});assert.deepEqual(cellAt(grid,-90,-.01),{x:5759,y:2879});
  assert.deepEqual(cellAt(grid,0,0),{x:0,y:1440});
  assert.equal(waterDepth(1000,-100),1100);assert.equal(waterDepth(1000,1500),0);
});
test('the shipped scenario uses the same inverse CDF as the UI',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../public/data/manifest.json',import.meta.url),'utf8'));
  assert.equal(heightAt(manifest,71),manifest.defaultWaterM);
  assert.ok(Math.abs(coverageAt(manifest,manifest.defaultWaterM)-manifest.defaultCoverage)<1e-10);
});
