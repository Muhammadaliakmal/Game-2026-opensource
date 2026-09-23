import cairosvg, io, json, glob, os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
OUT='out/textures/atlases'; os.makedirs(OUT,exist_ok=True)

def raster(svg, scale):
    data=open(svg,'rb').read()
    png=cairosvg.svg2png(bytestring=data, scale=scale)
    return Image.open(io.BytesIO(png)).convert('RGBA')

def pack(frames, name, max_w=2048, pad=2):
    # frames: dict key->Image ; shelf pack sorted by height
    items=sorted(frames.items(), key=lambda kv:(-kv[1].height,-kv[1].width))
    W=64
    while True:
        x=y=shelf=0; pos={}; ok=True
        for k,im in items:
            w,h=im.width+pad*2, im.height+pad*2
            if w>W: ok=False; break
            if x+w>W: x=0; y+=shelf; shelf=0
            pos[k]=(x,y); x+=w; shelf=max(shelf,h)
        H=y+shelf
        if ok and H<=W: break
        W*=2
        if W>max_w: raise SystemExit(f'{name} too big')
    H2=1
    while H2<H: H2*=2
    sheet=Image.new('RGBA',(W,H2),(0,0,0,0))
    meta={'frames':{}, 'meta':{'app':'ragdoll-rumble-packer','image':f'{name}.webp','format':'RGBA8888','size':{'w':W,'h':H2},'scale':'1'}}
    for k,im in items:
        px,py=pos[k]
        # extrude 1px border to kill bleeding
        ex=im.resize((im.width+2,im.height+2),Image.NEAREST); sheet.paste(ex,(px+pad-1,py+pad-1),ex)
        sheet.paste(im,(px+pad,py+pad))
        meta['frames'][k]={'frame':{'x':px+pad,'y':py+pad,'w':im.width,'h':im.height},'rotated':False,'trimmed':False,
            'spriteSourceSize':{'x':0,'y':0,'w':im.width,'h':im.height},'sourceSize':{'w':im.width,'h':im.height}}
    sheet.save(f'{OUT}/{name}.webp','WEBP',quality=92,method=6)
    sheet.save(f'{OUT}/{name}.png','PNG',optimize=True)   # fallback / source of truth
    json.dump(meta,open(f'{OUT}/{name}.json','w'),indent=1)
    return W,H2

def svgset(pattern,prefix,scale):
    return {prefix+os.path.splitext(os.path.basename(f))[0]: raster(f,scale) for f in sorted(glob.glob(pattern))}

# ---- procedural VFX (white, tint at runtime) ----
def radial(size,power=2.0,core=0.0):
    y,x=np.mgrid[0:size,0:size]; c=(size-1)/2
    d=np.sqrt((x-c)**2+(y-c)**2)/c; a=np.clip(1-d,0,1)**power
    if core: a=np.maximum(a, (d<core)*1.0)
    img=np.zeros((size,size,4),np.uint8); img[...,:3]=255; img[...,3]=(a*255).astype(np.uint8); return Image.fromarray(img)
def ring(size,th=0.12):
    y,x=np.mgrid[0:size,0:size]; c=(size-1)/2; d=np.sqrt((x-c)**2+(y-c)**2)/c
    a=np.exp(-((d-0.85)/th)**2); img=np.zeros((size,size,4),np.uint8); img[...,:3]=255; img[...,3]=(np.clip(a,0,1)*255).astype(np.uint8); return Image.fromarray(img)
def streak(w,h):
    y,x=np.mgrid[0:h,0:w]; a=(1-np.abs((y-(h-1)/2)/((h-1)/2)))**1.5 * (x/(w-1))**0.7
    img=np.zeros((h,w,4),np.uint8); img[...,:3]=255; img[...,3]=(np.clip(a,0,1)*255).astype(np.uint8); return Image.fromarray(img)
