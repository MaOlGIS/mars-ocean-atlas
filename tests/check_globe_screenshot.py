"""Independent GPU check: ray/triangle UV intersection, numeric PNG decode, palette and hillshade."""
from pathlib import Path
import json, math
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[1]
view=json.loads((root/'test-results/globe-view.json').read_text())
shot=np.array(Image.open(root/'test-results/globe-terrain.png').convert('RGB'))
man=json.loads((root/'public/data/manifest.json').read_text())
projection=np.array(view['matrices']['projectionMatrix']).reshape(4,4,order='F')
model=np.array(view['matrices']['modelViewMatrix']).reshape(4,4,order='F')
inverse=np.linalg.inv(projection@model)
def point(lat,lon):
    lat,lon=np.deg2rad([lat,lon]);return np.array([math.cos(lat)*math.cos(lon),math.sin(lat),-math.cos(lat)*math.sin(lon)])
def ramp(value,stops):
    for (a,c),(b,d) in zip(stops,stops[1:]):
        if value<b:return np.array(c)+(np.array(d)-c)*np.clip((value-a)/(b-a),0,1)
    return np.array(stops[-1][1])
land=[(-8300,[.065,.22,.14]),(-4000,[.16,.40,.22]),(0,[.49,.64,.32]),(4000,[.91,.83,.43]),(8000,[.83,.51,.24]),(14000,[.46,.31,.24]),(22000,[.96,.95,.90])]
sea=[(0,[.57,.82,.85]),(1000,[.25,.64,.75]),(4000,[.08,.38,.59]),(12000,[.035,.14,.29])]
# Global geometry uses identical float32 vertices at every tile level.
def vertex(col,row):return point(90-row*180/128,col*360/256).astype(np.float32).astype(float)
checks=[]
for lat,lon in [(12.3,280.7),(-25.3,275.2),(20.3,226.2),(35.2,260.7),(-40.1,290.7)]:
    clip=projection@model@np.r_[point(lat,lon),1];ndc=clip[:3]/clip[3]
    pixel=np.floor([(ndc[0]+1)*view['width']/2,(1-ndc[1])*view['height']/2]).astype(int)
    sx=(pixel[0]+.5)/view['width']*2-1;sy=1-(pixel[1]+.5)/view['height']*2
    near=inverse@np.array([sx,sy,-1,1]);near=near[:3]/near[3]
    far=inverse@np.array([sx,sy,1,1]);far=far[:3]/far[3];direction=far-near;direction/=np.linalg.norm(direction)
    col=int(lon/360*256);row=int((90-lat)/180*128);hits=[]
    for r in range(max(0,row-2),min(128,row+3)):
        for c in range(col-2,col+3):
            corners=[(c,r),(c+1,r),(c,r+1),(c+1,r+1)]
            for order in [(0,2,1),(1,2,3)]:
                ij=np.array([corners[i] for i in order]);a,b,d=[vertex(*p) for p in ij]
                e1,e2=b-a,d-a;cross=np.cross(direction,e2);det=np.dot(e1,cross)
                if abs(det)<1e-12:continue
                s=near-a;u=np.dot(s,cross)/det;q=np.cross(s,e1);v=np.dot(direction,q)/det;t=np.dot(e2,q)/det
                if u>=0 and v>=0 and u+v<=1 and t>0:hits.append((t,(1-u-v)*ij[0]+u*ij[1]+v*ij[2]))
    assert hits,(lat,lon,'No geometry intersection')
    _,uv=min(hits,key=lambda h:h[0]);n=2**view['level'];tx=int(np.floor(uv[0]/256*2*n))%(2*n);ty=int(np.floor(uv[1]/128*n))
    px=min(179,int(np.floor((uv[0]/256*2*n)%1*180)));py=min(179,int(np.floor((uv[1]/128*n)%1*180)))
    tile=np.array(Image.open(root/f'public/data/tiles/{view["level"]}/{tx}/{ty}.png')).astype(float)
    def elevation(x,y):
        b=tile[np.clip(y,0,179),np.clip(x,0,179)];return (b[0]*65536+b[1]*256+b[2]-40000)/4
    e=elevation(px,py);wet=e<man['defaultWaterM'];depth=max(0,man['defaultWaterM']-e)
    expected=ramp(depth,sea) if wet else ramp(e,land)
    expected*=np.clip(1+(tile[py,px,3]/255-.7071)*(.32 if wet else 1.7)*.85,.45,1.25)
    if not wet and any(elevation(px+dx,py+dy)<man['defaultWaterM'] for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)]):expected=expected*.62+np.array([.12,.29,.25])*.38
    nearest=min(abs((uv[0]/256*360+15)%30-15),abs((90-uv[1]/128*180+15)%30-15))
    alpha=np.clip(nearest/(360/view['scale']*.8),0,1);line=1-alpha*alpha*(3-2*alpha)
    expected=expected*(1-line*.18)+np.array([.90,.93,.90])*line*.18
    expected=np.rint(np.clip(expected,0,1)*255);actual=shot[pixel[1],pixel[0]]
    error=float(np.max(np.abs(expected-actual)));assert error<=3,(lat,lon,pixel,actual,expected,error)
    checks.append({'lat':lat,'lon':lon,'elevation_m':e,'wet':bool(wet),'max_channel_error':error})
assert any(c['wet'] for c in checks) and any(not c['wet'] for c in checks)
print('Globe GPU vs independent triangle / tile / scalar calculation:',checks)
