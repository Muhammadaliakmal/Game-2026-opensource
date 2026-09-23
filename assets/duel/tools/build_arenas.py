import numpy as np, json, os, math
from PIL import Image, ImageDraw, ImageFilter
T=64; COLS=30; ROWS=17; WW,WH=COLS*T,ROWS*T   # world 1920x1088
rng=np.random.default_rng(42)
def hexrgb(h): h=h.lstrip('#'); return tuple(int(h[i:i+2],16) for i in (0,2,4))
def shade(c,f): return tuple(max(0,min(255,int(v*f))) for v in c)

ARENAS={
 'magma_gauntlet':dict(title='Magma Gauntlet',sky=('#2A0F08','#8A2E0B'),grid='#FFB35A',block='#FCE14B',accent='#F29D0C',stars=False,
     hazard='lava',hazard_col='#FF5A1F',sil='#3A1508',texture='plain'),
 'ice_cascade':dict(title='Ice Cascade',sky=('#0B1235','#1B2A6B'),grid='#8FF3F7',block='#8FF3F7',accent='#00FEF5',stars=False,
     hazard='void',hazard_col='#0EA4E6',sil='#16225A',texture='plain'),
 'violet_loom':dict(title='Violet Loom',sky=('#0C0D14','#1A1440'),grid='#A654F4',block='#6B4CE6',accent='#A654F4',stars=True,
     hazard='laser',hazard_col='#F271B4',sil='#1E1848',texture='woven'),
 'island_garden':dict(title='Island Garden',sky=('#07080F','#141A2E'),grid='#A3E436',block='#4CC38A',accent='#A3E436',stars=True,
     hazard='void',hazard_col='#F271B4',sil='#121A2A',texture='grass'),
}
# Layouts in tile units: platforms [x,y,w,h] (y from top), hazards, spawns, moving platforms
LAYOUT={
 'magma_gauntlet':dict(platforms=[[3,12,8,2],[19,12,8,2],[12,9,6,1],[1,6,5,1],[24,6,5,1]],
     moving=[{'rect':[12,14,6,1],'path':[[12,14],[12,11]],'period_s':5}],
     hazards=[{'type':'lava','rect':[0,15,30,2],'rise_to_row':13,'beat_s':12,'telegraph_s':2,'effect':'instant_ko'}],
     spawns=[[6,11],[23,11]]),
 'ice_cascade':dict(platforms=[[4,11,7,2],[19,11,7,2],[12,8,6,1],[13,14,4,1]],
     moving=[{'rect':[2,6,4,1],'path':[[2,6],[8,6]],'period_s':4},{'rect':[24,6,4,1],'path':[[24,6],[18,6]],'period_s':4}],
     hazards=[{'type':'falling_pillar','columns':[9,15,21],'beat_s':8,'telegraph_s':1.5,'damage':35},
              {'type':'ring_out','below_row':17}],surface={'friction':0.02},
     spawns=[[7,10],[22,10]]),
 'violet_loom':dict(platforms=[[2,12,26,2],[5,8,5,1],[20,8,5,1],[12,5,6,1]],
     moving=[],
     hazards=[{'type':'laser_sweep','row':10,'beat_s':9,'telegraph_s':1.5,'damage':25},
              {'type':'portal_pair','a':[3,11],'b':[26,4],'cooldown_s':1.0}],
     spawns=[[7,11],[22,11]]),
 'island_garden':dict(platforms=[[6,11,18,3],[3,7,5,1],[22,7,5,1],[13,5,4,1]],
     moving=[],
     hazards=[{'type':'crumble','rects':[[3,7,5,1],[22,7,5,1]],'break_after_s':1.2,'respawn_s':6},
              {'type':'ring_out','below_row':17}],
     spawns=[[9,10],[20,10]]),
}

def noise(w,h,blur,seed):
    r=np.random.default_rng(seed).random((h,w)); im=Image.fromarray((r*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur))
    a=np.array(im,float)/255; return (a-a.min())/(a.max()-a.min()+1e-6)

