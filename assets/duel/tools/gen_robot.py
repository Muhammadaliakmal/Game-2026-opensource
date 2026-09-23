O='#0C0D14'
def s(p,vb,body,w,h): open(p,'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{w}" height="{h}">{body}</svg>')
# Parts drawn facing RIGHT. Body parts are white/grey (fixed). Limb parts are greyscale -> tint at runtime with accent.
# head 64x64 (collider: box 44x38 centered)
s('src/svg/robot/head.svg','0 0 64 64',
 f'<rect x="31" y="2" width="2.5" height="12" fill="#8A8FA3"/><circle cx="32.2" cy="4" r="3.6" fill="#FCF08B" stroke="{O}" stroke-width="1.2"/>'
 f'<rect x="10" y="13" width="44" height="40" rx="7" fill="#FFFFFF" stroke="{O}" stroke-width="2.5"/>'
 f'<rect x="10" y="41" width="44" height="12" rx="7" fill="#DCE1EE"/><rect x="10" y="41" width="44" height="6" fill="#DCE1EE"/>'
 f'<rect x="10" y="13" width="44" height="40" rx="7" fill="none" stroke="{O}" stroke-width="2.5"/>'
 f'<rect x="25" y="22" width="26" height="15" rx="4" fill="#1D1D27"/>'
 f'<rect x="39" y="25" width="5" height="9" rx="2" fill="#00FEF5"/><rect x="31" y="25" width="5" height="9" rx="2" fill="#00FEF5" opacity=".75"/>'
 f'<rect x="12" y="24" width="4" height="12" rx="2" fill="#00FEF5" opacity=".9"/>',64,64)
s('src/svg/robot/head_ko.svg','0 0 64 64',
 f'<rect x="31" y="2" width="2.5" height="12" fill="#8A8FA3"/><circle cx="32.2" cy="4" r="3.6" fill="#5A5C6E" stroke="{O}" stroke-width="1.2"/>'
 f'<rect x="10" y="13" width="44" height="40" rx="7" fill="#FFFFFF" stroke="{O}" stroke-width="2.5"/><rect x="25" y="22" width="26" height="15" rx="4" fill="#1D1D27"/>'
 f'<path d="M31 25 l6 8 M37 25 l-6 8 M40 25 l6 8 M46 25 l-6 8" stroke="#F271B4" stroke-width="2.2" stroke-linecap="round"/>',64,64)
# torso 48x64 (collider box 36x44)
s('src/svg/robot/torso.svg','0 0 48 64',
 f'<rect x="6" y="8" width="36" height="48" rx="8" fill="#FFFFFF" stroke="{O}" stroke-width="2.5"/>'
 f'<rect x="8.5" y="40" width="31" height="13.5" rx="6" fill="#DCE1EE"/>'
 f'<rect x="33" y="16" width="4" height="22" rx="2" fill="#00FEF5"/>'
 f'<rect x="14" y="18" width="14" height="10" rx="3" fill="#ECF1FE" stroke="#C7CCDA" stroke-width="1.5"/>'
 f'<circle cx="18" cy="23" r="1.8" fill="#A3E436"/><circle cx="24" cy="23" r="1.8" fill="#F29D0C"/>',48,64)
# limbs: greyscale capsule 20x40 (collider capsule w14 h32); upper & lower share art
limb=lambda shade:(f'<rect x="3" y="4" width="14" height="32" rx="7" fill="{shade}" stroke="{O}" stroke-width="2.2"/>'
 f'<rect x="5" y="7" width="4" height="24" rx="2" fill="#FFFFFF" opacity=".55"/>')
s('src/svg/robot/limb_upper.svg','0 0 20 40',limb('#D9D9D9'),20,40)
s('src/svg/robot/limb_lower.svg','0 0 20 40',limb('#C8C8C8'),20,40)
# hand 24x24, foot 32x20 (greyscale -> tint)
s('src/svg/robot/hand.svg','0 0 24 24',f'<rect x="3" y="3" width="18" height="18" rx="6" fill="#CFCFCF" stroke="{O}" stroke-width="2.2"/><rect x="6" y="6" width="6" height="5" rx="2" fill="#FFFFFF" opacity=".6"/>',24,24)
s('src/svg/robot/foot.svg','0 0 32 20',f'<rect x="2" y="3" width="28" height="15" rx="5" fill="#A8A8A8" stroke="{O}" stroke-width="2.2"/><rect x="5" y="5" width="10" height="4" rx="2" fill="#FFFFFF" opacity=".5"/>',32,20)
# joint cap
s('src/svg/robot/joint.svg','0 0 16 16',f'<circle cx="8" cy="8" r="6" fill="#3A3C49" stroke="{O}" stroke-width="2"/>',16,16)

# Controls matching site: dark joystick base + white knob; round buttons with mono labels
C='font-family="JetBrains Mono,IBM Plex Mono,Menlo,monospace" font-weight="700" letter-spacing="1.5" text-anchor="middle"'
s('src/svg/controls/joystick_base.svg','0 0 256 256','<circle cx="128" cy="128" r="120" fill="#1D1D27" fill-opacity=".82"/><circle cx="128" cy="128" r="119" fill="none" stroke="#FFFFFF" stroke-opacity=".08" stroke-width="2"/>',256,256)
s('src/svg/controls/joystick_knob.svg','0 0 128 128','<circle cx="64" cy="66" r="56" fill="#000" opacity=".25"/><circle cx="64" cy="62" r="56" fill="#ECF1FE"/><circle cx="64" cy="62" r="55" fill="none" stroke="#FFFFFF" stroke-width="2"/>',128,128)
def btn(name,label,ring,text,fill='#1D1D27',glow=False,r=60):
    g=f'<circle cx="64" cy="64" r="62" fill="{ring}" opacity=".25"/>' if glow else ''
    s(f'src/svg/controls/{name}.svg','0 0 128 128',g+f'<circle cx="64" cy="64" r="{r}" fill="{fill}" fill-opacity=".9" stroke="{ring}" stroke-width="3"/><text x="64" y="71" font-size="19" {C} fill="{text}">{label}</text>',128,128)
btn('btn_jump','JUMP','#00FEF5','#00FEF5',glow=True)
btn('btn_jump_pressed','JUMP','#00FEF5','#0C0D14',fill='#00FEF5',glow=True)
btn('btn_ability','SKILL','#9AA0B8','#ECF1FE',fill='#23222D')
btn('btn_ability_ready','SKILL','#A654F4','#FFFFFF',fill='#A654F4',glow=True)
btn('btn_block','BLOCK','#9AA0B8','#ECF1FE',fill='#23222D')
btn('btn_rematch','AGAIN','#3A3C49','#9AA0B8',r=46)
print('ok')
