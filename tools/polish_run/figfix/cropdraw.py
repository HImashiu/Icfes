# cropdraw.py : redrawn drawings (diagram/geometry/map specs) with no scan crop -> scan crops from the Azure layout
import json,os,re,sys,glob,io,hashlib,shutil,collections
sys.path.insert(0,'/home/claude/icfes')
import pypdfium2 as pdfium
from PIL import ImageOps
from icfes_crop.build import build_bundles
R='/mnt/project-files/icfes'; JS='/mnt/user-data/uploads/Downloads/icfes-azure-data/json'; IN='/mnt/user-data/uploads/Downloads/icfes-azure-input'
APPLY='--apply' in sys.argv
audit=json.load(open('/home/claude/work/mp/dupaudit.json'))
def files(slug):
    e,s=slug[4:].split('_')
    lj=[f for f in os.listdir(JS) if re.match(rf'S11-_{e}_{s}_',f)]
    pdf=[f for f in os.listdir(IN) if re.match(rf'S11- {e}\s+{s}',f)]
    return (JS+'/'+lj[0]) if lj else None, (IN+'/'+pdf[0]) if pdf else None
plain=lambda t:re.sub(r'\s+',' ',re.sub(r'<[^>]+>|\*\*|\[\[[^\]]*\]\]|\$','',t or '')).strip()
report=collections.defaultdict(list)
ACCEPT={('S11-B_1ra',113),('S11-D_1ra',9),('S11-E_1ra',116),('S11-F_2da',90),('S11-F_2da',100),('S11-I_2da',90),('S11-L_1ra',57),('S11-L_1ra',58),('S11-L_1ra',59),('S11-L_1ra',60),('S11-L_1ra',93),('S11-L_1ra',103),('S11-L_1ra',104),('S11-L_1ra',105),('S11-L_1ra',107),('S11-L_1ra',108),('S11-L_1ra',110),('S11-L_1ra',115),('S11-L_1ra',116),('S11-N_1ra',3),('S11-N_1ra',97),('S11-N_2da',55),('S11-P_2da',52),('S11-P_2da',70)}
DROP={('S11-C_2da',54),('S11-J_1ra',111),('S11-L_1ra',114),('S11-P_2da',57),('S11-P_2da',124)}  # redraw of the option pictures, which have crops
for slug,it in audit.items():
    todo=sorted({(n,i) for (n,where,i,k) in it.get('only-draw',[]) if where in ('q','tok')})
    if not todo or slug.startswith('S11-A_') or slug in ('S11-M_1ra','S11-M_2da','S11-P_1ra','S11-P_2da'):
        if todo and slug.startswith('S11-P'): pass
        else: continue
    lj,pp=files(slug)
    if slug.startswith('S11-P'):
        lj='/home/claude/work/split/crops/%s.layout.json'%slug[4:]; pp=IN+'/S11- P    1era y 2da sesion.pdf'
    if not lj or not pp: report[slug].append('no layout/pdf'); continue
    L=json.load(open(lj)); g=json.load(open(f'{R}/data/{slug}.golden.json'))
    cache=f'/home/claude/work/crop2/{slug}'
    if not os.path.exists(cache+'/bundles.json'):
        paras=[]
        for ch in L['chunks']:
            for p_ in ch['result'].get('paragraphs',[]):
                if p_.get('role') in ('pageHeader','pageFooter','pageNumber'): continue
                paras.append(p_['content'])
        used=set(); cur=0; A={}
        for q in sorted(g['questions'],key=lambda q:q['number']):
            for i_ in range(max(0,cur-60),len(paras)):
                t=paras[i_]
                if i_ in used or ':selected:' in t or len(t)<20: continue
                if re.match(r'^\s*%d\s*\\?[\.\)](?!\d)'%q['number'],t): used.add(i_); A[q['number']]=t; cur=i_+1; break
        def gan(gr):
            for t in paras:
                if re.match(r'^\s*RESPONDA LAS PREGUNTAS\s+%d\b'%gr['from'],t,re.I): return t
            return gr.get('directions','')
        qd={'questions':[{'anchor':A.get(q['number'],f"{q['number']}. "+plain(q.get('stimulus_md') or q.get('stem_md'))[:40]),'number':q['number'],'group_id':q.get('group_id'),'item_type':q.get('item_type'),'expected_options':q.get('expected_options',4)} for q in g['questions']],
            'groups':[{'id':x['id'],'from':x['from'],'to':x['to'],'directions':gan(x)} for x in g.get('groups',[])]}
        os.makedirs(cache,exist_ok=True)
        res=build_bundles(L,qd,pdfium.PdfDocument(pp),__import__('pathlib').Path(cache),200)
        json.dump(res,open(cache+'/bundles.json','w'))
    B=json.load(open(cache+'/bundles.json'))['bundles']
    figs=[]
    for ch in L['chunks']:
        off=ch.get('page_offset',0)
        for f in ch['result'].get('figures',[]):
            br=f['boundingRegions'][0]; xs=br['polygon'][0::2]; ys=br['polygon'][1::2]
            figs.append((br['pageNumber']+off,[min(xs),min(ys),max(xs),max(ys)]))
    pdf=pdfium.PdfDocument(pp)
    mp=f'{R}/figures/traced/{slug}/manifest.json'; man=json.load(open(mp))
    prefix=re.sub(r'[^a-z0-9]','',slug[4:].split('_')[0].lower())+('1' if slug.endswith('1ra') else '2')
    Q={q['number']:q for q in g['questions']}
    for n,sid in todo:
        q=Q[n]
        if (slug,n) in DROP:
            report[slug].append(f'q{n} {sid}: link dropped (options have crops)')
            if APPLY:
                f_=q.get('figure')
                if f_==sid: q['figure']=None
                elif isinstance(f_,list): q['figure']=[x for x in f_ if x!=sid] or None
            continue
        if (slug,n) not in ACCEPT:
            report[slug].append(f'q{n} {sid}: HAND'); continue
        segs=list((B.get(f'q{n}') or {}).get('segments',[]))
        if q.get('group_id') and B.get(q['group_id']): segs+=B[q['group_id']]['segments']
        cands=[]
        for s in segs:
            bx=s['box_in']
            for pg,fb in figs:
                cx,cy=(fb[0]+fb[2])/2,(fb[1]+fb[3])/2
                if pg==s['page'] and bx[0]<=cx<=bx[2] and bx[1]<=cy<=bx[3] and (fb[2]-fb[0])*(fb[3]-fb[1])>0.6: cands.append((pg,fb))
        cands=list(dict.fromkeys((p,tuple(b)) for p,b in cands))
        if not cands: report[slug].append(f'q{n} {sid}: no layout figure'); continue
        pg=cands[0][0]; same=[b for p,b in cands if p==pg]
        u=[min(b[0] for b in same)-0.06,min(b[1] for b in same)-0.06,max(b[2] for b in same)+0.06,max(b[3] for b in same)+0.06]
        page=pdf[pg-1]; im=page.render(scale=200/72).to_pil().convert('L'); W,H=im.size; pw,ph=page.get_size(); sx=W/(pw/72); sy=H/(ph/72)
        c=ImageOps.autocontrast(im.crop((max(0,int(u[0]*sx)),max(0,int(u[1]*sy)),min(W,int(u[2]*sx)),min(H,int(u[3]*sy)))),cutoff=1)
        b=io.BytesIO(); c.save(b,'PNG'); h=hashlib.md5(b.getvalue()).hexdigest()[:6]
        fid=f'{prefix}-q{n}-scan-{h}'
        report[slug].append(f'q{n} {sid} -> {fid} ({len(same)} regions, page {pg})')
        os.makedirs('/home/claude/work/crop2/review',exist_ok=True); c.save(f'/home/claude/work/crop2/review/{slug}-q{n}.png')
        if APPLY:
            open(f'{R}/figures/traced/{slug}/{fid}.png','wb').write(b.getvalue())
            man['figures'].append({"question":n,"group":q.get('group_id'),"page":pg,"kind":"image","figure_id":fid,"spec_id":sid,"method":"eyeballed_box","auto":True,"svg":f"traced/{slug}/{fid}.png","box_page_fraction":[round(u[0]/(pw/72),4),round(u[1]/(ph/72),4),round(u[2]/(pw/72),4),round(u[3]/(ph/72),4)],"option":None,"field":f"q{n}.stem","what":"scan crop replacing redrawn "+sid,"box_source":"azure layout figure 2026-11-02","pending_spec":False})
            f_=q.get('figure')
            if f_==sid: q['figure']=None
            elif isinstance(f_,list): q['figure']=[x for x in f_ if x!=sid] or None
            for k in ('stimulus_md','stem_md'):
                if q.get(k): q[k]=re.sub(r'\[\[figura:%s(\|[^\]]*)?\]\]'%re.escape(sid),f'[[figura:{fid}]]',q[k])
            for x in g.get('groups',[]):
                if x['id']==q.get('group_id'):
                    for k in ('passage_md','stimulus_md'):
                        if x.get(k): x[k]=re.sub(r'\[\[figura:%s(\|[^\]]*)?\]\]'%re.escape(sid),f'[[figura:{fid}]]',x[k])
    if APPLY:
        for p_ in (mp,f'{R}/data/{slug}.golden.json'):
            if not os.path.exists(p_+'.bak-20261102-cropdraw'): shutil.copy2(p_,p_+'.bak-20261102-cropdraw')
        json.dump(man,open(mp,'w'),ensure_ascii=False,indent=1); json.dump(g,open(f'{R}/data/{slug}.golden.json','w'),ensure_ascii=False,indent=1)
for s,r in report.items(): print(s); [print('  ',x) for x in r]
