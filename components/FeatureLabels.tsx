'use client';
import { useEffect, useRef, useState } from 'react';
import { groups, groupOf, layoutLabels, type Feature, type Catalog, type View, type Group, type Label, type Box } from '@/lib/labels';
import { coordinates } from '@/lib/ocean';

export default function FeatureLabels({view,onLocate}:{view:View;onLocate:(feature:Feature)=>void}) {
  const root=useRef<HTMLDivElement>(null),previous=useRef(new Set<string>()),widths=useRef(new Map<string,number>());
  const [catalog,setCatalog]=useState<Catalog|null>(null),[error,setError]=useState('');
  const [enabled,setEnabled]=useState(true),[filters,setFilters]=useState(new Set<Group>(groups));
  const [selected,setSelected]=useState<Feature|null>(null),[query,setQuery]=useState(''),[expanded,setExpanded]=useState(false);
  const [labels,setLabels]=useState<Label[]>([]);
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/nomenclature/mars.json',{signal:controller.signal}).then(async r=>{
      if(!r.ok)throw new Error('Feature names could not load. Reload to retry.');
      const data:Catalog=await r.json();
      if(data.version!==1||data.body!=='Mars'||data.latitudeType!=='planetocentric'||data.longitudeDirection!=='east'||!Array.isArray(data.features))throw new Error('Unsupported planetary feature coordinates.');
      setCatalog(data);
    }).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return ()=>controller.abort();
  },[]);
  useEffect(()=>{
    if(!root.current||!catalog||!enabled){setLabels([]);previous.current.clear();return;}
    const stage=root.current.parentElement!,rect=stage.querySelector('canvas')!.getBoundingClientRect();
    const obstacles:Box[]=[];
    for(const element of stage.querySelectorAll('.map-title,.simulation-panel,.legend-panel,.inspection-card,.map-actions,.map-footer,.label-controls,.feature-popup')){
      const b=element.getBoundingClientRect();obstacles.push({left:b.left-rect.left-6,top:b.top-rect.top-6,right:b.right-rect.left+6,bottom:b.bottom-rect.top+6});
    }
    const context=document.createElement('canvas').getContext('2d')!;context.font='600 12px Arial';
    const measure=(name:string)=>{
      if(!widths.current.has(name))widths.current.set(name,context.measureText(name).width);
      return widths.current.get(name)!;
    };
    const next=layoutLabels(catalog.features,view,filters,measure,previous.current,obstacles,selected?.id);
    previous.current=new Set(next.map(l=>l.key));setLabels(next);
  },[view,catalog,enabled,filters,selected,expanded,query]);
  useEffect(()=>{
    if(!selected)return;
    const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setSelected(null);};
    window.addEventListener('keydown',close);return ()=>window.removeEventListener('keydown',close);
  },[selected]);
  const search=query.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const matches=search?catalog?.features.filter(f=>f.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(search)).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,8):[];
  const choose=(f:Feature)=>{setSelected(f);setEnabled(true);setFilters(old=>new Set([...old,groupOf(f)]));setQuery('');setExpanded(false);onLocate(f);};
  return <div ref={root} className="feature-layer" style={{width:view.width,height:view.height}}>
    {enabled&&labels.map(label=><button key={label.key} className="feature-label" data-feature-id={label.feature.id} data-longitude={label.feature.longitude} data-latitude={label.feature.latitude} style={{left:label.x,top:label.y,width:label.box.right-label.box.left}} aria-label={`Feature: ${label.feature.name}`} onClick={()=>setSelected(label.feature)}>{label.feature.name}</button>)}
    <aside className="label-controls" aria-label="Geographical feature controls">
      <div className="label-control-heading"><label><input type="checkbox" checked={enabled} onChange={e=>{setEnabled(e.target.checked);if(!e.target.checked)setSelected(null);}}/> Feature labels</label><button aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>Find & filter</button></div>
      {expanded&&<div className="label-options">
        <label htmlFor="feature-search">Find a Martian feature</label><input id="feature-search" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Olympus Mons…"/>
        {search&&<ul aria-label="Feature search results">{matches?.map(f=><li key={f.id}><button onClick={()=>choose(f)}>{f.name}<small>{f.type}</small></button></li>)}{!matches?.length&&<li>No matching features</li>}</ul>}
        <fieldset><legend>Feature types</legend>{groups.map(group=><label key={group}><input type="checkbox" checked={filters.has(group)} onChange={e=>setFilters(old=>{const next=new Set(old);if(e.target.checked)next.add(group);else next.delete(group);return next;})}/>{group}</label>)}</fieldset>
        <p>Names remain visible under hypothetical oceans.</p>
      </div>}
      <a className="label-attribution" href="https://planetarynames.wr.usgs.gov/GIS_Downloads" target="_blank" rel="noreferrer">Names: USGS / IAU Gazetteer ↗</a>
      {error&&<p role="status">{error}</p>}
    </aside>
    {selected&&enabled&&<section className="feature-popup" role="region" aria-label="Geographical feature information">
      <button className="feature-close" aria-label="Close feature information" onClick={()=>setSelected(null)}>×</button>
      <h3>{selected.name}</h3><p>{selected.type}</p><p>{coordinates(selected.latitude,selected.longitude)}<br/><small>Planetocentric · positive east</small></p>
      <p>{selected.sizeKm?`Approximate diameter / longest dimension: ${selected.sizeKm.toLocaleString('en-US')} km`:'Dimensions unavailable'}</p>
      {selected.bounds&&<p className="feature-extents">Approximate extents: {selected.bounds[1]}° to {selected.bounds[3]}° latitude; {selected.bounds[0]}°E to {selected.bounds[2]}°E longitude.</p>}
      <a href={`https://planetarynames.wr.usgs.gov/Feature/${selected.id}`} target="_blank" rel="noreferrer">Official feature record ↗</a>
    </section>}
  </div>;
}
