import glob,re
M={'#0A0F1E':'#0C0D14','#22E6FF':'#00FEF5','#7CF3FF':'#8FFFF9','#FF3DAE':'#F271B4','#FF8AD0':'#F7A8D2','#FFD1EC':'#FDE3F1',
   '#FFB21E':'#F29D0C','#FF9500':'#D98A08','#E08600':'#B97406','#FF7A1A':'#F29D0C','#8B7CFF':'#A654F4','#3DFF9A':'#A3E436',
   '#13244A':'#1D1D27','#2A3350':'#23222D','#48557F':'#3A3C49','#3B4766':'#2C2B38','#566389':'#3A3C49','#4B587E':'#3A3C49',
   '#2E3A5E':'#23222D','#1B2238':'#1D1D27','#5E6C8C':'#5A5C6E','#8FA3C8':'#9AA0B8','#E6F4FF':'#ECF1FE','#F4F8FF':'#FFFFFF',
   '#FFD54A':'#FCD34D','#E0A800':'#F29D0C','#FFF3B0':'#FCF08B'}
for f in glob.glob('src/svg/**/*.svg',recursive=True):
    s=open(f).read()
    for a,b in M.items(): s=re.sub(a,b,s,flags=re.I)
    s=s.replace('Arial Black,Arial','Arial Black,Arial,sans-serif')
    open(f,'w').write(s)
print('recolored')
