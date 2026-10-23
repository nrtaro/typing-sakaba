import json, shutil, re, statistics, zipfile
from pathlib import Path
from PIL import Image

def dominant_box(mask):
 w,h=mask.size; px=mask.load(); seen=bytearray(w*h); best=[]
 for yy in range(h):
  for xx in range(w):
   i=yy*w+xx
   if seen[i] or not px[xx,yy]:continue
   seen[i]=1;stack=[(xx,yy)];component=[]
   while stack:
    x,y=stack.pop();component.append((x,y))
    for nx,ny in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
     if 0<=nx<w and 0<=ny<h and not seen[ny*w+nx] and px[nx,ny]:seen[ny*w+nx]=1;stack.append((nx,ny))
   if len(component)>len(best):best=component
 return (min(x for x,y in best),min(y for x,y in best),max(x for x,y in best)+1,max(y for x,y in best)+1) if best else None
R=Path(__file__).resolve().parent
V1=R.parent/'amber-v1'
for p in V1.glob('*.png'): shutil.copy2(p,R/p.name)
revisions=json.loads((R/'revisions.json').read_text())
for e in revisions: shutil.copy2(e['source'],R/(e['id']+'.png'))
d=json.loads((V1/'manifest.json').read_text(encoding='utf-8'))
d['version']=2
d['review']='reduced motion; state poses separated from one-shot actions and loops'
for e in revisions:
 im=Image.open(R/(e['id']+'.png')); w,h=im.size
 frames=[]
 for i in range(4):
  x0,x1=round(i*w/4),round((i+1)*w/4)
  frames.append(dict(index=i,rect=[x0,0,x1-x0,h],name=str(i)))
 d['assets'].append(dict(id=e['id'],file=e['id']+'.png',width=w,height=h,mode=im.mode,columns=4,rows=1,frames=frames,animations=[dict(name='調理・鍋を混ぜる' if e['id']=='master-stir' else '釣り・待機',frames=[0,1,2,3],fps=5,loop=True)]))
for a in d['assets']:
 if 'frames' not in a:continue
 im=Image.open(R/a['file']); alpha=im.getchannel('A'); mask=alpha.point(lambda x:255 if x>=128 else 0)
 a['alphaRange']=list(alpha.getextrema()); a['transparentFraction']=round(alpha.histogram()[0]/(im.width*im.height),4)
 for f in a['frames']:
  x,y,w,h=f['rect']
  if a['id'].startswith('guests-'):
   x0,y0,x1,y1=max(0,x-8),max(0,y-22),min(im.width,x+w+8),min(im.height,y+h+22)
   x,y,w,h=x0,y0,x1-x0,y1-y0;f['rect']=[x,y,w,h]
  m=mask.crop((x,y,x+w,y+h)); b=dominant_box(m) if a['id'].startswith(('guests-','family-')) else m.getbbox();f['visibleBounds']=list(b) if b else None
  if b:
   # Ground contact from the opaque bottom portion; ignore translucent fringe.
   pixels=m.load();xs=[xx for yy in range(max(b[1],b[3]-max(2,int((b[3]-b[1])*.10))),b[3]) for xx in range(b[0],b[2]) if pixels[xx,yy]]
   f['registration']=[round(statistics.median(xs)),b[3]]
 a['deprecatedFrames']=[]
 ident=a['id']
 if ident in ['family-master','family-wife']:
  a['animations']=a['animations'][:3];a['deprecatedFrames']=list(range(12,16))
 for an in a['animations']:
  an['fps']=6;an['playback']='loop';an['loop']=True
  if ident.startswith('family-'):
   if an['name']=='待機': an.update(frames=[0]*7+[2]+[0]*6,fps=4)
   elif an['name']=='配膳': an.update(frames=[8,9,10,9,8],fps=5,loop=False,playback='once-hold')
   elif an['name']=='採取': an.update(frames=[12,13,14,15],fps=4,loop=False,playback='once-hold')
  if ident=='guests-seated':
   # Faces are states, not a happy-angry-eat animation.
   an.update(frames=[an['frames'][0]],fps=1,loop=False,playback='state')
   an['states']={'smile':an['frames'][0], 'neutral':an['frames'][0]+1,'angry':an['frames'][0]+2,'eat':an['frames'][0]+3}
  if ident=='props-actions':
   if an['name']=='商人・交渉':an.update(frames=[0,1,0,3,0],fps=3,loop=False,playback='once-hold')
   else:an.update(frames=[4,5,4],fps=6,loop=False,playback='once-hold')
  if ident=='fx':
   an['fps']=6
   if an['name'] in ['水しぶき','きらめき']:an.update(fps=8,loop=False,playback='once-hide')
  if ident in ['master-stir','wife-fishing']:an['fps']=5
  used=[a['frames'][i] for i in an['frames']]; bounds=[f['visibleBounds'] for f in used]
  # Constant row scale avoids per-frame breathing/size pumping.
  an['scale']=min(180/max(b[2]-b[0] for b in bounds),190/max(b[3]-b[1] for b in bounds))
 a['allFramesNonempty']=all(f['visibleBounds'] for f in a['frames'])
