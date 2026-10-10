import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Manifest } from './ocean';
import { ElevationSampler, type Location, type Inspection } from './sampling';
import { terrainFragment } from './terrain-shader';
import { globePoint, globeLocation, globeScale, globeLevel, visibleGlobeTile } from './globe-coordinates';
import { globeTileGeometry } from './globe-geometry';
import type { View } from './labels';

type Tile={z:number;x:number;y:number;mesh:THREE.Mesh<THREE.BufferGeometry,THREE.RawShaderMaterial>;texture:THREE.Texture;used:number};
const vertex=`precision highp float;
in vec3 position;
in vec2 tileUV;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform vec4 tile;
out vec2 uv;
out vec2 world;
void main(){uv=tileUV;world=tile.xy+tileUV*tile.zw;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;

/** Demand-rendered Three.js globe using existing numeric PNG tiles; no Earth projection or lighting. */
export class GlobeRenderer {
  private renderer:THREE.WebGLRenderer;
  private scene=new THREE.Scene();
  private camera=new THREE.PerspectiveCamera(45,1,.01,20);
  private controls:OrbitControls;
  private observer:ResizeObserver;
  private controller=new AbortController();
  private sampler:ElevationSampler;
  private tiles=new Map<string,Tile>();
  private pending=new Set<string>();
  private failed=new Map<string,number>();
  private wanted=new Map<string,{z:number;x:number;y:number}>();
  private raycaster=new THREE.Raycaster();
  private sphere=new THREE.Sphere(new THREE.Vector3(),1);
  private water:number;private shade=.85;private grid=true;
  private width=1;private height=1;private frame=0;private destroyed=false;private contextUnavailable=false;
  private retryTimer?:ReturnType<typeof setTimeout>;
  private inspectionId=0;private pointer?:{x:number;y:number;id:number;distance:number};private pointerCount=0;
  public onLocation?:(location:Location|null)=>void;
  public onInspect?:(inspection:Inspection)=>void;
  public onStatus?:(message:string)=>void;
  public onView?:(view:View)=>void;
  public onError?:(message:string)=>void;

  constructor(private canvas:HTMLCanvasElement,private data:Manifest){
    this.water=data.defaultWaterM;this.sampler=new ElevationSampler(data,this.controller.signal);
    this.renderer=new THREE.WebGLRenderer({canvas,alpha:false,antialias:true});
    this.renderer.setClearColor(0xe6e8dc,1);this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
    this.renderer.toneMapping=THREE.NoToneMapping;
    this.controls=new OrbitControls(this.camera,canvas);this.controls.enablePan=false;this.controls.enableDamping=true;
    this.controls.dampingFactor=.12;this.controls.autoRotate=false;this.controls.minDistance=1.15;this.controls.maxDistance=8;
    this.controls.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_ROTATE};
    this.controls.addEventListener('change',this.requestFrame);
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);
    canvas.addEventListener('pointerdown',this.down);canvas.addEventListener('pointermove',this.move);
    canvas.addEventListener('pointerup',this.up);canvas.addEventListener('pointercancel',this.cancel);
    canvas.addEventListener('pointerleave',this.leave);canvas.addEventListener('keydown',this.key);
    canvas.addEventListener('webglcontextlost',this.contextLost);
    this.resize();this.fit();
  }
  private resize(){
    const rect=this.canvas.getBoundingClientRect();this.width=Math.max(1,rect.width);this.height=Math.max(1,rect.height);
    this.renderer.setSize(this.width,this.height,false);this.camera.aspect=this.width/this.height;
    // Same CSS-pixel origin as the 2D map, leaving the simulation panel unobstructed.
    this.camera.setViewOffset(this.width,this.height,this.width>850?165:0,25,this.width,this.height);
    this.camera.updateProjectionMatrix();this.requestFrame();
  }
  fit(){
    const diameter=Math.max(160,Math.min(this.width-(this.width>850?410:44),this.height-200));
    const focal=this.height/(2*Math.tan(this.camera.fov*Math.PI/360));
    const distance=Math.min(8,Math.sqrt(1+(2*focal/diameter)**2));
    this.positionCamera(12.03,260.03,distance);
  }
  locate(latitude:number,longitude:number){
    this.positionCamera(latitude,longitude,2.7);
  }
  private positionCamera(latitude:number,longitude:number,distance:number){
    // Drain residual drag inertia before an explicit reset/search location.
    this.controls.enableDamping=false;this.controls.update();this.controls.reset();
    this.camera.position.set(...globePoint(latitude,longitude)).multiplyScalar(distance);
    this.controls.target.set(0,0,0);this.controls.update();this.controls.enableDamping=true;this.requestFrame();
  }
  zoom(factor:number){const distance=THREE.MathUtils.clamp(this.camera.position.length()/factor,1.15,8);this.camera.position.setLength(distance);this.controls.update();this.requestFrame();}
  setScenario(water:number,shade:number,grid:boolean){this.water=water;this.shade=shade;this.grid=grid;this.requestFrame();}
  private requestFrame=()=>{if(!this.frame&&!this.destroyed&&!this.contextUnavailable)this.frame=requestAnimationFrame(()=>{this.frame=0;this.draw();});};
  private relative(event:PointerEvent){const r=this.canvas.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top};}
  private locationAt(x:number,y:number){
    this.camera.updateMatrixWorld();this.raycaster.setFromCamera(new THREE.Vector2(x/this.width*2-1,1-y/this.height*2),this.camera);
    const hit=this.raycaster.ray.intersectSphere(this.sphere,new THREE.Vector3());return hit?globeLocation(hit.toArray()):null;
  }
  private down=(e:PointerEvent)=>{if(e.pointerType==='mouse'&&e.button!==0)return;this.pointerCount++;if(this.pointerCount===1)this.pointer={...this.relative(e),id:e.pointerId,distance:0};else if(this.pointer)this.pointer.distance=Infinity;};
  private move=(e:PointerEvent)=>{const p=this.relative(e);if(this.pointer?.id===e.pointerId){this.pointer.distance+=Math.hypot(p.x-this.pointer.x,p.y-this.pointer.y);this.pointer.x=p.x;this.pointer.y=p.y;}this.onLocation?.(this.locationAt(p.x,p.y));};
  private up=(e:PointerEvent)=>{const p=this.relative(e);if(this.pointer?.id===e.pointerId&&this.pointer.distance<5&&this.pointerCount===1){const location=this.locationAt(p.x,p.y);if(location)void this.inspect(location);}this.pointerCount=Math.max(0,this.pointerCount-1);this.pointer=undefined;};
  private cancel=()=>{this.pointer=undefined;this.pointerCount=0;};
  private leave=()=>this.onLocation?.(null);
  private key=(e:KeyboardEvent)=>{
    if(['+','=','-','0','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))e.preventDefault();
    if(e.key==='+'||e.key==='=')this.zoom(1.25);else if(e.key==='-')this.zoom(1/1.25);else if(e.key==='0')this.fit();
    else if(e.key.startsWith('Arrow')){
      const spherical=new THREE.Spherical().setFromVector3(this.camera.position);
      if(e.key==='ArrowLeft')spherical.theta-=.1;if(e.key==='ArrowRight')spherical.theta+=.1;
      if(e.key==='ArrowUp')spherical.phi-=.1;if(e.key==='ArrowDown')spherical.phi+=.1;
      spherical.makeSafe();this.camera.position.setFromSpherical(spherical);this.controls.update();this.requestFrame();
    }
  };
  private contextLost=(e:Event)=>{e.preventDefault();this.contextUnavailable=true;cancelAnimationFrame(this.frame);this.onError?.('The globe graphics context was lost. Reload, or switch back to the 2D map.');};
  private async inspect(location:Location){const id=++this.inspectionId;try{const sample=await this.sampler.sample(location);if(!this.destroyed&&id===this.inspectionId)this.onInspect?.(sample);}catch{if(!this.destroyed)this.onError?.('Elevation could not be retrieved. Click again to retry.');}}
  private async load(key:string,coordinate:{z:number;x:number;y:number}){
    this.pending.add(key);this.failed.delete(key);let bitmap:ImageBitmap|undefined,texture:THREE.Texture|undefined;
    try{
      const response=await fetch(`/data/tiles/${key}.png`,{signal:this.controller.signal});if(!response.ok)throw new Error(`Tile HTTP ${response.status}`);
      bitmap=await createImageBitmap(await response.blob(),{premultiplyAlpha:'none',colorSpaceConversion:'none',imageOrientation:'none'});
      if(this.destroyed||this.contextUnavailable)return;
      texture=new THREE.Texture(bitmap);texture.flipY=false;texture.colorSpace=THREE.NoColorSpace;
      texture.premultiplyAlpha=false;texture.minFilter=THREE.NearestFilter;texture.magFilter=THREE.NearestFilter;
      texture.generateMipmaps=false;texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;texture.needsUpdate=true;
      this.renderer.initTexture(texture); // Upload before closing the CPU image; no canvas premultiplication round trip.
      const {z,x,y}=coordinate,n=2**z;
      const material=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:vertex,fragmentShader:terrainFragment.replace('#version 300 es\n',''),depthWrite:false,uniforms:{
        terrain:{value:texture},tile:{value:new THREE.Vector4(x/(2*n),y/(2*n),1/(2*n),1/(2*n))},
        water:{value:this.water},shadeIntensity:{value:this.shade},graticule:{value:this.grid?1:0},pixelScale:{value:1000}
      }});
      const mesh=new THREE.Mesh(globeTileGeometry(z,x,y),material);mesh.renderOrder=z;this.scene.add(mesh);
      this.tiles.set(key,{...coordinate,mesh,texture,used:performance.now()});texture=undefined;
      this.onStatus?.(`${this.data.ppd} px/° click samples · NASA MOLA globe`);
    }catch{if(!this.destroyed){this.failed.set(key,Date.now()+15000);this.onStatus?.('Some globe tiles could not load. Retrying…');}}
    finally{bitmap?.close();texture?.dispose();this.pending.delete(key);this.requestFrame();}
  }
  private disposeTile(key:string,tile:Tile){this.scene.remove(tile.mesh);tile.mesh.geometry.dispose();tile.mesh.material.dispose();tile.texture.dispose();this.tiles.delete(key);}
  private draw(){
    if(this.destroyed||this.contextUnavailable)return;
    const moving=this.controls.update(),position=this.camera.position.toArray(),scale=globeScale(this.height,this.camera.position.length(),this.camera.fov);
    const level=globeLevel(scale,Math.min(4,this.data.maxZoom));this.wanted.clear();
    // Only root fallback and current target LOD are requested. Loaded intermediate levels remain useful.
    for(const z of [0,level]){const n=2**z;for(let y=0;y<n;y++)for(let x=0;x<2*n;x++)if(z===0||visibleGlobeTile(z,x,y,position))this.wanted.set(`${z}/${x}/${y}`,{z,x,y});}
    const protectedKeys=new Set<string>();
    for(const [key,t] of this.tiles){
      const visible=t.z<=level&&visibleGlobeTile(t.z,t.x,t.y,position);t.mesh.visible=visible;
      if(visible){protectedKeys.add(key);t.used=performance.now();}
      const uniforms=t.mesh.material.uniforms;uniforms.water.value=this.water;uniforms.shadeIntensity.value=this.shade;
      uniforms.graticule.value=this.grid?1:0;uniforms.pixelScale.value=scale;
    }
    const idle=[...this.tiles].filter(([key,t])=>t.z>0&&!protectedKeys.has(key)).sort((a,b)=>a[1].used-b[1].used);
    for(const [key,t] of idle.slice(0,Math.max(0,idle.length-64)))this.disposeTile(key,t);
    for(const [key,coordinate] of this.wanted){
      if(this.pending.size>=6)break;
      if(!this.tiles.has(key)&&!this.pending.has(key)&&(this.failed.get(key)||0)<=Date.now())void this.load(key,coordinate);
    }
    clearTimeout(this.retryTimer);
    const retryAt=Math.min(...[...this.failed].filter(([key])=>this.wanted.has(key)).map(([,at])=>at));
    if(Number.isFinite(retryAt))this.retryTimer=setTimeout(this.requestFrame,Math.max(1,retryAt-Date.now()));
    this.renderer.render(this.scene,this.camera);
    this.camera.updateMatrixWorld();const snapshot=this.camera.clone(),width=this.width,height=this.height;
    const center=globeLocation(position);
    this.onView?.({x:center.longitude/360,y:(90-center.latitude)/360,scale,width,height,kind:'globe',project:(latitude,longitude)=>{
      const p=new THREE.Vector3(...globePoint(latitude,longitude));if(p.dot(snapshot.position)<=1)return null;
      p.project(snapshot);return {x:(p.x+1)*width/2,y:(1-p.y)*height/2};
    }});
    // Non-sensitive diagnostics also support bounded-memory / no-continuous-spin regression tests.
    this.canvas.dataset.globeLongitude=center.longitude.toFixed(6);
    this.canvas.dataset.globeLatitude=center.latitude.toFixed(6);
    this.canvas.dataset.globeDistance=this.camera.position.length().toFixed(6);
    this.canvas.dataset.globePending=String(this.pending.size);
    this.canvas.dataset.globeMissing=String([...this.wanted.keys()].filter(key=>!this.tiles.has(key)).length);
    this.canvas.dataset.globeLevel=String(level);this.canvas.dataset.globeTiles=String(this.tiles.size);
    this.canvas.dataset.globeTextureBytes=String(this.tiles.size*this.data.tileSize**2*4);
    this.canvas.dataset.globeFrame=String(Number(this.canvas.dataset.globeFrame||0)+1);
    if(moving)this.requestFrame();
  }
  destroy(){
    this.destroyed=true;this.controller.abort();cancelAnimationFrame(this.frame);clearTimeout(this.retryTimer);this.observer.disconnect();
    this.controls.removeEventListener('change',this.requestFrame);this.controls.dispose();
    this.canvas.removeEventListener('pointerdown',this.down);this.canvas.removeEventListener('pointermove',this.move);this.canvas.removeEventListener('pointerup',this.up);
    this.canvas.removeEventListener('pointercancel',this.cancel);this.canvas.removeEventListener('pointerleave',this.leave);this.canvas.removeEventListener('keydown',this.key);this.canvas.removeEventListener('webglcontextlost',this.contextLost);
    for(const [key,tile] of this.tiles)this.disposeTile(key,tile);this.renderer.dispose();this.renderer.forceContextLoss();
  }
}