def block_tile(cfg, kind, size=T):
    base=hexrgb(cfg['block']); im=Image.new('RGBA',(size,size),(0,0,0,0)); d=ImageDraw.Draw(im); g=2
    d.rectangle([g,g,size-1-g,size-1-g],fill=base+(255,))
    arr=np.array(im,float)
    n=noise(size,size,3,hash(kind)%999)
    if cfg['texture']=='woven':
        y,x=np.mgrid[0:size,0:size]; wv=((np.sin(x/2.2)*np.sin(y/2.2))>0)*0.12
        arr[...,:3]*=(0.9+wv[...,None])
    else:
        arr[...,:3]*=(0.94+0.1*n[...,None])
    im=Image.fromarray(np.clip(arr,0,255).astype(np.uint8)); d=ImageDraw.Draw(im)
    if kind in ('top','single'):
        if cfg['texture']=='grass':
            gc=hexrgb(cfg['block']); d.rectangle([g,g,size-1-g,size//2],fill=gc+(255,))
            dirt=(122,62,42); d.rectangle([g,size//2,size-1-g,size-1-g],fill=dirt+(255,))
            for i in range(g,size-g,8): d.rectangle([i,size//2,i+3,size//2+5],fill=gc+(255,))
        d.rectangle([g,g,size-1-g,g+7],fill=shade(base,1.25)+(255,))
    elif cfg['texture']=='grass':
        d.rectangle([g,g,size-1-g,size-1-g],fill=(122,62,42,255))
    d.rectangle([g,size-1-g-6,size-1-g,size-1-g],fill=shade(base if cfg['texture']!='grass' or kind in('top','single') and False else (122,62,42),0.72)+(255,))
    d.rectangle([g,g,size-1-g,size-1-g],outline=shade(base,0.55)+(255,),width=2)
    return im

def hazard_frames(cfg,n=4,w=128,h=32):
    col=hexrgb(cfg['hazard_col']); fr=[]
    for k in range(n):
        im=Image.new('RGBA',(w,h),(0,0,0,0)); d=ImageDraw.Draw(im)
        if cfg['hazard']=='lava':
            ph=k/n*2*math.pi
            top=[(x, 8+4*math.sin(x/w*4*math.pi+ph)) for x in range(0,w+1,4)]
            d.polygon(top+[(w,h),(0,h)],fill=col+(255,))
            d.line(top,fill=(255,214,90,255),width=3)
            for i in range(3):
                bx=(i*47+k*11)%w; d.ellipse([bx,14+i*4,bx+6,20+i*4],fill=(255,220,120,255))
        elif cfg['hazard']=='laser':
            a=int(180+60*math.sin(k/n*2*math.pi))
            d.rectangle([0,h//2-6,w,h//2+6],fill=col+(a//3,)); d.rectangle([0,h//2-2,w,h//2+2],fill=(255,240,250,255))
        else:
            d.rectangle([0,0,w,h],fill=col+(40+20*k,))
        fr.append(im)
    return fr

def far_bg(cfg,W,H):
    c1,c2=np.array(hexrgb(cfg['sky'][0]),float),np.array(hexrgb(cfg['sky'][1]),float)
    t=np.linspace(0,1,H)[:,None,None]**1.3; img=(c1*(1-t)+c2*t)*np.ones((H,W,1))
    im=Image.fromarray(img.astype(np.uint8)).convert('RGBA'); d=ImageDraw.Draw(im,'RGBA')
    gc=hexrgb(cfg['grid']); step=max(16,W//60)
    for x in range(0,W,step): d.line([(x,0),(x,H)],fill=gc+(6,))
    for y in range(0,H,step): d.line([(0,y),(W,y)],fill=gc+(6,))
    if cfg['stars']:
        r=np.random.default_rng(7)
        for _ in range(int(W*H/9000)):
            x,y=r.integers(0,W),r.integers(0,int(H*0.7)); s=r.choice([1,1,1,2]); a=int(r.uniform(90,230))
            d.rectangle([x,y,x+s,y+s],fill=(236,241,254,a))
        mx,my,mr=int(W*0.82),int(H*0.16),int(H*0.05)
        glow=Image.new('RGBA',im.size,(0,0,0,0)); gd=ImageDraw.Draw(glow); gd.ellipse([mx-mr*3,my-mr*3,mx+mr*3,my+mr*3],fill=(236,241,254,40))
        im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(mr))); d=ImageDraw.Draw(im,'RGBA'); d.ellipse([mx-mr,my-mr,mx+mr,my+mr],fill=(236,241,254,255))
    # distant voxel skyline
    sil=hexrgb(cfg['sil']); r=np.random.default_rng(11); x=0; bs=max(12,W//80)
    while x<W:
        cols=r.integers(2,6); hgt=r.integers(3,14)
        for cx in range(cols):
            hh=hgt+r.integers(-1,2)
            for k in range(hh):
                y0=H-(k+1)*bs; d.rectangle([x+cx*bs+1,y0+1,x+(cx+1)*bs-1,y0+bs-1],fill=sil+(200,))
        x+=(cols+r.integers(1,4))*bs
    return im

def mid_bg(cfg,W,H):
    im=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(im,'RGBA'); b=hexrgb(cfg['block']); r=np.random.default_rng(5); bs=max(20,W//48)
    x=int(bs*2)
    while x<W-bs*4:
        cols=r.integers(1,4); hgt=r.integers(2,8)
        for cx in range(cols):
            for k in range(hgt-(cx%2)):
                y0=H-(k+1)*bs; col=shade(b,0.35)
                d.rectangle([x+cx*bs+1,y0+1,x+(cx+1)*bs-2,y0+bs-2],fill=col+(150,)); d.rectangle([x+cx*bs+1,y0+1,x+(cx+1)*bs-2,y0+4],fill=shade(b,0.5)+(170,))
        x+=(cols+r.integers(3,7))*bs
    return im

os.makedirs('out/textures/arenas',exist_ok=True); os.makedirs('out/models/arenas',exist_ok=True)
for key,cfg in ARENAS.items():
    od=f'out/textures/arenas/{key}'; os.makedirs(od,exist_ok=True)
    for (W,H),suf in (((2048,1152),'@2x'),((1024,576),'')):
        far_bg(cfg,W,H).convert('RGB').save(f'{od}/bg_far{suf}.webp','WEBP',quality=80,method=6)
        mid_bg(cfg,W,H//2).save(f'{od}/bg_mid{suf}.webp','WEBP',quality=82,method=6)
    # tiles atlas: top, fill, single + 4 hazard frames
    tiles={'top':block_tile(cfg,'top'),'fill':block_tile(cfg,'fill'),'single':block_tile(cfg,'single')}
    fr=hazard_frames(cfg)
    sheet=Image.new('RGBA',(256,256),(0,0,0,0)); meta={'frames':{},'meta':{'image':'tiles.webp','size':{'w':256,'h':256},'scale':'1'}}
    for i,(k,im) in enumerate(tiles.items()):
        sheet.paste(im,(i*64+i*4,0)); meta['frames'][f'tile_{k}']={'frame':{'x':i*68,'y':0,'w':64,'h':64},'rotated':False,'trimmed':False,'spriteSourceSize':{'x':0,'y':0,'w':64,'h':64},'sourceSize':{'w':64,'h':64}}
    for i,im in enumerate(fr):
        y=72+i*36; sheet.paste(im,(0,y)); meta['frames'][f'hazard_{i}']={'frame':{'x':0,'y':y,'w':128,'h':32},'rotated':False,'trimmed':False,'spriteSourceSize':{'x':0,'y':0,'w':128,'h':32},'sourceSize':{'w':128,'h':32}}
    sheet.save(f'{od}/tiles.webp','WEBP',lossless=True); json.dump(meta,open(f'{od}/tiles.json','w'),indent=1)
    L=dict(LAYOUT[key]); L.update({'id':key,'title':cfg['title'],'tileSize':T,'cols':COLS,'rows':ROWS,'world':{'w':WW,'h':WH},
        'palette':{'block':cfg['block'],'accent':cfg['accent'],'hazard':cfg['hazard_col'],'sky':list(cfg['sky'])},
        'parallax':{'far':0.1,'mid':0.4},'textures':{'far':f'textures/arenas/{key}/bg_far','mid':f'textures/arenas/{key}/bg_mid','tiles':f'textures/arenas/{key}/tiles'}})
    json.dump(L,open(f'out/models/arenas/{key}.json','w'),indent=1)
print('arenas done')
