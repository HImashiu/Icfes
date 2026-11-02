import json,re,sys,unicodedata
B='/mnt/project-files/icfes/pipeline/fix-20261026/merge'
def W(t):
    t=unicodedata.normalize('NFKD',re.sub(r'<[^>]+>|\[\[[^\]]*\]\]','',t or '').lower()); t=''.join(c for c in t if not unicodedata.combining(c))
    return set(re.findall(r'[a-z]{4,}',t))
for es in sys.argv[1:]:
    O={q['number']:q for q in json.load(open(f'/home/claude/work/H/pre-{es}.json'))['questions']}
    out=[]
    for q in json.load(open(f'{B}/{es}/S11-{es}.golden.json'))['questions']:
        o=O[q['number']]
        a=W(o['stimulus_md']+o['stem_md']+' '.join(x['text_md'] for x in o['options']))
        b=W(q['stimulus_md']+q['stem_md']+' '.join(x['text_md'] for x in q['options']))
        if len(a)>=6 and len(b)>=6:
            j=len(a&b)/min(len(a),len(b))
            if j<0.5: out.append((q['number'],round(j,2)))
    print(es,out)