def trail(w,h):
    y,x=np.mgrid[0:h,0:w]; a=(1-np.abs((y-(h-1)/2)/((h-1)/2)))**0.8 * (x/(w-1))
    img=np.zeros((h,w,4),np.uint8); img[...,:3]=255; img[...,3]=(np.clip(a,0,1)*255).astype(np.uint8); return Image.fromarray(img)
def star(size,points=4):
    im=Image.new('L',(size*2,size*2),0); d=ImageDraw.Draw(im); c=size
    pts=[]
    for i in range(points*2):
        r= c*0.95 if i%2==0 else c*0.18; a=math.pi*i/points - math.pi/2
        pts.append((c+r*math.cos(a),c+r*math.sin(a)))
    d.polygon(pts,fill=255); im=im.resize((size,size),Image.LANCZOS)
    rgba=Image.new('RGBA',(size,size),(255,255,255,0)); rgba.putalpha(im); return rgba
def splat(size,seed):
    rng=np.random.default_rng(seed); im=Image.new('L',(size*2,size*2),0); d=ImageDraw.Draw(im); c=size
    d.ellipse([c-size*0.45,c-size*0.45,c+size*0.45,c+size*0.45],fill=255)
    for _ in range(9):
        a=rng.uniform(0,2*math.pi); r=rng.uniform(0.5,0.9)*size; rr=rng.uniform(0.06,0.16)*size
        x,y=c+r*math.cos(a),c+r*math.sin(a); d.ellipse([x-rr,y-rr,x+rr,y+rr],fill=255)
        d.line([c,c,x,y],fill=255,width=int(rr*1.2))
    im=im.filter(ImageFilter.GaussianBlur(1.5)).resize((size,size),Image.LANCZOS)
    rgba=Image.new('RGBA',(size,size),(255,255,255,0)); rgba.putalpha(im); return rgba
def puff(size):
    y,x=np.mgrid[0:size,0:size]; c=(size-1)/2; d=np.sqrt((x-c)**2+(y-c)**2)/c
    rng=np.random.default_rng(3); n=rng.random((size,size)); n=np.array(Image.fromarray((n*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(size/10)))/255
    a=np.clip((1-d)*1.6-0.2+ (n-0.5)*0.8,0,1)*0.8
    img=np.zeros((size,size,4),np.uint8); img[...,:3]=255; img[...,3]=(a*255).astype(np.uint8); return Image.fromarray(img)
def square(size):  # voxel debris chip
    im=Image.new('RGBA',(size,size),(0,0,0,0)); d=ImageDraw.Draw(im)
    d.rectangle([1,1,size-2,size-2],fill=(255,255,255,255)); d.rectangle([1,size*0.62,size-2,size-2],fill=(215,215,215,255)); return im

def vfx(scale):
    s=lambda n:int(n*scale)
    f={'glow_disc':radial(s(64),2.2),'glow_soft':radial(s(128),3.0),'spark_streak':streak(s(48),s(8)),'trail_ribbon':trail(s(128),s(16)),
       'shock_ring':ring(s(128)),'hit_star':star(s(96)),'dust_puff':puff(s(48)),'voxel_chip':square(s(12)),'pixel_dot':radial(s(8),1.0,core=0.6)}
    for i in range(3): f[f'ink_splat_{i}']=splat(s(64),i+7)
    return f

for sc,suf in ((1,''),(2,'@2x')):
    r=svgset('src/svg/robot/*.svg','robot/',sc)
    print('robot',suf,pack(r,'robot'+suf))
    it=svgset('src/svg/weapons/*.svg','weapon/',sc*0.5); it.update(svgset('src/svg/headgear/*.svg','head/',sc*0.5))
    print('items',suf,pack(it,'items'+suf))
    ui=svgset('src/svg/ui/*.svg','ui/',sc*0.5); ui.update(svgset('src/svg/controls/*.svg','ctl/',sc*0.75))
    print('ui',suf,pack(ui,'ui'+suf))
    print('vfx',suf,pack(vfx(sc),'vfx'+suf))
