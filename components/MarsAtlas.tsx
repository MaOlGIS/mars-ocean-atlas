'use client';
import { useEffect, useRef, useState } from 'react';
import { coverageAt, heightAt, coordinates, signedMeters, waterDepth, type Manifest } from '@/lib/ocean';
import FeatureLabels from './FeatureLabels';
import { MarsRenderer, type Inspection, type Location } from '@/lib/renderer';

function Icon({ name }: { name: 'reset'|'plus'|'minus'|'fit'|'info'|'cross' }) {
  const paths = { reset: 'M3 10a8 8 0 1 1 2 8M3 4v6h6', plus: 'M12 5v14M5 12h14', minus: 'M5 12h14', fit:'M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5', info:'M12 11v6M12 7v.01', cross:'M6 6l12 12M18 6L6 18' };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{name==='info'&&<circle cx="12" cy="12" r="9"/>}<path d={paths[name]}/></svg>;
}
const areaText = (value: number) => `${(value / 1e6).toFixed(2)} million`;

export default function MarsAtlas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const rendererRef = useRef<MarsRenderer | null>(null);
  const [data, setData] = useState<Manifest | null>(null);
  const [water, setWater] = useState(0);
  const [shade, setShade] = useState(.85);
  const [grid, setGrid] = useState(true);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [status, setStatus] = useState('Loading planetary data…');
  const [error, setError] = useState('');
  const [about, setAbout] = useState(false);
  const [target, setTarget] = useState(71);
  const [view, setView] = useState({ x: .5, y: .25, scale: 1000, width: 1000, height: 600 });
  useEffect(() => {
    const controller = new AbortController();
    fetch('/data/manifest.json', { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error('Processed MOLA data is missing. Run npm run process:data and reload.');
      return response.json();
    }).then((manifest: Manifest) => {
      if (manifest.version!==1 || !manifest.width || !manifest.elevations?.length || manifest.elevations.length!==manifest.cumulative?.length) throw new Error('The processed data manifest is invalid. Regenerate it.');
      setData(manifest);setWater(manifest.defaultWaterM);
    }).catch(e => { if(!controller.signal.aborted)setError(e.message); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if(!data||!canvasRef.current)return;
    let renderer: MarsRenderer;
    try {
      renderer=new MarsRenderer(canvasRef.current,data);rendererRef.current=renderer;
      renderer.onLocation=setLocation;renderer.onInspect=result=>{setInspection(result);setError('');};
      renderer.onStatus=setStatus;renderer.onError=setError;
      renderer.onView=camera=>{const rect=canvasRef.current!.getBoundingClientRect();setView({...camera,width:rect.width,height:rect.height});};
    }catch(e){setError(e instanceof Error?e.message:'Map initialization failed');return;}
    return () => {renderer.destroy();rendererRef.current=null;};
  }, [data]);
  useEffect(()=>{rendererRef.current?.setScenario(water,shade,grid);},[water,shade,grid]);
  useEffect(() => {
    if (!about) return;
    const previous = document.activeElement as HTMLElement | null;
    const handleKey = (event: KeyboardEvent) => {
      if(event.key==='Escape')setAbout(false);
      if(event.key==='Tab'){
        const focusable=dialogRef.current?.querySelectorAll<HTMLElement>('button,a[href]');
        if(!focusable?.length)return;
        const first=focusable[0],last=focusable[focusable.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    };
    window.addEventListener('keydown',handleKey);
    return () => { window.removeEventListener('keydown',handleKey);previous?.focus(); };
  }, [about]);
  const coverage = data ? coverageAt(data,water) : 71;
  const originX=(view.width-(view.width>850?330:0))/2, originY=view.height/2-25;
  const project=(latitude:number,longitude:number)=>{
    let dx=longitude/360-view.x;dx-=Math.round(dx);
    return {x:originX+dx*view.scale,y:originY+((90-latitude)/360-view.y)*view.scale};
  };
  const marker=inspection?project(inspection.latitude,inspection.longitude):null;
  const reset=()=>{if(data){setWater(data.defaultWaterM);setTarget(71);}};
  const setCoverage=(percent:number)=>{if(data){setTarget(percent);setWater(heightAt(data,percent));}};
  const setHeight=(height:number)=>{setWater(height);setTarget(data?coverageAt(data,height):0);};
  return <main className="atlas">
    <header className="header">
      <div className="brand"><div className="planet-icon" aria-hidden="true"><span/></div><div><h1>Mars <span>Ocean Atlas</span></h1><p>PLANETARY TOPOGRAPHY LAB</p></div></div>
      <div className="header-right"><span className="source-badge"><i/> NASA MOLA <span>·</span> REAL ELEVATION DATA</span><button className="about-button" onClick={()=>setAbout(true)}><Icon name="info"/><span>About this map</span></button></div>
    </header>
    <section className="map-stage" aria-label="Interactive Mars elevation map">
      <canvas ref={canvasRef} tabIndex={0} aria-label="Mars map. Drag to pan, scroll or pinch to zoom. Arrow keys pan; plus and minus zoom; zero fits the planet. Click terrain to inspect elevation."/>
      <svg className="map-rulers" aria-hidden="true">
        {[60,30,0,-30,-60].map(lat=>{const y=project(lat,180).y;return y>25&&y<view.height-90?<g key={lat}><text x="17" y={y}>{lat===0?'EQ':`${Math.abs(lat)}°${lat>0?'N':'S'}`}</text></g>:null;})}
        {[0,60,120,180,240,300].map(lon=>{const point=project(-90,lon);return point.x>35&&point.x<view.width-35&&point.y>0&&point.y<view.height-90?<text key={lon} x={point.x} y={point.y+20} textAnchor="middle">{lon}°E</text>:null;})}
      </svg>
      <FeatureLabels view={view} onLocate={feature=>rendererRef.current?.locate(feature.latitude,feature.longitude)}/>
      <div className="map-title"><span className="eyebrow">A DIFFERENT BLUE PLANET</span><h2>What if Mars<br/>had oceans?</h2><p>Explore the terrain. Raise the water.<br/>Discover a world beneath the surface.</p></div>
      <div className="map-actions" aria-label="Map navigation">
        <button aria-label="Zoom in" onClick={()=>rendererRef.current?.zoom(1.5)}><Icon name="plus"/></button><button aria-label="Zoom out" onClick={()=>rendererRef.current?.zoom(1/1.5)}><Icon name="minus"/></button><button aria-label="Fit entire planet" onClick={()=>rendererRef.current?.fit()}><Icon name="fit"/></button>
      </div>
      {marker && <div className="inspection-pin" style={{left:marker.x,top:marker.y}} aria-hidden="true"><span/></div>}
      <aside className="simulation-panel" aria-label="Ocean simulation controls">
        <div className="panel-heading"><div><span className="eyebrow">HYPOTHETICAL SCENARIO</span><h2>Shape the shoreline</h2></div><svg width="34" height="34" viewBox="0 0 34 34" fill="none" stroke="#317b91" strokeWidth="1.4" aria-hidden="true"><path d="M3 13q4-4 8 0t8 0t8 0M3 20q4-4 8 0t8 0t8 0M3 27q4-4 8 0t8 0t8 0"/></svg></div>
        <div className="coverage-hero"><svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><circle className="ring-background" cx="32" cy="32" r="26"/><circle className="ring-ocean" cx="32" cy="32" r="26" strokeDasharray={`${coverage/100*163.363} 163.363`} transform="rotate(-90 32 32)"/><path d="M22 33q5-5 10 0t10 0M22 39q5-5 10 0t10 0" fill="none" stroke="#44869c" strokeWidth="1.4"/></svg><div><strong data-testid="ocean-coverage">{coverage.toFixed(2)}<span>%</span></strong><p>of Mars covered by water</p></div></div>
        <div className="slider-group"><div className="control-label"><label htmlFor="coverage">Ocean coverage</label><output htmlFor="coverage">{coverage.toFixed(2)}%</output></div><input id="coverage" aria-label="Ocean coverage" type="range" min="0" max="100" step="0.1" value={coverage} disabled={!data} onChange={e=>setCoverage(Number(e.target.value))} style={{'--progress':`${coverage}%`} as React.CSSProperties}/><div className="range-extents"><span>DRY PLANET</span><span>WATER WORLD</span></div><p className="target-note">Target {target.toFixed(1)}% · first flooded bin reaching the target</p></div>
        <div className="slider-group elevation-control"><div className="control-label"><label htmlFor="water">Water elevation</label><output htmlFor="water" data-testid="water-elevation">{signedMeters(water)} <span>m</span></output></div><input id="water" aria-label="Water elevation" type="range" min={data?.waterMinimumM??-8200} max={data?.waterMaximumM??21250} step="0.125" value={water} disabled={!data} onChange={e=>setHeight(Number(e.target.value))} style={{'--progress':data?`${(water-data.waterMinimumM)/(data.waterMaximumM-data.waterMinimumM)*100}%`:'32%'} as React.CSSProperties}/><div className="range-extents"><span>{data?signedMeters(data.minimumM):'−8,200'} m</span><span>{data?signedMeters(data.maximumM):'+21,250'} m</span></div><p className="field-note">Relative to the Martian areoid</p></div>
        <div className="surface-stats"><div><span><i className="land-dot"/> LAND</span><strong data-testid="land-coverage">{(100-coverage).toFixed(2)}<small>%</small></strong></div><div><span><i className="ocean-dot"/> OCEAN AREA</span><strong className="area-value" data-testid="ocean-area">{data?areaText(data.totalAreaKm2*coverage/100):'—'}<small> km²</small></strong></div></div>
        <div className="shade-control"><div className="control-label"><label htmlFor="shade">Terrain shading</label><output>{Math.round(shade*100)}%</output></div><input id="shade" type="range" min="0" max="1.5" step="0.05" value={shade} onChange={e=>setShade(Number(e.target.value))} style={{'--progress':`${shade/1.5*100}%`} as React.CSSProperties}/></div>
        <div className="panel-bottom"><label className="grid-toggle"><input type="checkbox" checked={grid} onChange={e=>setGrid(e.target.checked)}/> Coordinate grid</label><button className="reset-button" onClick={reset} disabled={!data}><Icon name="reset"/> Reset to 71%</button></div>
        <p className="simulation-note">An elevation experiment, not a climate simulation.<br/>Includes isolated basins below the water level.</p>
      </aside>
      <div className="legend-panel"><div className="legend-title"><span>LAND ELEVATION</span><span>METERS ABOVE AREOID</span></div><div className="land-ramp"/><div className="legend-ticks"><span>−8,300</span><span>0</span><span>8,000</span><span>22,000</span></div><div className="legend-title bathymetry-title"><span>OCEAN DEPTH</span><span>METERS BELOW WATER</span></div><div className="ocean-ramp"/><div className="legend-ticks"><span>0</span><span>1,000</span><span>4,000</span><span>12,000+</span></div></div>
      <div className="inspection-card" aria-live="polite">
        {inspection?<><div className="inspection-heading"><span className="eyebrow">TERRAIN INSPECTION</span><button aria-label="Close terrain inspection" onClick={()=>setInspection(null)}><Icon name="cross"/></button></div><strong className="inspection-coordinates">{coordinates(inspection.latitude,inspection.longitude)}</strong><div className="inspection-values"><div><span>ELEVATION</span><strong data-testid="terrain-elevation">{signedMeters(inspection.elevation)} <small>m</small></strong></div><div><span>{inspection.elevation<water?'WATER DEPTH':'SURFACE'}</span><strong data-testid="water-depth">{inspection.elevation<water?`${waterDepth(water,inspection.elevation).toLocaleString('en-US',{maximumFractionDigits:3})} m`:'Exposed land'}</strong></div></div><p>{inspection.quality%2?'Observed source bin':'Interpolated in NASA source'}{inspection.quality>=2?' · polar MEGT':''} · nearest {data?.ppd} px/° cell</p></>:<><span className="inspection-prompt">⌖</span><div><strong>Every point has a story.</strong><p>Click the map to inspect elevation and depth.</p></div></>}
      </div>
      {error&&<div role="alert" className="error-message"><Icon name="info"/><span>{error}</span><button onClick={()=>setError('')} aria-label="Dismiss message"><Icon name="cross"/></button></div>}
      <footer className="map-footer"><span className="status" role="status" aria-label="Map data status"><i/>{status}</span><span className="cursor-coordinate">{location?coordinates(location.latitude,location.longitude):'Drag to explore · scroll to zoom'}</span><span className="projection-badge">EQUIRECTANGULAR · MARS</span></footer>
    </section>
    {about&&<div className="modal-backdrop" onClick={()=>setAbout(false)}><section ref={dialogRef} className="about-modal" role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={e=>e.stopPropagation()}><button className="modal-close" aria-label="Close about dialog" onClick={()=>setAbout(false)} autoFocus><Icon name="cross"/></button><span className="eyebrow">THE SCIENCE BEHIND THE MAP</span><h2 id="about-title">Real terrain. Imagined oceans.</h2><p>NASA’s Mars Global Surveyor measured the elevation of Mars with the MOLA laser altimeter. This atlas samples the 128 px/° topography, with 512 px/° polar topography filling the caps, onto a {data?.ppd} px/° global grid.</p><p>Water covers cells whose elevation is strictly below the selected level. Coverage uses the exact spherical area of each latitude row, with the dataset’s 3,396 km reference radius. Isolated depressions flood too; this is not a simulation of connected oceans, climate, or hydrology.</p><p>The 71% target reaches <strong>{data?.defaultCoverage.toFixed(4)}%</strong> at <strong>{data? signedMeters(data.defaultWaterM):'—'} m</strong>. A finite raster changes coverage in discrete steps, so an exact 71.0000% is not always possible.</p><p>Land colors use fixed areoid elevations. Blue colors use water depth. Hillshade uses four light directions and Mars ground distances; the shading control only changes appearance. At low zoom, nearest-sampled overviews simplify small coastlines. Clicks always inspect the finest processed grid.</p><p>Nominal grid spacing is ~{data?.gridApproximationKm.toFixed(2)} km at the equator. NASA’s interpolated bins are retained and marked. Polar products differ from cylindrical data at overlapping locations; the transition is not blended. This map does not provide survey-grade local elevation accuracy.</p><a href="https://pds-geosciences.wustl.edu/missions/mgs/mola.html" target="_blank" rel="noreferrer">MOLA archive & mission documentation ↗</a><button className="primary-button" onClick={()=>setAbout(false)}>Back to the atlas</button></section></div>}
  </main>;
}
