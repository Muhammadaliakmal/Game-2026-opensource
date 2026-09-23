import json, math
from PIL import Image, ImageDraw, ImageOps
A='out/textures/atlases/'
def frames(name):
    m=json.load(open(A+name+'.json')); sh=Image.open(A+name+'.webp').convert('RGBA')
    return {k:sh.crop((v['frame']['x'],v['frame']['y'],v['frame']['x']+v['frame']['w'],v['frame']['y']+v['frame']['h'])) for k,v in m['frames'].items()}
R=frames('robot@2x'); I=frames('items@2x'); V=frames('vfx@2x')
def tint(im,hexc):
    c=tuple(int(hexc[i:i+2],16) for i in (1,3,5)); a=im.split()[3]
    g=ImageOps.grayscale(im).point(lambda v:v/255.0*1.0*255)
    out=Image.merge('RGBA',[g.point(lambda v,ci=ci:int(v*ci/255)) for ci in c]+[a]); return out
def put(canvas,im,cx,cy,ang=0,sc=1.0):
    if sc!=1: im=im.resize((int(im.width*sc),int(im.height*sc)),Image.LANCZOS)
    r=im.rotate(ang,expand=True,resample=Image.BICUBIC); canvas.alpha_composite(r,(int(cx-r.width/2),int(cy-r.height/2)))
def robot(canvas,x,y,accent,weapon,pose=0,flip=False,sc=0.5,hat=None):
    L=lambda k:tint(R['robot/'+k],accent)
    def P(dx,dy): return (x-dx*sc if flip else x+dx*sc, y+dy*sc)
    f=-1 if flip else 1
    # legs
    put(canvas,L('limb_upper'),*P(-10,62),ang=f*(-15-pose*10),sc=sc); put(canvas,L('limb_lower'),*P(-14,120),ang=f*5,sc=sc); put(canvas,L('foot'),*P(-8,150),sc=sc)
    put(canvas,L('limb_upper'),*P(12,62),ang=f*(20+pose*8),sc=sc); put(canvas,L('limb_lower'),*P(22,120),ang=f*(-10),sc=sc); put(canvas,L('foot'),*P(30,150),sc=sc)
    put(canvas,R['robot/torso'] if not flip else ImageOps.mirror(R['robot/torso']),*P(0,10),sc=sc)
    hd=R['robot/head'] if not flip else ImageOps.mirror(R['robot/head']); put(canvas,hd,*P(4,-60),sc=sc)
    if hat: 
        h=I['head/'+hat]; h=h if not flip else ImageOps.mirror(h); put(canvas,h,*P(4,-96),sc=sc*0.8)
    # weapon arm reaching
    wa=-35-pose*40
    put(canvas,L('limb_upper'),*P(26,-4),ang=f*(90+wa)*-1 if False else (-(90+wa) if not flip else (90+wa)),sc=sc)
    hx,hy=P(26+50*math.cos(math.radians(wa)),-4+50*math.sin(math.radians(wa)))
    w=I['weapon/'+weapon]; w=w if not flip else ImageOps.mirror(w)
    wr=w.rotate(-wa if not flip else wa,expand=True,resample=Image.BICUBIC)
    # place grip near hand: approximate by offset along direction
    L2=w.width*sc*0.5-12*sc; dx=math.cos(math.radians(wa))*L2*f; dy=math.sin(math.radians(wa))*L2
    put(canvas,w,hx+dx,hy+dy,ang=(-wa if not flip else wa),sc=sc)
    put(canvas,L('hand'),hx,hy,sc=sc)
def arena(key,out,W=1920,H=1088):
    base=f'out/textures/arenas/{key}/'; L=json.load(open(f'out/models/arenas/{key}.json'))
    c=Image.open(base+'bg_far@2x.webp').convert('RGBA').resize((W,H))
    mid=Image.open(base+'bg_mid@2x.webp').convert('RGBA').resize((W,H//2)); c.alpha_composite(mid,(0,H-H//2-120))
    tm=json.load(open(base+'tiles.json')); ts=Image.open(base+'tiles.webp').convert('RGBA')
    g=lambda k:ts.crop((tm['frames'][k]['frame']['x'],tm['frames'][k]['frame']['y'],tm['frames'][k]['frame']['x']+tm['frames'][k]['frame']['w'],tm['frames'][k]['frame']['y']+tm['frames'][k]['frame']['h']))
    T=64
    rects=[r for r in L['platforms']]+[m['rect'] for m in L['moving']]
    for (x,y,w,h) in rects:
        for i in range(w):
            for j in range(h):
                c.alpha_composite(g('tile_top' if j==0 else 'tile_fill'),((x+i)*T,(y+j)*T))
        d=ImageDraw.Draw(c,'RGBA'); acc=L['palette']['accent']; ac=tuple(int(acc[k:k+2],16) for k in (1,3,5))
        d.line([(x*T,y*T),((x+w)*T,y*T)],fill=ac+(255,),width=3)
    for hz in L['hazards']:
        if hz['type']=='lava':
            x,y,w,h=hz['rect']
            for i in range(0,w*T,128):
                c.alpha_composite(g('hazard_0'),(i,y*T)); 
            d=ImageDraw.Draw(c); d.rectangle([0,y*T+32,W,H],fill=(255,90,31))
        if hz['type']=='laser_sweep':
            for i in range(0,W,128): c.alpha_composite(g('hazard_1'),(i,hz['row']*T+16))
        if hz['type']=='portal_pair':
            for p in (hz['a'],hz['b']):
                put(c,tint(V['shock_ring'],'#A654F4'),p[0]*T+32,p[1]*T,sc=1.0); put(c,tint(V['glow_soft'],'#F271B4'),p[0]*T+32,p[1]*T,sc=0.6)
    s1,s2=L['spawns']
    put(c,tint(V['trail_ribbon'],'#00FEF5'),s1[0]*T+150,s1[1]*T-60,ang=20,sc=1.3)
    robot(c,s1[0]*T+40,s1[1]*T-40,'#A654F4','rebar',pose=0.3,hat=None,sc=0.55)
    robot(c,s2[0]*T,s2[1]*T-40,'#F29D0C','pylon_maul',pose=0.8,flip=True,hat='hard_hat',sc=0.55)
    put(c,tint(V['hit_star'],'#FCF08B'),(s1[0]+s2[0])*T/2+20,s1[1]*T-100,sc=1.0)
    c.convert('RGB').save(out,quality=86)
import os; os.makedirs('out/previews',exist_ok=True)
for k in ['magma_gauntlet','ice_cascade','violet_loom','island_garden']: arena(k,f'out/previews/arena_{k}.jpg')
ims=[Image.open(f'out/previews/arena_{k}.jpg').resize((960,544)) for k in ['magma_gauntlet','ice_cascade','violet_loom','island_garden']]
s=Image.new('RGB',(1920,1088)); [s.paste(im,((i%2)*960,(i//2)*544)) for i,im in enumerate(ims)]; s.save('/home/claude/check2.jpg',quality=80)
