# Tegner Vagt-app-ikoner (kalender med flueben) som PNG
from PIL import Image, ImageDraw, ImageFont
BLUE=(31,78,121); WHITE=(255,255,255); ACC=(46,125,50)
def draw(size, maskable=False):
    S=size*4
    im=Image.new('RGBA',(S,S),BLUE+(255,) if maskable else (0,0,0,0))
    d=ImageDraw.Draw(im)
    if not maskable: d.rounded_rectangle([0,0,S-1,S-1],radius=int(S*0.22),fill=BLUE)
    pad=S*(0.24 if maskable else 0.17)
    x0,y0,x1,y1=pad,pad*1.12,S-pad,S-pad*0.92
    d.rounded_rectangle([x0,y0,x1,y1],radius=int(S*0.06),fill=WHITE)
    d.rounded_rectangle([x0,y0,x1,y0+(y1-y0)*0.24],radius=int(S*0.06),fill=(220,53,69))
    d.rectangle([x0,y0+(y1-y0)*0.14,x1,y0+(y1-y0)*0.24],fill=(220,53,69))
    for fx in (0.3,0.7):
        cx=x0+(x1-x0)*fx; d.rounded_rectangle([cx-S*0.022,y0-S*0.05,cx+S*0.022,y0+S*0.06],radius=int(S*0.02),fill=(230,230,230))
    # flueben
    w=(x1-x0); h=(y1-y0); bx=x0; by=y0+h*0.24
    pts=[(bx+w*0.25,by+(y1-by)*0.52),(bx+w*0.43,by+(y1-by)*0.72),(bx+w*0.76,by+(y1-by)*0.28)]
    d.line(pts,fill=ACC,width=int(S*0.075),joint='curve')
    return im.resize((size,size),Image.LANCZOS)
for n in (192,512): draw(n).save(f'icons/icon-{n}.png')
draw(512,True).save('icons/maskable-512.png'); draw(192,True).save('icons/maskable-192.png')
draw(180,True).convert('RGB').save('icons/apple-touch-icon.png')
draw(48).save('icons/favicon-48.png')
