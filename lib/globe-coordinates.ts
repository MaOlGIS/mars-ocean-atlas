import { wrapLongitude } from './ocean.ts';
/** Right-handed Mars frame: north +Y, 0°E +X, 90°E -Z. East appears right from 0°E. */
export function globePoint(latitude:number,longitude:number):[number,number,number] {
  const lat=latitude*Math.PI/180,lon=wrapLongitude(longitude)*Math.PI/180;
  const radius=Math.abs(latitude)===90?0:Math.cos(lat);
  return [radius*Math.cos(lon),Math.sin(lat),-radius*Math.sin(lon)];
}
export function globeLocation([x,y,z]:readonly number[]) {
  const length=Math.hypot(x,y,z);
  return {latitude:Math.asin(Math.max(-1,Math.min(1,y/length)))*180/Math.PI,longitude:wrapLongitude(Math.atan2(-z,x)*180/Math.PI)};
}
export function globeScale(height:number,distance:number,fov=45){return 2*Math.PI*height/(2*Math.tan(fov*Math.PI/360)*Math.max(.1,distance-1));}
export function globeLevel(scale:number,maxZoom:number){return Math.max(0,Math.min(maxZoom,Math.ceil(Math.log2(scale/360))));}
/** Conservative spherical cap includes tile edges near the apparent limb, including poles. */
export function visibleGlobeTile(z:number,x:number,y:number,camera:readonly number[]) {
  const n=2**z,p=globePoint(90-(y+.5)*180/n,(x+.5)*180/n),distance=Math.hypot(...camera);
  const dot=p.reduce((sum,v,i)=>sum+v*camera[i]/distance,0);
  return z===0||dot>=Math.cos(Math.min(Math.PI,Math.acos(1/distance)+Math.PI/n));
}
