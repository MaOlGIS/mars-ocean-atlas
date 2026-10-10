import * as THREE from 'three';
import {globePoint} from './globe-coordinates.ts';

/** All LODs use one common 256×128 spherical vertex lattice, including exact polar vertices. */
export function globeTileGeometry(z:number,x:number,y:number){
  const n=2**z,segments=128/n,positions:number[]=[],uv:number[]=[],indices:number[]=[];
  for(let row=0;row<=segments;row++)for(let col=0;col<=segments;col++){
    const latitude=90-(y*segments+row)*180/128,longitude=(x*segments+col)*360/256;
    positions.push(...globePoint(latitude,longitude));uv.push(col/segments,row/segments);
  }
  for(let row=0;row<segments;row++)for(let col=0;col<segments;col++){
    const a=row*(segments+1)+col,b=a+1,c=a+segments+1,d=c+1;indices.push(a,c,b,b,c,d);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('tileUV',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeBoundingSphere();return geometry;
}

