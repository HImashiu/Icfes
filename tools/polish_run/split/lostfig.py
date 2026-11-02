# lostfig.py e_s... : questions whose old text had a picture/table but whose new text has none
import json,re,sys
B='/mnt/project-files/icfes/pipeline/fix-20261026/merge'
PIC=re.compile(r'\[\[figura:|\[FIGURE|!\[|<img|<table|\[TABLE|Figura pendiente',re.I)
for es in sys.argv[1:]:
    old=json.load(open(f'/home/claude/work/H/pre-{es}.json')); new=json.load(open(f'{B}/{es}/S11-{es}.golden.json'))
    man=json.load(open(f'{B}/{es}/manifest.json'))['figures']
    def blob(g,q):
        gs={x['id']:x for x in g['groups']}; t=json.dumps(q,ensure_ascii=False)
        if q.get('group_id') in gs: t+=json.dumps(gs[q['group_id']],ensure_ascii=False)
        return t
    O={q['number']:q for q in old['questions']}
    out=[]
    for q in new['questions']:
        o=O.get(q['number'])
        if not o: continue
        ob,nb=blob(old,o),blob(new,q)
        has_new=bool(re.search(r'\[\[figura:|<table',nb)) or any(op.get('figure') for op in q['options']) or q.get('figure') or any(f['question']==q['number'] and f.get('option') for f in man)
        if PIC.search(ob) and not has_new: out.append(q['number'])
        if re.search(r'\[(FIGURE|TABLE)',nb): out.append(f"{q['number']}*placeholder")
    print(es,out)
