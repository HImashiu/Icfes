# dedup_stem.py golden... : drop stem sentences that repeat the stimulus (old text kept where gpt-5 left the stem empty)
import json,re,sys
words=lambda t:re.findall(r'\w+',re.sub(r'<[^>]+>|\*\*|\[\[[^\]]*\]\]|\$[^$]*\$','',t or '').lower())
def sentences(raw):
    t=re.sub(r'</p>\s*|<br\s*/?>',' \n',raw); t=re.sub(r'<p[^>]*>','',t)
    # isolate placeholders and tables
    t=re.sub(r'(\[(?:FIGURE|TABLE)[^\]]*\]|<table.*?</table>)',r'\n\1\n',t,flags=re.S)
    out=[]
    for line in t.split('\n'):
        line=line.strip()
        if not line: continue
        if line.startswith('[') or line.startswith('<table'): out.append(line); continue
        out+= [s.strip() for s in re.split(r'(?<=[.?!:])\s+(?=[¿A-ZÁÉÍÓÚÑ"«(])',line) if s.strip()]
    return out
for f in sys.argv[1:]:
    g=json.load(open(f)); n=0
    for q in g['questions']:
        st,sm=q.get('stimulus_md') or '',q.get('stem_md') or ''
        if not st.strip() or not sm.strip(): continue
        W=set(words(st)); sw=words(sm)
        if not sw or sum(x in W for x in sw)/len(sw)<0.5: continue   # stem is not a repeat
        figs='[[figura:' in st or '<table' in st
        keep=[]
        for s in sentences(sm):
            if re.match(r'\[(FIGURE|TABLE)',s) or s.startswith('<table'):
                if figs: continue
                keep.append(s); continue
            w=words(s)
            if w and sum(x in W for x in w)/len(w)>=0.8 and len(w)>=4: continue
            keep.append(s)
        if not keep: continue
        new='<p style="text-align:justify">'+' '.join(keep)+'</p>'
        if new!=sm: q['stem_md']=new; n+=1
    for q in g['questions']:
        st=q.get('stimulus_md') or ''; plain=re.sub(r'\s+',' ',re.sub(r'<[^>]+>','',q['stem_md'] or '')).strip()
        if st and plain and len(plain)>15 and plain in st:
            q['stimulus_md']=re.sub(r'<p[^>]*>\s*</p>','',st.replace(plain,'')).strip(); n+=1
    json.dump(g,open(f,'w'),ensure_ascii=False,indent=1); print(f.split('/')[-1],'dedup',n)
