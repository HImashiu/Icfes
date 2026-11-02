# fixups.py golden... : scripted cleanups after merge (English stems with stale [Texto pendiente], instruction lines)
import json,re,sys
P=r'<p[^>]*>'
for f in sys.argv[1:]:
    g=json.load(open(f)); n=0
    for q in g['questions']:
        s=q.get('stem_md') or ''
        if '[Texto pendiente' in s:
            m=list(re.finditer(P+r'\s*%d\s*\\?\.\s*'%q['number'],s))
            if m:
                rest=s[m[-1].end():]
                rest=re.sub(r'^</p>\s*','',rest).strip()
                if not rest.startswith('<p'): rest='<p style="text-align:justify">'+rest
                q['stem_md']=rest; n+=1
    for x in g['groups']:
        for k in ('passage_md','directions','stimulus_md'):
            v=x.get(k)
            if v:
                v2=re.sub(P+r'\s*En las preguntas\s+\d+\s*[-–a]\s*\d+[^<]*marque[^<]*</p>\s*','',v)
                if v2!=v: x[k]=v2.strip(); n+=1
    json.dump(g,open(f,'w'),ensure_ascii=False,indent=1); print(f.split('/')[-1],'fixups',n)
