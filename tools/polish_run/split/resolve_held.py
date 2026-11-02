# resolve_held.py cand.json rep.json : apply held fields whose word changes are only moves between fields of the unit,
# math typesetting, or dropped placeholder descriptions (free, no model)
import json,re,sys,unicodedata
sys.path.insert(0,'/home/claude/icfes')
from icfes_polish.fields import fields, set_field
cand,repf,metaf=sys.argv[1:4]
meta=json.load(open(metaf))['units']
g=json.load(open(cand)); rep=json.load(open(repf))
def W(t):
    t=re.sub(r'\\\s*(dfrac|frac|left|right|text|cdot|times|sqrt|mathrm|quad|,|;)','',t or '')
    t=re.sub(r'\\\s*(cos|sin|sen|tan|pi)',r' \1 ',t)
    t=re.sub(r'(?<=[A-Za-z])(?=\d)|(?<=\d)(?=[A-Za-z])',' ',t)
    t=t.replace('π',' pi ')
    t=unicodedata.normalize('NFKD',t.lower()); t=''.join(ch for ch in t if not unicodedata.combining(ch))
    return re.findall(r'[a-z0-9]+',t)
F=fields(g)
# new text of every field per unit (after apply + pending held values)
pend={w['key']:w['new'] for w in rep.get('word_checks',[])}
def unit_words(uid,gid):
    ws=set()
    for k,v in F.items():
        if k.split('.')[0] in (uid,) or (gid and k.split('.')[0]==gid):
            ws|=set(W(pend.get(k,v)))
    return ws
qgid={f"q{q['number']}":q.get('group_id') for q in g['questions']}
oldF=None
applied=0; kept=0
for w in rep.get('word_checks',[]):
    uid=w['unit']; key=w['key']; owner=key.split('.')[0]
    gid=qgid.get(owner) if owner.startswith('q') else None
    newpool=unit_words(owner,gid)|unit_words(uid,None)
    oldpool=set()
    for k,v in F.items():
        if k.split('.')[0] in (owner,uid,gid): oldpool|=set(W(v))
    oldpool|=set(W((meta.get(uid) or {}).get('ocr','')))
    ok=True; why=''
    oldfield=F.get(key,'')
    ph=set()
    for m in re.finditer(r'\[(?:FIGURE|TABLE|Gr[aá]fica|Tabla)[^\]]*\]',oldfield): ph|=set(W(m.group(0)))
    newpool|=ph
    for m in re.finditer(r'RESPONDA LAS PREGUNTAS[^.<]*',oldfield,re.I): newpool|=set(W(m.group(0)))
    for c in w['changes']:
        o,n=W(c.get('old','')),W(c.get('new',''))
        miss=[x for x in o if x not in newpool and not x.isdigit() and x not in ('pendiente','pagina','texto','figura','tabla')]
        budget=max(2,int(0.12*len(W(oldfield))))
        if miss and len(miss)>budget:
            ok=False; why=('old',miss[:8]); break
        if n and not all(x in oldpool for x in n):
            ok=False; why=('new',[x for x in n if x not in oldpool][:8]); break
    if ok:
        set_field(g,key,w['new']); applied+=1
    else:
        kept+=1
        if '-v' in sys.argv: print('  keep',key,why)
json.dump(g,open(cand,'w'),ensure_ascii=False,indent=1)
print('held resolved',applied,'kept',kept)

# --- picture options: a unit rejected only because option texts that were placeholders ("[bar chart ...]") were emptied
# while the model reported a picture for each of them: apply the whole unit
import glob
resf=[a for a in sys.argv[4:] if not a.startswith('-')]
res={}
for p in resf:
    for line in open(p):
        r=json.loads(line); res[r['id'].split(':',1)[1]]=r
fixed=0
for uid,ur in rep['units'].items():
    rj=ur.get('rejected') or []
    if not rj or ur.get('errors'): continue
    em=[x.split(':')[0] for x in rj if 'emptied a field' in x]
    other=[x for x in rj if 'emptied a field' not in x and not x.startswith('other fields kept')]
    if not em or other: continue
    figf={f_.get('field') for f_ in ur.get('figures') or []}
    if not all(k in figf and re.match(r'^\s*(<p[^>]*>)?\s*\[',F.get(k,'')) for k in em): continue
    r=res.get(uid)
    try: ans=json.loads(r['content'])
    except Exception: continue
    for k,v in (ans.get('fields') or {}).items():
        if k in F and isinstance(v,dict) and isinstance(v.get('text'),str) and not k.endswith('.dir'):
            set_field(g,k,v['text'])
    ur['rejected']=[]; ur['changed']=list((ans.get('fields') or {}).keys()); fixed+=1
json.dump(g,open(cand,'w'),ensure_ascii=False,indent=1)
json.dump(rep,open(repf,'w'),ensure_ascii=False,indent=1)
print('picture-option units applied',fixed)
