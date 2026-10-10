/** Numeric MOLA palette, strict flooding, bathymetry and hillshade shared by both views. */
export const terrainFragment = `#version 300 es
precision highp float;
uniform sampler2D terrain;
uniform float water;
uniform float shadeIntensity;
uniform float graticule;
uniform float pixelScale;
in vec2 uv;
in vec2 world;
out vec4 color;
vec3 blend(float e,float a,float b,vec3 c,vec3 d){return mix(c,d,clamp((e-a)/(b-a),0.0,1.0));}
vec3 land(float e){
 if(e< -4000.0)return blend(e,-8300.0,-4000.0,vec3(.065,.22,.14),vec3(.16,.40,.22));
 if(e<0.0)return blend(e,-4000.0,0.0,vec3(.16,.40,.22),vec3(.49,.64,.32));
 if(e<4000.0)return blend(e,0.0,4000.0,vec3(.49,.64,.32),vec3(.91,.83,.43));
 if(e<8000.0)return blend(e,4000.0,8000.0,vec3(.91,.83,.43),vec3(.83,.51,.24));
 if(e<14000.0)return blend(e,8000.0,14000.0,vec3(.83,.51,.24),vec3(.46,.31,.24));
 return blend(e,14000.0,22000.0,vec3(.46,.31,.24),vec3(.96,.95,.90));
}
vec3 sea(float depth){
 if(depth<1000.0)return blend(depth,0.0,1000.0,vec3(.57,.82,.85),vec3(.25,.64,.75));
 if(depth<4000.0)return blend(depth,1000.0,4000.0,vec3(.25,.64,.75),vec3(.08,.38,.59));
 return blend(depth,4000.0,12000.0,vec3(.08,.38,.59),vec3(.035,.14,.29));
}
float elevation(ivec2 p){vec3 b=texelFetch(terrain,clamp(p,ivec2(0),textureSize(terrain,0)-1),0).rgb*255.0;return (dot(round(b),vec3(65536.,256.,1.))-40000.0)*.25;}
void main(){
 ivec2 size=textureSize(terrain,0); ivec2 p=clamp(ivec2(uv*vec2(size)),ivec2(0),size-1);
 float e=elevation(p); float depth=max(0.0,water-e); bool wet=e<water;
 float shade=texelFetch(terrain,p,0).a;
 vec3 c=wet?sea(depth):land(e);
 // Flat terrain shade is sin(45 degrees); equal baseline on land and ocean.
 float relief=clamp(1.0+(shade-.7071)*(wet?.32:1.7)*shadeIntensity,.45,1.25);
 c*=relief;
 // Thin land-side coast outline, only when the encoded neighbor actually crosses H.
 bool coast=!wet && (elevation(p+ivec2(1,0))<water || elevation(p+ivec2(-1,0))<water || elevation(p+ivec2(0,1))<water || elevation(p+ivec2(0,-1))<water);
 if(coast)c=mix(c,vec3(.12,.29,.25),.38);
 if(graticule>0.5){
   vec2 degrees=vec2(world.x*360.0,90.0-world.y*360.0);
   vec2 nearest=abs(mod(degrees+15.0,30.0)-15.0);
   float line=1.0-smoothstep(0.0,360.0/pixelScale*.8,min(nearest.x,nearest.y));
   c=mix(c,vec3(.90,.93,.90),line*.18);
 }
 color=vec4(c,1.0);
}`;
