import { cellAt, type Manifest } from './ocean.ts';
export type Location={latitude:number;longitude:number};
export type Inspection=Location&{elevation:number;quality:number;cellLatitude:number;cellLongitude:number};
/** Both renderers inspect the same finest little-endian MOLA samples, irrespective of display LOD. */
export class ElevationSampler {
  private cache=new Map<string,Promise<{values:DataView;quality:Uint8Array}>>();
  constructor(private data:Manifest,private signal:AbortSignal){}
  async sample(location:Location):Promise<Inspection>{
    const {x,y}=cellAt(this.data,location.latitude,location.longitude),size=this.data.tileSize;
    const key=`${Math.floor(x/size)}/${Math.floor(y/size)}`,index=(y%size)*size+x%size;
    if(!this.cache.has(key)){
      const request=Promise.all(['f32','u8'].map(suffix=>fetch(`/data/samples/${key}.${suffix}`,{signal:this.signal}))).then(async responses=>{
        if(responses.some(r=>!r.ok))throw new Error('Elevation lookup failed');
        const [values,quality]=await Promise.all(responses.map(r=>r.arrayBuffer()));
        if(values.byteLength!==size*size*4||quality.byteLength!==size*size)throw new Error('Unexpected sample tile length');
        return {values:new DataView(values),quality:new Uint8Array(quality)};
      }).catch(error=>{this.cache.delete(key);throw error;});
      this.cache.set(key,request);
    }
    const request=this.cache.get(key)!;this.cache.delete(key);this.cache.set(key,request);
    const sample=await request;
    if(this.cache.size>24)this.cache.delete(this.cache.keys().next().value!);
    return {...location,elevation:sample.values.getFloat32(index*4,true),quality:sample.quality[index],cellLatitude:90-(y+.5)/this.data.ppd,cellLongitude:(x+.5)/this.data.ppd};
  }
}
