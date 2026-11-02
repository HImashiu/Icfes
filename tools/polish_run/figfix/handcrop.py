# handcrop.py entries.json [--apply] : entries [slug,n,page,[x0,y0,x1,y1] inches | "drop", [sids], opt|null]
import json,os,re,sys,io,hashlib,shutil
sys.path.insert(0,'/home/claude/work/mp')
import pypdfium2 as pdfium
from PIL import ImageOps
from pv import pdfpath
R='/mnt/project-files/icfes'; APPLY='--apply' in sys.argv
E=json.load(open(sys.argv[1])); by={}
for e in E: by.setdefault(e[0],[]).append(e)
os.makedirs('/home/claude/work/crop2/handout',exist_ok=True)
def unlink(obj,sids):
    f_=obj.get('figure')
    if isinstance(f_,str) and f_ in sids: obj['figure']=None
    elif isinstance(f_,list): obj['figure']=[x for x in f_ if x not in sids] or None
for slug,es in by.items():
    assert not slug.startswith('S11-A_')
    gp=f'{R}/data/{slug}.golden.json'; mp=f'{R}/figures/traced/{slug}/manifest.json'
    g=json.load(open(gp)); man=json.load(open(mp)); Q={q['number']:q for q in g['questions']}
    pdf=pdfium.PdfDocument(pdfpath(slug))
    prefix=re.sub(r'[^a-z0-9]','',slug[4:].split('_')[0].lower())+('1' if slug.endswith('1ra') else '2')
    for _,n,pg,box,sids,opt in es:
        q=Q[n]
        if box=='drop':
            print(slug,n,'drop',sids)
            unlink(q,sids)
            for o in q.get('options') or []: unlink(o,sids)
            for k in ('stimulus_md','stem_md'):
                if q.get(k): q[k]=re.sub(r'\[\[figura:(%s)(\|[^\]]*)?\]\]'%'|'.join(map(re.escape,sids)),'',q[k])
            continue
        page=pdf[pg-1]; S=200; im=page.render(scale=S/72).to_pil().convert('L'); pw,ph=page.get_size()
        c=ImageOps.autocontrast(im.crop(tuple(int(v*S) for v in box)),cutoff=1)
        b=io.BytesIO(); c.save(b,'PNG'); h=hashlib.md5(b.getvalue()).hexdigest()[:6]
        tag=f'-opt-{opt.lower()}' if opt else ''
        fid=f'{prefix}-q{n}{tag}-scan-{h}'
        c.save(f'/home/claude/work/crop2/handout/{slug}-q{n}{tag}.png'); print(slug,n,opt,'->',fid,c.size)
        if not APPLY: continue
        open(f'{R}/figures/traced/{slug}/{fid}.png','wb').write(b.getvalue())
        man['figures'].append({"question":n,"group":q.get('group_id'),"page":pg,"kind":"image","figure_id":fid,"spec_id":sids[0] if sids else None,"method":"manual_box","auto":False,"svg":f"traced/{slug}/{fid}.png","box_page_fraction":[round(box[0]*72/pw,4),round(box[1]*72/ph,4),round(box[2]*72/pw,4),round(box[3]*72/ph,4)],"option":opt,"field":f"q{n}.opt.{opt}" if opt else f"q{n}.stem","what":"scan crop replacing redrawn "+','.join(sids),"box_source":"hand box 2026-11-02","pending_spec":False})
        if opt:
            for o in q.get('options') or []:
                if o.get('letter','').upper()==opt.upper(): unlink(o,sids)
        else:
            unlink(q,sids); first=True
            for k in ('stimulus_md','stem_md'):
                if not q.get(k): continue
                def rp(m):
                    global first
                    r=f'[[figura:{fid}]]' if first else ''; first=False; return r
                q[k]=re.sub(r'\[\[figura:(%s)(\|[^\]]*)?\]\]'%'|'.join(map(re.escape,sids)),rp,q[k]) if sids else q[k]
    if APPLY:
        for p_ in (mp,gp):
            if not os.path.exists(p_+'.bak-20261102-handcrop'): shutil.copy2(p_,p_+'.bak-20261102-handcrop')
        json.dump(man,open(mp,'w'),ensure_ascii=False,indent=1); json.dump(g,open(gp,'w'),ensure_ascii=False,indent=1)
