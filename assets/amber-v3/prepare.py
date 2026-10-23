"""Lossless delivery formats and corrected atlas geometry. PNG originals remain in v2."""
import json, statistics, sys
from pathlib import Path
from PIL import Image, ImageChops
R=Path(__file__).resolve().parent
V2=R.parent/'amber-v2'
d=json.loads((V2/'manifest.json').read_text(encoding='utf-8'))
d['version']=3
def bounds(mask):
 w,h=mask.size;p=mask.load();seen=bytearray(w*h);best=[]
 for y in range(h):
  for x in range(w):
   if seen[y*w+x] or not p[x,y]:continue
   seen[y*w+x]=1;stack=[(x,y)];part=[]
   while stack:
    xx,yy=stack.pop();part.append((xx,yy))
    for nx,ny in [(xx-1,yy),(xx+1,yy),(xx,yy-1),(xx,yy+1)]:
     if 0<=nx<w and 0<=ny<h and not seen[ny*w+nx] and p[nx,ny]:seen[ny*w+nx]=1;stack.append((nx,ny))
   if len(part)>len(best):best=part
 return [min(x for x,y in best),min(y for x,y in best),max(x for x,y in best)+1,max(y for x,y in best)+1]
for a in d['assets']:
 source=V2/a['file']
 if a['id']=='wife-fishing':source=Path(json.loads((R/'fishing-source.json').read_text())['source'])
 im=Image.open(source)
 if a['id']=='wife-fishing':
  a['width'],a['height']=im.size
  for i,f in enumerate(a['frames']):
   x0,x1=round(i*im.width/4),round((i+1)*im.width/4);f['rect']=[x0,0,x1-x0,im.height]
 if a['id'] in ['props-actions','wife-fishing','wildlife','guests-walk'] or a['id'].startswith('family-'):
  for f in a['frames']:
   human_walk=a['id']=='guests-walk' or (a['id'].startswith('family-') and 4<=f['index']<=7)
   if a['id'].startswith('family-') and not human_walk:continue
   if a['id']=='props-actions' and f['index']<8:
    # Merchant boots and hunter boots/muzzles cross the generated cell border.
    x,y,w,h=f['rect'];left=max(0,x-16);right=min(im.width,x+w+16)
    f['rect']=[left,y,right-left,min(im.height,y+h+48)-y]
   if human_walk:
    # Generated figures are not aligned to the nominal grid. Preserve boots and
    # hair extending into its margins, but omit disconnected neighbours.
    x,y,w,h=f['rect'];left=max(0,x-16);top=max(0,y-16)
    right=min(im.width,x+w+16);bottom=min(im.height,y+h+16)
    f['rect']=[left,top,right-left,bottom-top]
   if a['id']=='wildlife':
    # The first deer's rear hoof crosses the nominal grid boundary.
    # Include the complete animal, then exclude the neighbouring animal's hoof.
    x,y,w,h=f['rect'];left=max(0,x-24);right=min(im.width,x+w+24)
    f['rect']=[left,y,right-left,h]
   x,y,w,h=f['rect'];mask=im.getchannel('A').crop((x,y,x+w,y+h)).point(lambda v:255 if v>=128 else 0)
   b=bounds(mask);f['visibleBounds']=b
   pixels=mask.load();xs=[xx for yy in range(b[3]-max(2,int((b[3]-b[1])*.1)),b[3]) for xx in range(b[0],b[2]) if pixels[xx,yy]]
   f['registration']=[round(statistics.median(xs)),b[3]]
   if a['id']=='wildlife' or human_walk or (a['id']=='props-actions' and 4<=f['index']<=7):
    # Track the torso, not the moving feet; otherwise the run jumps sideways.
    torso=[xx for yy in range(b[1]+int((b[3]-b[1])*.55),b[1]+int((b[3]-b[1])*.7)) for xx in range(b[0],b[2]) if pixels[xx,yy]]
    f['registration'][0]=round(statistics.median(torso))
 if a['id']=='family-wife':
  # The fourth walking drawing winks on every loop; keep a neutral passing pose.
  next(an for an in a['animations'] if an['name']=='歩行')['frames']=[4,5,6,5]
 a['file']=a['id']+'.webp'
 if '--geometry-only' in sys.argv:continue
 im.save(R/a['file'],format='WEBP',lossless=True,method=6)
 # Verify the format conversion preserves every RGBA pixel.
 restored=Image.open(R/a['file']).convert('RGBA'); original=im.convert('RGBA')
 for color in ['black','white']:
  bg=Image.new('RGBA',im.size,color)
  assert ImageChops.difference(Image.alpha_composite(bg,original).convert('RGB'),Image.alpha_composite(bg,restored).convert('RGB')).getbbox() is None
# Reviewed walking atlases have their own four-pose geometry.
if (R/'walking-manifest.json').exists():
 for walking in json.loads((R/'walking-manifest.json').read_text(encoding='utf-8')):
  d['assets']=[a for a in d['assets'] if a['id']!=walking['id']]+[walking]
(R/'manifest.json').write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
print('PNG bytes',sum(p.stat().st_size for p in V2.glob('*.png')),'WebP bytes',sum(p.stat().st_size for p in R.glob('*.webp')))
