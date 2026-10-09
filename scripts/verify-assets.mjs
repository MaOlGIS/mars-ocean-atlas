// Deployment verification uses only browser assets, never original/derived rasters.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const exported = process.argv.includes('--export');
const root = exported ? 'out/data' : 'public/data';
const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8'));
const expected = ['manifest.json'];
assert.equal(manifest.width, 360 * manifest.ppd);
assert.equal(manifest.height, 180 * manifest.ppd);
assert.equal(manifest.width, manifest.tileSize * 2 ** (manifest.maxZoom + 1));
for (let z=0;z<=manifest.maxZoom;z++) for(let x=0;x<2**(z+1);x++) for(let y=0;y<2**z;y++) expected.push(`tiles/${z}/${x}/${y}.png`);
for(let x=0;x<manifest.width/manifest.tileSize;x++) for(let y=0;y<manifest.height/manifest.tileSize;y++) for(const suffix of ['f32','u8']) expected.push(`samples/${x}/${y}.${suffix}`);
async function files(dir, prefix='') {
  const result=[];
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    assert(!entry.isSymbolicLink(), `Unexpected asset symlink: ${prefix}${entry.name}`);
    if(entry.isDirectory()) result.push(...await files(`${dir}/${entry.name}`,`${prefix}${entry.name}/`));
    else result.push(`${prefix}${entry.name}`);
  }
  return result.sort();
}
assert.deepEqual(await files(root),expected.sort(),'Missing or unexpected browser assets');
const index={};let total=0;
for(const name of expected) {
  const bytes=await readFile(`${root}/${name}`);
  if(name.endsWith('.f32')) assert.equal(bytes.length,manifest.tileSize**2*4,name);
  if(name.endsWith('.u8')) assert.equal(bytes.length,manifest.tileSize**2,name);
  if(name.endsWith('.png')) {
    assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a',name);
    assert.equal(bytes.readUInt32BE(16),manifest.tileSize,name);
    assert.equal(bytes.readUInt32BE(20),manifest.tileSize,name);
    assert.equal(bytes[24],8,name);assert.equal(bytes[25],6,`${name}: numeric tiles must be RGBA`);
  }
  assert(bytes.length<50*1024**2,`${name}: GitHub file size warning`);
  index[name]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};total+=bytes.length;
}
if(process.argv.includes('--record')) {
  assert(!exported,'Record from public/data only');
  await writeFile('docs/browser-assets.json',JSON.stringify(index,null,2)+'\n');
} else assert.deepEqual(index,JSON.parse(await readFile('docs/browser-assets.json','utf8')),'Asset hashes differ: investigate, then explicitly record after validated regeneration');
if(exported) await readFile('out/index.html');
console.log(`${root}: verified ${expected.length} files, ${total} bytes, complete tile/sample matrix and SHA-256 hashes`);
const namesPath=exported?'out/nomenclature/mars.json':'public/nomenclature/mars.json';
const namesBytes=await readFile(namesPath),names=JSON.parse(namesBytes);
assert.equal(names.body,'Mars');assert.equal(names.latitudeType,'planetocentric');assert.equal(names.longitudeDirection,'east');
assert.equal(names.version,1);assert.equal(new Set(names.features.map(f=>f.id)).size,names.features.length);
for(const f of names.features){assert(f.name&&f.type&&f.code&&f.id>0);assert(f.longitude>=0&&f.longitude<360&&f.latitude>=-90&&f.latitude<=90);}
for(const [name,id,latitude,longitude] of [['Olympus Mons',4453,18.6528,226.1975],['Valles Marineris',6288,-14.0059,301.4123],['Hellas Planitia',2432,-42.4301,70.5025]]) {
 const f=names.features.find(f=>f.id===id);assert(f);assert.equal(f.name,name);assert.equal(f.latitude,latitude);assert.equal(f.longitude,longitude);
}
if(exported)assert.deepEqual(namesBytes,await readFile('public/nomenclature/mars.json'),'Gazetteer export must match the committed snapshot');
console.log(`${namesPath}: verified ${names.features.length} Mars feature names, ${namesBytes.length} bytes`);
