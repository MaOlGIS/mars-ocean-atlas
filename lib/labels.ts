export type Feature = { id:number; name:string; type:string; code:string; longitude:number; latitude:number; sizeKm:number|null; bounds:[number,number,number,number]|null; approved:string };
export type Catalog = {version:number; body:string; latitudeType:string; longitudeDirection:string; attribution:string; features:Feature[]};
export type View = {x:number;y:number;scale:number;width:number;height:number;kind?:'globe';project?:(latitude:number,longitude:number)=>{x:number;y:number}|null};
export type Box = {left:number;top:number;right:number;bottom:number};
export type Label = {feature:Feature; key:string; x:number;y:number;box:Box};
export const groups=['Mountains','Valleys','Plains','Craters','Other'] as const;
export type Group=typeof groups[number];
export function groupOf(f:Feature):Group {
  if(['MO','TH','DO'].includes(f.code))return 'Mountains';
  if(['VA','CH','FO'].includes(f.code))return 'Valleys';
  if(['PL','PM'].includes(f.code))return 'Plains';
  if(f.code==='AA')return 'Craters';
  return 'Other';
}
// Rank only affects cartographic prominence; it is not a scientific classification.
const landmarks=new Set(['Olympus Mons','Valles Marineris','Hellas Planitia']);
export function importance(f:Feature){return (landmarks.has(f.name)?100:0)+({Mountains:5,Valleys:4,Plains:5,Craters:1,Other:0}[groupOf(f)])+Math.log2(Math.max(1,f.sizeKm||0));}
export function minimumScale(f:Feature) {
  if(landmarks.has(f.name))return 180;
  const size=f.sizeKm||0,group=groupOf(f);
  if(size>=1500&&group!=='Other')return 450;
  if(size>=400&&['Mountains','Valleys','Plains'].includes(group))return 700;
  if(group==='Craters'&&size>=400)return 900;
  if(size>=200)return 1500;
  if(size>=50)return 3000;
  if(size>=10)return 6000;
  return 12000;
}
export function intersects(a:Box,b:Box){return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;}
export function origin(view:View){return {x:(view.width-(view.width>850?330:0))/2,y:view.height/2-25};}
export function projectFeature(f:Feature,view:View,copy=0){const o=origin(view);return {x:o.x+(f.longitude/360+copy-view.x)*view.scale,y:o.y+((90-f.latitude)/360-view.y)*view.scale};}
/** Stable priority, fixed measured typography, and scale hysteresis avoid LOD threshold chatter. */
export function layoutLabels(features:Feature[],view:View,enabled:Set<Group>,measure:(name:string)=>number,previous:Set<string>=new Set(),obstacles:Box[]=[],selected?:number):Label[]{
  const o=origin(view),left=(0-o.x)/view.scale+view.x,right=(view.width-o.x)/view.scale+view.x;
  const occupied=[...obstacles],result:Label[]=[],previousIds=new Set([...previous].map(key=>Number(key.split(':')[0])));
  for(const f of [...features].filter(f=>enabled.has(groupOf(f))).sort((a,b)=>(a.id===selected?-1:b.id===selected?1:importance(b)-importance(a)||a.id-b.id))){
    const width=measure(f.name)+12,height=24,threshold=minimumScale(f);
    for(let copy=view.project?0:Math.ceil(left-f.longitude/360);copy<=(view.project?0:Math.floor(right-f.longitude/360));copy++){
      const key=`${f.id}:${copy}`;
      if(f.id!==selected&&view.scale<threshold*(previousIds.has(f.id)?.92:1))continue;
      const point=view.project?view.project(f.latitude,f.longitude):projectFeature(f,view,copy);if(!point)continue;
      const {x,y}=point,box={left:x-width/2,top:y-height/2,right:x+width/2,bottom:y+height/2};
      if(box.left<8||box.right>view.width-8||box.top<8||box.bottom>view.height-36)continue;
      // Screen-space clearance includes a 4px cartographic breathing margin.
      const padded={left:box.left-4,top:box.top-4,right:box.right+4,bottom:box.bottom+4};
      if(occupied.some(b=>intersects(padded,b)))continue;
      occupied.push(padded);result.push({feature:f,key,x,y,box});
    }
  }
  return result;
}
