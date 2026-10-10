import type { Manifest } from './ocean';
import { wrapLongitude } from './ocean';

import { terrainFragment } from './terrain-shader';
import { ElevationSampler, type Location, type Inspection } from './sampling';
export type { Location, Inspection } from './sampling';
type Camera = { x: number; y: number; scale: number };
type Tile = { z: number; x: number; y: number; texture: WebGLTexture; used: number };

const vertex = `#version 300 es
in vec2 position;
uniform vec4 tile;
uniform vec3 camera;
uniform vec2 origin;
uniform vec2 resolution;
out vec2 uv;
out vec2 world;
void main(){
  uv=position; world=tile.xy+position*tile.zw;
  vec2 pixel=(world-camera.xy)*camera.z+origin;
  gl_Position=vec4(pixel.x/resolution.x*2.0-1.0,1.0-pixel.y/resolution.y*2.0,0.0,1.0);
}`;


/** A native equirectangular tile plane. No Earth EPSG, Mercator, or Earth distance math. */
export class MarsRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private buffer: WebGLBuffer;
  private tiles = new Map<string, Tile>();
  private pending = new Set<string>();
  private failed = new Map<string, number>();
  private controller = new AbortController();
  private sampler: ElevationSampler;
  private camera: Camera = { x: .5, y: .25, scale: 1000 };
  private width = 1; private height = 1; private origin = [0, 0];
  private water: number; private shade = .8; private grid = true;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private frame = 0; private destroyed = false; private loaded = 0;
  private drag?: { x: number; y: number; moved: number; pointer: number };
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch?: { distance: number; midpoint: { x: number; y: number } };
  private resizeObserver: ResizeObserver;
  private sampleId = 0;
  public onLocation?: (location: Location | null) => void;
  public onInspect?: (inspection: Inspection) => void;
  public onStatus?: (message: string) => void;
  public onView?: (camera: Camera) => void;
  public onError?: (message: string) => void;

  constructor(private canvas: HTMLCanvasElement, private data: Manifest) {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: true, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL 2 is unavailable. Enable hardware acceleration or use a browser with WebGL 2 support.');
    this.gl = gl; this.water = data.defaultWaterM; this.sampler=new ElevationSampler(data,this.controller.signal);
    const compile = (type: number, text: string) => {
      const shader = gl.createShader(type)!; gl.shaderSource(shader, text); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Shader compile failed');
      return shader;
    };
    const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, terrainFragment);
    this.program = gl.createProgram()!; gl.attachShader(this.program, vs); gl.attachShader(this.program, fs); gl.linkProgram(this.program);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program) || 'Shader link failed');
    this.buffer = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]), gl.STATIC_DRAW);
    gl.useProgram(this.program); const location = gl.getAttribLocation(this.program, 'position');
    gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(canvas);
    canvas.addEventListener('pointerdown', this.down); canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up); canvas.addEventListener('pointercancel', this.cancel);
    canvas.addEventListener('pointerleave', this.leave); canvas.addEventListener('wheel', this.wheel, { passive: false });
    canvas.addEventListener('keydown', this.key); canvas.addEventListener('webglcontextlost', this.contextLost);
    this.resize(); this.fit();
  }
  private uniform(name: string) { return this.gl.getUniformLocation(this.program, name); }
  private resize() {
    const rect = this.canvas.getBoundingClientRect(), old = this.width;
    this.width = Math.max(1, rect.width); this.height = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * dpr); this.canvas.height = Math.round(this.height * dpr);
    // Leave room for the desktop simulation panel; mobile controls are below the map.
    this.origin = [(this.width - (this.width > 850 ? 330 : 0)) / 2, this.height / 2 - 25];
    if (old > 1) this.camera.scale *= this.width / old;
    this.requestFrame();
  }
  fit() {
    this.camera = { x: .5, y: .25, scale: Math.max(180, Math.min(this.width - (this.width > 850 ? 390 : 38), (this.height - 145) * 2)) };
    this.requestFrame();
  }
  locate(latitude:number,longitude:number) {
    this.camera={x:wrapLongitude(longitude)/360,y:(90-latitude)/360,scale:Math.max(this.camera.scale,3000)};
    this.clampCamera();this.requestFrame();
  }
  setScenario(water: number, shade: number, grid: boolean) { this.water = water; this.shade = shade; this.grid = grid; this.requestFrame(); }
  private worldAt(x: number, y: number) { return { x: (x - this.origin[0]) / this.camera.scale + this.camera.x, y: (y - this.origin[1]) / this.camera.scale + this.camera.y }; }
  private relative(event: PointerEvent | WheelEvent) { const r = this.canvas.getBoundingClientRect(); return { x: event.clientX-r.left, y: event.clientY-r.top }; }
  private locationAt(x: number, y: number): Location | null {
    const w = this.worldAt(x,y); return w.y < 0 || w.y > .5 ? null : { latitude: 90-w.y*360, longitude: wrapLongitude(w.x*360) };
  }
  zoom(factor: number, x = this.origin[0], y = this.origin[1]) {
    const before = this.worldAt(x,y); this.camera.scale = Math.min(180 * 2 ** (this.data.maxZoom+3), Math.max(200, this.camera.scale*factor));
    const after = this.worldAt(x,y); this.camera.x += before.x-after.x; this.camera.y += before.y-after.y; this.clampCamera(); this.requestFrame();
  }
  private clampCamera() { this.camera.x = ((this.camera.x%1)+1)%1; this.camera.y = Math.max(-.1,Math.min(.6,this.camera.y)); }
  private down = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    this.canvas.setPointerCapture(event.pointerId); const pos = this.relative(event); this.pointers.set(event.pointerId,pos);
    if(this.pointers.size === 1) this.drag = {...pos,moved:0,pointer:event.pointerId};
    if(this.pointers.size === 2) { const [a,b]=[...this.pointers.values()]; this.pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),midpoint:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}}; if(this.drag)this.drag.moved=100; }
  };
  private move = (event: PointerEvent) => {
    const pos=this.relative(event); if(this.pointers.has(event.pointerId))this.pointers.set(event.pointerId,pos);
    if(this.pinch && this.pointers.size === 2){
      const [a,b]=[...this.pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y),midpoint={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      this.zoom(distance/Math.max(1,this.pinch.distance),midpoint.x,midpoint.y);
      this.camera.x-=(midpoint.x-this.pinch.midpoint.x)/this.camera.scale; this.camera.y-=(midpoint.y-this.pinch.midpoint.y)/this.camera.scale;
      this.pinch={distance,midpoint};this.clampCamera();this.requestFrame();
    } else if(this.drag && this.drag.pointer===event.pointerId){
      const dx=pos.x-this.drag.x,dy=pos.y-this.drag.y;this.drag.moved+=Math.hypot(dx,dy);this.drag.x=pos.x;this.drag.y=pos.y;
      this.camera.x-=dx/this.camera.scale;this.camera.y-=dy/this.camera.scale;this.clampCamera();this.requestFrame();
    }
    this.onLocation?.(this.locationAt(pos.x,pos.y));
  };
  private up = (event: PointerEvent) => {
    const pos=this.relative(event),click=this.drag && this.drag.moved<5 && !this.pinch;
    this.pointers.delete(event.pointerId); this.drag=undefined;this.pinch=undefined;
    if(click){const location=this.locationAt(pos.x,pos.y);if(location)void this.inspect(location);}
  };
  private cancel = (event: PointerEvent) => {this.pointers.delete(event.pointerId);this.drag=undefined;this.pinch=undefined;};
  private leave = () => this.onLocation?.(null);
  private wheel = (event: WheelEvent) => {event.preventDefault();const p=this.relative(event);this.zoom(Math.exp(-Math.max(-150,Math.min(150,event.deltaY))*.004),p.x,p.y);};
  private key = (event: KeyboardEvent) => {
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','0'].includes(event.key))event.preventDefault();
    if(event.key==='+'||event.key==='=')this.zoom(1.35);else if(event.key==='-')this.zoom(1/1.35);else if(event.key==='0')this.fit();
    else if(event.key.startsWith('Arrow')){const step=55/this.camera.scale;if(event.key==='ArrowLeft')this.camera.x-=step;if(event.key==='ArrowRight')this.camera.x+=step;if(event.key==='ArrowUp')this.camera.y-=step;if(event.key==='ArrowDown')this.camera.y+=step;this.clampCamera();this.requestFrame();}
  };
  private contextLost = (event: Event) => {event.preventDefault();this.onError?.('The graphics context was lost. Reload to restore the map.');};
  private requestFrame() {if(!this.frame&&!this.destroyed)this.frame=requestAnimationFrame(()=>{this.frame=0;this.draw();});}
  private async load(z: number,x: number,y: number) {
    const key=`${z}/${x}/${y}`;
    if(this.tiles.has(key)||this.pending.has(key)||(this.failed.get(key)||0)>Date.now())return;
    this.pending.add(key);this.failed.delete(key);
    try{
      const response=await fetch(`/data/tiles/${key}.png`,{signal:this.controller.signal});if(!response.ok)throw new Error(`Tile ${key}: HTTP ${response.status}`);
      const bitmap=await createImageBitmap(await response.blob(),{premultiplyAlpha:'none',colorSpaceConversion:'none'});
      if(this.destroyed){bitmap.close();return;}
      const gl=this.gl,texture=gl.createTexture()!;gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,bitmap);bitmap.close();
      this.failed.delete(key);this.tiles.set(key,{z,x,y,texture,used:performance.now()});this.loaded++;this.onStatus?.(`${this.data.ppd} px/° · NASA MOLA`);this.requestFrame();
    }catch(error){if(!this.destroyed){this.failed.set(key,Date.now()+15000);this.onStatus?.('Some map tiles could not load. Check the connection.');this.requestFrame();}}
    finally{this.pending.delete(key);}
  }
  private drawTile(tile: Tile, worldX: number) {
    const gl=this.gl,n=2**tile.z;gl.uniform4f(this.uniform('tile'),worldX/(2*n),tile.y/(2*n),1/(2*n),1/(2*n));
    gl.bindTexture(gl.TEXTURE_2D,tile.texture);gl.drawArrays(gl.TRIANGLES,0,6);tile.used=performance.now();
  }
  private draw() {
    const gl=this.gl;gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(.90,.91,.86,1);gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);gl.uniform3f(this.uniform('camera'),this.camera.x,this.camera.y,this.camera.scale);
    gl.uniform2f(this.uniform('origin'),this.origin[0],this.origin[1]);gl.uniform2f(this.uniform('resolution'),this.width,this.height);
    gl.uniform1f(this.uniform('water'),this.water);gl.uniform1f(this.uniform('shadeIntensity'),this.shade);gl.uniform1f(this.uniform('graticule'),this.grid?1:0);gl.uniform1f(this.uniform('pixelScale'),this.camera.scale);
    const visible = new Set<string>();
    const level=Math.max(0,Math.min(this.data.maxZoom,Math.ceil(Math.log2(this.camera.scale/360))));
    const left=this.worldAt(0,0).x,right=this.worldAt(this.width,0).x,top=this.worldAt(0,0).y,bottom=this.worldAt(0,this.height).y;
    // Draw available ancestors underneath missing children, preventing flashes while zooming.
    for(let z=0;z<=level;z++){
      const n=2**z;
      const xmin=Math.floor(left*2*n),xmax=Math.ceil(right*2*n)-1,ymin=Math.max(0,Math.floor(top*2*n)),ymax=Math.min(n-1,Math.floor(bottom*2*n));
      for(let y=ymin;y<=ymax;y++)for(let wx=xmin;wx<=xmax;wx++){
        const x=((wx%(2*n))+2*n)%(2*n),key=`${z}/${x}/${y}`,tile=this.tiles.get(key);
        visible.add(key);
        if(tile)this.drawTile(tile,wx);
        else if(z===level||z===0)void this.load(z,x,y);
      }
    }
    // Budget idle textures separately from the visible working set. A wide view can
    // need all 512 finest tiles; evicting any of those triggers a load/evict loop.
    // Ancestors drawn as fallbacks and the two root tiles must also stay resident.
    const idle=[...this.tiles.entries()].filter(([key,t])=>t.z>0&&!visible.has(key)).sort((a,b)=>a[1].used-b[1].used);
    if(idle.length>220)for(const [key,t] of idle.slice(0,idle.length-180)){gl.deleteTexture(t.texture);this.tiles.delete(key);}
    clearTimeout(this.retryTimer);
    const retryAt=Math.min(...[...this.failed].filter(([key])=>visible.has(key)).map(([,at])=>at));
    if(Number.isFinite(retryAt))this.retryTimer=setTimeout(()=>this.requestFrame(),Math.max(1,retryAt-Date.now()));
    this.onView?.({...this.camera});
  }
  private async inspect(location: Location) {
    const id=++this.sampleId;
    try {
      const sample=await this.sampler.sample(location);
      if(!this.destroyed&&id===this.sampleId)this.onInspect?.(sample);
    } catch {if(!this.destroyed)this.onError?.('Elevation could not be retrieved. Click again to retry.');}
  }

  destroy() {
    this.destroyed=true;this.controller.abort();cancelAnimationFrame(this.frame);clearTimeout(this.retryTimer);this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown',this.down);this.canvas.removeEventListener('pointermove',this.move);this.canvas.removeEventListener('pointerup',this.up);this.canvas.removeEventListener('pointercancel',this.cancel);this.canvas.removeEventListener('pointerleave',this.leave);this.canvas.removeEventListener('wheel',this.wheel);this.canvas.removeEventListener('keydown',this.key);this.canvas.removeEventListener('webglcontextlost',this.contextLost);
    for(const tile of this.tiles.values())this.gl.deleteTexture(tile.texture);this.gl.deleteBuffer(this.buffer);this.gl.deleteProgram(this.program);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
