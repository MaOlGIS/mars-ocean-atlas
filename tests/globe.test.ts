import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {globePoint,globeLocation,globeLevel,visibleGlobeTile} from '../lib/globe-coordinates.ts';
import {globeTileGeometry} from '../lib/globe-geometry.ts';
import {layoutLabels,groups,type View} from '../lib/labels.ts';
const close=(a:number,b:number)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('Mars Cartesian orientation, poles, longitude seam and catalog coordinates',()=>{
 assert.deepEqual(globePoint(90,0),[0,1,-0]);assert.deepEqual(globePoint(-90,0),[0,-1,-0]);
 close(globePoint(0,0)[0],1);close(globePoint(0,90)[2],-1);
 assert.deepEqual(globePoint(30,0),globePoint(30,360));
 for(const f of JSON.parse(readFileSync('public/nomenclature/mars.json','utf8')).features){const p=globePoint(f.latitude,f.longitude),l=globeLocation(p);close(Math.hypot(...p),1);close(l.latitude,f.latitude);close(l.longitude,f.longitude);}
});
test('tile geometry points outwards and shares identical vertices across LOD, poles and seam',()=>{
 const root=globeTileGeometry(0,0,0),child=globeTileGeometry(4,0,0),other=globeTileGeometry(0,1,0);
 const rp=root.getAttribute('position'),cp=child.getAttribute('position'),op=other.getAttribute('position');
 for(let row=0;row<=8;row++)for(let col=0;col<=8;col++)for(let axis=0;axis<3;axis++)assert.equal(cp.array[(row*9+col)*3+axis],rp.array[(row*129+col)*3+axis]);
 for(let row=0;row<=128;row++)for(let axis=0;axis<3;axis++){assert.equal(rp.array[(row*129+128)*3+axis],op.array[row*129*3+axis]);assert.equal(rp.array[row*129*3+axis],op.array[(row*129+128)*3+axis]);}
 const idx=root.getIndex()!,i=6*129,a=new THREE.Vector3().fromBufferAttribute(rp,idx.getX(i)),b=new THREE.Vector3().fromBufferAttribute(rp,idx.getX(i+1)),c=new THREE.Vector3().fromBufferAttribute(rp,idx.getX(i+2));
 assert(b.clone().sub(a).cross(c.clone().sub(a)).dot(a)>0);
 root.dispose();child.dispose();other.dispose();
});
test('conservative tile visibility includes limb and both poles; globe labels reject far side',()=>{
 for(const latitude of [-89,-45,0,45,89]){
  const camera=globePoint(latitude,260).map(v=>v*3.8);
  for(let z=0;z<=4;z++){const n=2**z;for(let y=0;y<n;y++)for(let x=0;x<2*n;x++){
   for(const dy of [0,.5,1])for(const dx of [0,.5,1]){const p=globePoint(90-(y+dy)*180/n,(x+dx)*180/n);if(p.reduce((sum,v,i)=>sum+v*camera[i],0)>1)assert(visibleGlobeTile(z,x,y,camera));}
  }}
 }
 assert.equal(globeLevel(359,4),0);assert.equal(globeLevel(361,4),1);assert.equal(globeLevel(100000,4),4);
 const features=JSON.parse(readFileSync('public/nomenclature/mars.json','utf8')).features.slice(0,2);
 const view:View={x:0,y:0,scale:20000,width:500,height:500,kind:'globe',project:()=>null};
 assert.deepEqual(layoutLabels(features,view,new Set(groups),()=>100),[]);
});
