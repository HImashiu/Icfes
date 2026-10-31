# review.py e s : flagged units of a loaded session -> Rv/<e>_<s>.json rows (scan + after images, notes)
import sys,os,json,glob,re,subprocess,base64,io
from PIL import Image, ImageDraw, ImageFont
e,s=sys.argv[1:3]; S='/home/claude/work'
M=f'/mnt/project-files/icfes/pipeline/fix-20261026/merge/{e}_{s}'; W=f'{S}/R/{e}-{s}'
D=glob.glob(f'{S}/crop/crops/S11-_{e}_{s}_*')[0]
rep=json.load(open(W+'/rep.json'))['units']; cov=json.load(open(W+'/coverage-m.json'))
fb=json.load(open(M+'/fallback.json')); used=set(fb['fallback'])
man=json.load(open(M+'/manifest.json'))['figures']
INSTR=set('acuerdo informacion preguntas pregunta responda siguiente siguientes con las los la el de del lea marque hoja respuesta respuestas cada correcta parte ejemplo arriba abajo inferior pliegue para seleccione texto palabra espacio letra adecuada articulo luego que en y a una uno un se su sus por al lo e o como esta este entre tabla figura grafica'.split())
flags={}
def add(u,n):
    l=flags.setdefault(u,[])
    if n not in l: l.append(n)
for u,x in rep.items():
    if x.get('errors'): add(u,'gpt-5 answer did not apply: earlier version kept')
    elif u in used: add(u,'Earlier version kept: '+'; '.join(sorted({r.split(': ',1)[-1] for r in x.get('rejected',[]) if not r.startswith('other')}))[:220])
for f in man:
    if f.get('review') and f.get('question'): add('q%d'%f['question'],'Option pictures: check each option has its own')
for u,c in cov.items():
    n=int(re.findall(r'\d+',u)[0])
    if n>=80 and s=='2da': continue
    miss=[w for w in c['missing'] if w not in INSTR and not re.match(r'^\d+[a-z]',w)]
    ext=[w for w in c['extra'] if w not in INSTR]
    # Azure misreads (e.g. 'parebola' for 'parabola') pair with a typed word: not a real drop
    import difflib
    pool=list(ext); m2=[]
    for w in miss:
        hit=difflib.get_close_matches(w,pool,1,0.7)
        if hit: pool.remove(hit[0])
        else: m2.append(w)
    raw=c['missing']
    miss=[w for w in m2 if len(w)>3]
    ext=[w for w in pool if len(w)>3 and not difflib.get_close_matches(w,raw,1,0.7)]
    if len(miss)>=3: add(u,'Printed words not found in the text: '+', '.join(miss[:8]))
    if len(ext)>=3: add(u,'Words not printed in this question: '+', '.join(ext[:8]))
mrep=W+'/mathrep.json'
units=sorted(flags,key=lambda u:int(re.findall(r'\d+',u)[0]))
out=f'{S}/Rv/r-{e}_{s}'; figs=f'{S}/Rv/f-{e}_{s}'
subprocess.run(f'rm -rf {out} {figs}; mkdir -p {figs}; cp {M}/png/* {M}/manifest.json {figs}/',shell=True,check=True)
if units:
    subprocess.run(['python3','-m','icfes_polish.render_check','render','--golden',f'{M}/S11-{e}_{s}.golden.json','--figures',figs,'--renderer','/mnt/project-files/icfes/pipeline/renderer','--out',out,'--only',','.join(units)],cwd='/home/claude/icfes',check=True,capture_output=True)
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',22)
def lab(img,text,col):
    W=600; img=img.convert('RGB'); img=img.resize((W,max(1,int(img.height*W/img.width))))
    o=Image.new('RGB',(W,img.height+40),'white'); d=ImageDraw.Draw(o); d.rectangle([0,0,W,36],fill=col); d.text((10,6),text,fill='white',font=font); o.paste(img,(0,40)); return o
rows=[]
for u in units:
    n=int(re.findall(r'\d+',u)[0])
    src=os.path.join(D,'q%03d.png'%n) if u.startswith('q') else os.path.join(D,u+'.png')
    parts=[]
    if os.path.exists(src): parts.append(lab(Image.open(src),'Booklet scan','#3d4a45'))
    if os.path.exists(f'{out}/{u}.png'): parts.append(lab(Image.open(f'{out}/{u}.png'),'Now in your editor','#1f6f5c'))
    if not parts: continue
    H=sum(p.height+16 for p in parts); C=Image.new('RGB',(600,H),'white'); y=0
    for p in parts: C.paste(p,(0,y)); y+=p.height+16
    if C.height>5000: C=C.resize((int(C.width*5000/C.height),5000))
    bio=io.BytesIO(); C.save(bio,'JPEG',quality=55,optimize=True)
    rows.append({'u':u,'img':'data:image/jpeg;base64,'+base64.b64encode(bio.getvalue()).decode(),'notes':flags[u]})
json.dump(rows,open(f'{S}/Rv/{e}_{s}.json','w'))
print(e,s,len(rep),'units',len(rows),'flagged',round(os.path.getsize(f'{S}/Rv/{e}_{s}.json')/1e6,1),'MB')
