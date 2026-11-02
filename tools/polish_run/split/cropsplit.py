import json,sys,copy
from pathlib import Path
sys.path.insert(0,'/home/claude/icfes')
import pypdfium2 as pdfium
from icfes_crop.build import build_bundles
lay_path,pdf_path,golden,p0,p1,out=sys.argv[1:7]; p0,p1=int(p0),int(p1)
L=json.load(open(lay_path)); D=copy.deepcopy(L)
for ch in D['chunks']:
    off=ch.get('page_offset',0); r=ch['result']
    keep=lambda brs: brs and p0<=brs[0]['pageNumber']+off<=p1
    r['pages']=[p for p in r['pages'] if p0<=p['pageNumber']+off<=p1]
    for k in ('paragraphs','tables','figures'):
        r[k]=[it for it in r.get(k,[]) if keep(it.get('boundingRegions'))]
    r['sections']=[]
g=json.load(open(golden))
paras=[]
for ch in D['chunks']:
    off=ch.get('page_offset',0)
    for it in ch['result'].get('paragraphs',[]):
        if it.get('role') in ('pageHeader','pageFooter','pageNumber'): continue
        paras.append((ch['result']['content'][it['spans'][0]['offset']:][:0] or it.get('content','')))
import re as _re
USED=set()
def qanchor(n,start):
    for i in list(range(max(0,start-60),len(paras))):
        t=paras[i]
        if i in USED or ':selected:' in t or len(t)<20: continue
        if _re.match(r'^\s*%d\s*\\?[\.\)](?!\d)'%n, t): USED.add(i); return t,i+1
    return None,start
cur=0; ANCH={}
for q in sorted(g['questions'],key=lambda q:q['number']):
    a,c=qanchor(q['number'],cur)
    if a: ANCH[q['number']]=a; cur=c
def ganchor(gr):
    for t in paras:
        if _re.match(r'^\s*RESPONDA LAS PREGUNTAS\s+%d\b'%gr['from'], t, _re.I): return t
    return gr.get('directions','')
import re
plain=lambda t:re.sub(r'\s+',' ',re.sub(r'<[^>]+>|\*\*|\[\[[^\]]*\]\]|\$','',t or '')).strip()
qd={'questions':[{'anchor':ANCH.get(q['number'],f"{q['number']}. "+plain(q.get('stimulus_md') or q.get('stem_md'))[:40]),'number':q['number'],'group_id':q.get('group_id'),'item_type':q.get('item_type'),'expected_options':q.get('expected_options',4)} for q in g['questions']],
    'groups':[{'id':x['id'],'from':x['from'],'to':x['to'],'directions':ganchor(x)} for x in g['groups']]}
out=Path(out); out.mkdir(parents=True,exist_ok=True)
pdf=pdfium.PdfDocument(pdf_path)
res=build_bundles(D,qd,pdf,out,200)
(out/'bundles.json').write_text(json.dumps(res,ensure_ascii=False,indent=1))
b=res['bundles']; print(out.name,sum(v['kind']=='question' for v in b.values()),'q crops',sum(v['kind']=='group' for v in b.values()),'groups; missing anchor',res['missing_anchor'])
json.dump(D,open(str(out)+'.layout.json','w'))
