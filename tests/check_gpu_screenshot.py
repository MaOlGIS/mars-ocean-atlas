"""Independent color comparison using QA's exact desktop viewport/camera and PNG samples."""
from pathlib import Path
import numpy as np
from PIL import Image
import json
root=Path(__file__).resolve().parents[1]
shot=np.array(Image.open(root/'test-results/atlas-map.png').convert('RGB'))
m=json.loads((root/'public/data/manifest.json').read_text())
h,w=shot.shape[:2]
scale=min(w-390,(h-145)*2);origin=np.array([(w-330)/2,h/2-25]);water=m['defaultWaterM'];z=int(np.ceil(np.log2(scale/360)))
land=[(-8300,[.065,.22,.14]),(-4000,[.16,.40,.22]),(0,[.49,.64,.32]),(4000,[.91,.83,.43]),(8000,[.83,.51,.24]),(14000,[.46,.31,.24]),(22000,[.96,.95,.90])]
sea=[(0,[.57,.82,.85]),(1000,[.25,.64,.75]),(4000,[.08,.38,.59]),(12000,[.035,.14,.29])]
def ramp(value,stops):
 for (a,c),(b,d) in zip(stops,stops[1:]):
  if value<b:return np.array(c)+(np.array(d)-c)*np.clip((value-a)/(b-a),0,1)
 return np.array(stops[-1][1])
checks=[]
for lat,lon in [(12.3,140.7),(-25.3,145.2),(-13.2,275.1),(56.2,200.7),(-40.1,70.7)]:
 world=np.array([lon/360,(90-lat)/360]);pixel=np.floor(origin+(world-[.5,.25])*scale).astype(int)
 # Evaluate the world coordinate at the actual pixel center.
 world=(pixel+.5-origin)/scale+[.5,.25]
 ix=int(np.floor((world[0]%1)*360*(2**z)));iy=int(np.floor(world[1]*360*(2**z)))
 tile=np.array(Image.open(root/f'public/data/tiles/{z}/{ix//180}/{iy//180}.png'))[iy%180,ix%180].astype(float)
 e=(tile[0]*65536+tile[1]*256+tile[2]-40000)/4;wet=e<water
 expected=ramp(water-e,sea) if wet else ramp(e,land)
 relief=np.clip(1+(tile[3]/255-.7071)*(.32 if wet else 1.7)*.85,.45,1.25)
 expected=np.rint(np.clip(expected*relief,0,1)*255)
 actual=shot[pixel[1],pixel[0]]
 difference=float(np.max(np.abs(actual-expected)))
 checks.append({'lat':lat,'lon':lon,'elevation':e,'max_channel_error':difference})
 assert difference<=3,(actual,expected,lat,lon)
print('GPU screenshot vs independent scalar palette / shading:',checks)