(R/'manifest.json').write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
html=(V1/'preview.html').read_text(encoding='utf-8')
html=re.sub(r'const data=.*?;let running=',lambda _: 'const data='+json.dumps(d,ensure_ascii=False)+';let running=',html,count=1)
html=html.replace("'fx':'演出'","'fx':'演出','master-stir':'マスター・修正','wife-fishing':'おかみ・修正'")
html=html.replace('背景6枚、透過アトラス9枚。','修正版：背景6枚、透過アトラス11枚。')
html=html.replace('4コマ · ${animation.fps} fps','${animation.playback} · ${animation.fps} fps')
html=html.replace('${animation.frames.length}コマ · ${animation.fps} fps','${animation.playback} · ${animation.fps} fps')
html=html.replace('（表情比較）','（状態表示）')
html=html.replace("speed=1,clock=0,", "speed=1,clock=0,")
html=html.replace('<button id="pause">一時停止</button>','<button id="pause">一時停止</button><button id="restart">動作をもう一度</button><select id="face"><option value="smile">笑顔</option><option value="neutral">待ち疲れ</option><option value="angry">怒り</option><option value="eat">食事中</option></select>')
html=html.replace("function tick(now)","document.querySelector('#restart').onclick=()=>{clock=0};let face='smile';document.querySelector('#face').onchange=e=>face=e.target.value;function tick(now)")
start=html.index('const f=p.a.frames[p.animation.frames[')
end=html.index('}requestAnimationFrame(tick)',start)
html=html[:start]+'''const an=p.animation;let step=Math.floor(clock*an.fps);const c=p.canvas.getContext('2d');c.clearRect(0,0,240,240);if(!an.loop&&step>=an.frames.length&&an.playback==='once-hide')continue;const index=an.states?an.states[face]:an.frames[an.loop?step%an.frames.length:Math.min(step,an.frames.length-1)];const f=p.a.frames[index];c.imageSmoothingEnabled=false;const [x,y,w,h]=f.rect;const b=f.visibleBounds;const s=an.scale;const [ax,ay]=f.registration;c.drawImage(p.img,x+b[0],y+b[1],b[2]-b[0],b[3]-b[1],120+(b[0]-ax)*s,215+(b[1]-ay)*s,(b[2]-b[0])*s,(b[3]-b[1])*s);'''+html[end:]
html=html.replace('足元の基準位置やシート端の余白','足元の基準位置やシート端の余白')
html=html.replace('素材単体の確認用です。','v2：足元位置を揃え、待機は短い瞬き、作業は少ないコマの動きに変更。一回再生は「動作をもう一度」で再確認できます。素材単体の確認用です。')
(R/'preview.html').write_text(html,encoding='utf-8')
with zipfile.ZipFile(R.parent.parent/'LAST-ORDER-A-reviewed-v2.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in R.iterdir():
  if p.suffix in ['.png','.html','.json','.md']:z.write(p,'amber-v2/'+p.name)
print('Assets',len(d['assets']),'nonempty',all(a.get('allFramesNonempty',True) for a in d['assets']))
