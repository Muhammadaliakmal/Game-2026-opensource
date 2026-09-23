import trimesh, numpy as np
from trimesh.creation import box, cylinder, icosphere, capsule
R=trimesh.transformations.rotation_matrix
def col(m,h): m.visual.face_colors=np.tile([int(h[i:i+2],16) for i in (1,3,5)]+[255],(len(m.faces),1)); return m
def at(m,x,z,y=0.0): m.apply_translation([x,y,z]); return m   # build Z-up: (x, depth y, up z)
def B(w,h,d,c): return col(box(extents=[w,d,h]),c)
def yup(m): m.apply_transform(R(-np.pi/2,[1,0,0])); return m    # Z-up -> glTF Y-up (front faces +Z)
def robot(acc,dark):
    W,L,D,C='#FFFFFF','#DCE1EE','#1D1D27','#00FEF5'; p=[]
    p.append(at(B(.70,.60,.62,W),0,1.62))
    p.append(at(B(.46,.22,.02,D),0,1.64,-.315))                     # visor on front (-y = toward viewer after yup -> +z)
    p+= [at(B(.08,.13,.02,C),x,1.64,-.33) for x in (-.09,.09)]
    p.append(at(col(cylinder(radius=.025,height=.28,sections=8),'#8A8FA3'),0,2.06))
    p.append(at(col(icosphere(subdivisions=1,radius=.07),'#FCF08B'),0,2.22))
    p.append(at(B(.56,.66,.44,W),0,.98)); p.append(at(B(.58,.18,.46,L),0,.72))
    p.append(at(B(.05,.30,.02,C),.20,1.02,-.225))
    for s in (-1,1):
        p.append(at(col(capsule(radius=.09,height=.42,count=[8,4]),acc),s*.40,1.00))
        p.append(at(B(.2,.2,.2,acc),s*.40,.66))
        p.append(at(col(capsule(radius=.10,height=.36,count=[8,4]),acc),s*.15,.38))
        p.append(at(B(.26,.14,.34,dark),s*.15,.07,-.04))
    return yup(trimesh.util.concatenate(p))
V={'violet':('#A654F4','#5B3A9A'),'orange':('#F29D0C','#9A5E06'),'cyan':('#0EA4E6','#08618A'),'pink':('#F271B4','#9A3F70'),'lime':('#A3E436','#5E8A1C'),'yellow':('#FCF08B','#B7A83E')}
for n,(a,d) in V.items():
    m=robot(a,d); m.export(f'out/models/3d/robot_{n}.glb'); print(n,len(m.faces),'tris', np.round(m.bounds,2).tolist())
p=[at(col(cylinder(radius=.45,height=.12,sections=24),'#1D1D27'),0,.06),
   at(col(cylinder(radius=.07,height=.4,sections=12),'#F29D0C'),0,.32)]
cup=trimesh.creation.cone(radius=.42,height=.6,sections=24); cup.apply_transform(R(np.pi,[1,0,0])); p.append(at(col(cup,'#FCD34D'),0,1.12))
p.append(at(col(cylinder(radius=.44,height=.05,sections=24),'#FCF08B'),0,1.12))
for s in (-1,1):
    h=trimesh.creation.torus(.14,.035,major_sections=16,minor_sections=6); h.apply_transform(R(np.pi/2,[1,0,0])); p.append(at(col(h,'#FCD34D'),s*.42,.95))
p.append(at(col(icosphere(subdivisions=1,radius=.1),'#00FEF5'),0,1.24))
t=yup(trimesh.util.concatenate(p)); t.export('out/models/3d/trophy.glb'); print('trophy',len(t.faces),np.round(t.bounds,2).tolist())
