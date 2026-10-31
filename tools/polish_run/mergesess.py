"""mergesess.py W v2dir ES out_dir [keepnew units,comma]  -> golden/manifest/specs/png + load zip
W: chain output of the gpt-5 run (final.json, figs/, specs.json, rep.json); v2dir: free-fix version now in the editor."""
import json,sys,re,shutil,os,zipfile
sys.path.insert(0,'/home/claude/icfes')
from icfes_polish.fields import fields,set_field
from icfes_polish.coverage import text_words
from collections import Counter
W,V,ES,M=sys.argv[1:5]; keepnew=set(sys.argv[5].split(',')) if len(sys.argv)>5 and sys.argv[5] else set()
rep=json.load(open(W+'/rep.json'))['units']
fb=sorted(u for u,x in rep.items() if x.get('errors') or x.get('rejected'))
g=json.load(open(W+'/final.json')); N=fields(g); Vf=fields(json.load(open(V+'/final.json')))
man=json.load(open(W+'/figs/manifest.json')); vman=json.load(open(V+'/figs/manifest.json'))
ids={f['figure_id'] for f in man['figures']}; vby={f['figure_id']:f for f in vman['figures']}
fromv=[]; used=[]
for u in fb:
    if u in keepnew: continue
    ks=[k for k in set(N)|set(Vf) if k.split('.')[0]==u]
    refs={r for k in ks for r in re.findall(r'\[\[figura:([^\]|]+)',Vf.get(k,''))}
    if any(r not in ids and r not in vby for r in refs): continue
    for k in ks:
        if k in Vf and Vf[k]!=N.get(k): set_field(g,k,Vf[k])
    for r in refs-ids:
        man['figures'].append(vby[r]); ids.add(r); fromv.append(r)
    used.append(u)
# a question stim that repeats its group's shared text
for q in g['questions']:
    for gr in g.get('groups',[]):
        if gr['from']<=q['number']<=gr['to'] and q.get('stimulus_md') and '[[figura' not in q['stimulus_md']:
            a=Counter(text_words(q['stimulus_md'])); b=Counter(text_words((gr.get('passage_md') or '')+' '+(gr.get('directions') or '')))
            if a and sum((a-b).values())<=0.1*sum(a.values()): q['stimulus_md']=''
shutil.rmtree(M,ignore_errors=True); os.makedirs(M+'/png')
json.dump(g,open(M+f'/{ES}.golden.json','w'),ensure_ascii=False,indent=1)
json.dump(man,open(M+'/manifest.json','w'),ensure_ascii=False,indent=1)
sp=json.load(open(W+'/specs.json')); vsp=json.load(open(V+'/specs.json'))
fbq=set()
for u in used:
    a,_,b=u[1:].partition('-'); fbq|=set(range(int(a),int(b or a)+1)) if u.startswith('g') else {int(a)}
q_of=lambda x:(x.get('location') or {}).get('question')
sp['figures']=[x for x in sp['figures'] if q_of(x) not in fbq]+[x for x in vsp['figures'] if q_of(x) in fbq]
json.dump(sp,open(M+f'/{ES}.json','w'),ensure_ascii=False,indent=1)
for f in man['figures']:
    shutil.copy((V+'/figs/' if f['figure_id'] in fromv else W+'/figs/')+f['figure_id']+'.png',M+'/png/'+f['figure_id']+'.png')
json.dump({'fallback':used,'errors_or_rejected':fb},open(M+'/fallback.json','w'))
F=fields(g); miss=[(k,r) for k,v in F.items() for r in re.findall(r'\[\[figura:([^\]|]+)',v) if r not in ids]
print(ES,'fallback',len(used),'missing refs',miss,'figs',len(man['figures']))
