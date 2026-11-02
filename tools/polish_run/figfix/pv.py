# pv.py slug page [x0 y0 x1 y1] -> gridded render with inch labels (0.5in grid)
import sys,os,re
import pypdfium2 as pdfium
from PIL import ImageDraw
JS='/mnt/user-data/uploads/Downloads/icfes-azure-data/json'; IN='/mnt/user-data/uploads/Downloads/icfes-azure-input'
def pdfpath(slug):
    if slug.startswith('S11-P'): return IN+'/S11- P    1era y 2da sesion.pdf'
    e,s=slug[4:].split('_')
    return IN+'/'+[f for f in os.listdir(IN) if re.match(rf'S11- {e}\s+{s}',f)][0]
if __name__=='__main__':
    slug=sys.argv[1]; pg=int(sys.argv[2]); box=[float(x) for x in sys.argv[3:7]] if len(sys.argv)>6 else None
    page=pdfium.PdfDocument(pdfpath(slug))[pg-1]; S=100 if not box else 150
    im=page.render(scale=S/72).to_pil().convert('RGB'); pw,ph=page.get_size(); W,H=pw/72,ph/72
    if not box: box=[0,0,W,H]
    im=im.crop((int(box[0]*S),int(box[1]*S),int(box[2]*S),int(box[3]*S))); d=ImageDraw.Draw(im)
    x=(int(box[0]*2)+1)/2
    while x<box[2]:
        X=(x-box[0])*S; d.line([(X,0),(X,im.height)],fill=(255,0,0) if x==int(x) else (255,170,170)); d.text((X+2,2),f'{x:g}',fill=(255,0,0)); x+=0.5
    y=(int(box[1]*2)+1)/2
    while y<box[3]:
        Y=(y-box[1])*S; d.line([(0,Y),(im.width,Y)],fill=(0,0,255) if y==int(y) else (170,170,255)); d.text((2,Y+2),f'{y:g}',fill=(0,0,255)); y+=0.5
    out=f'/home/claude/work/crop2/pv/{slug}-p{pg}.png'; im.save(out); print(out,im.size)
