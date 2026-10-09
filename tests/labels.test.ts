import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {layoutLabels,projectFeature,minimumScale,groups,intersects,type Catalog,type View} from '../lib/labels.ts';
const catalog:Catalog=JSON.parse(readFileSync('public/nomenclature/mars.json','utf8'));
const view:View={x:.5,y:.25,scale:1000,width:1440,height:1000};
const find=(name:string)=>catalog.features.find(f=>f.name===name)!;
const measure=(name:string)=>name.length*8;
test('Gazetteer snapshot preserves Mars conventions, identifiers, reference coordinates and extents',()=>{
 assert.equal(catalog.body,'Mars');assert.equal(catalog.latitudeType,'planetocentric');assert.equal(catalog.longitudeDirection,'east');
 assert.equal(catalog.features.length,2051);assert.equal(new Set(catalog.features.map(f=>f.id)).size,2051);
 for(const [name,id,lat,lon] of [['Olympus Mons',4453,18.6528,226.1975],['Valles Marineris',6288,-14.0059,301.4123],['Hellas Planitia',2432,-42.4301,70.5025]] as const){const f=find(name);assert.equal(f.id,id);assert.equal(f.latitude,lat);assert.equal(f.longitude,lon);assert(f.bounds);assert(f.sizeKm!>600);}
 for(const f of catalog.features){assert(f.longitude>=0&&f.longitude<360);assert(f.latitude>=-90&&f.latitude<=90);}
});
test('projection anchors use the terrain camera and periodic longitude copies',()=>{
 for(const name of ['Olympus Mons','Valles Marineris','Hellas Planitia']){
  const f=find(name),p=projectFeature(f,view);
  assert(Math.abs(p.x-((1440-330)/2+(f.longitude/360-.5)*1000))<1e-9);
  assert(Math.abs(p.y-(475+((90-f.latitude)/360-.25)*1000))<1e-9);
  assert(Math.abs(projectFeature(f,view,1).x-p.x-view.scale)<1e-9);
 }
 const f={...find('Olympus Mons'),longitude:359};
 assert(Math.abs(projectFeature(f,{...view,x:.001},-1).x-projectFeature(f,{...view,x:1.001}).x)<1e-9);
});
test('collision avoidance, type filtering, stable layout, zoom detail and hysteresis',()=>{
 const all=new Set(groups),labels=layoutLabels(catalog.features,view,all,measure);
 assert(labels.length>3);assert(labels.some(l=>l.feature.name==='Olympus Mons'));
 for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++)assert(!intersects(labels[i].box,labels[j].box));
 assert.deepEqual(labels,layoutLabels(catalog.features,view,all,measure,new Set(labels.map(l=>l.key))));
 assert.equal(layoutLabels(catalog.features,view,new Set(),measure).length,0);
 assert(layoutLabels(catalog.features,view,new Set(['Craters']),measure).every(l=>l.feature.code==='AA'));
 const tiny={...find('Olympus Mons'),id:999999,name:'Tiny example',sizeKm:5,code:'AA'};
 const threshold=minimumScale(tiny),camera={...view,x:tiny.longitude/360,y:(90-tiny.latitude)/360,scale:threshold};
 const active=layoutLabels([tiny],camera,all,measure);assert.equal(active.length,1);
 assert.equal(layoutLabels([tiny],{...camera,scale:threshold*.95},all,measure).length,0);
 assert.equal(layoutLabels([tiny],{...camera,scale:threshold*.95},all,measure,new Set(active.map(l=>l.key))).length,1);
 const obstacle=labels[0].box;
 assert(layoutLabels(catalog.features,view,all,measure,new Set(),[obstacle]).every(l=>!intersects(l.box,obstacle)));
});
