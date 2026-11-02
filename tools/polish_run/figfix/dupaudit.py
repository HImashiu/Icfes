import json,os,re,glob,collections,sys
R='/mnt/project-files/icfes'; SD=R+'/figures/specs'
specfiles={}
for f in sorted(os.listdir(SD)):
    if not f.endswith('.json'): continue
    s=f.replace('.full.json','').replace('.json','')
    if s not in specfiles or f.endswith('.full.json'): specfiles[s]=f
alias={"S11-M_1ra":"S11-M_1ra-2da","S11-M_2da":"S11-M_1ra-2da"}
DRAW={'diagram','geometry','map'}
TOK=re.compile(r'\[\[figura:([^\]|]+)')
out={}
for gp in sorted(glob.glob(R+'/data/S11-*.golden.json')):
    slug=os.path.basename(gp).replace('.golden.json','')
    sf=specfiles.get(slug) or specfiles.get(alias.get(slug,''))
    specs={x['id']:x for x in json.load(open(f'{SD}/{sf}')).get('figures',[])} if sf else {}
    mp=f'{R}/figures/traced/{slug}/manifest.json'
    man=json.load(open(mp)).get('figures',[]) if os.path.exists(mp) else []
    ok={'azure','eyeballed_box','manual_box'}
    tr=[e for e in man if e.get('method') in ok]
    trids={e['figure_id'] for e in tr}|{e.get('spec_id') for e in tr}
    byq=collections.defaultdict(list)
    for e in tr: byq[e.get('question')].append(e)
    g=json.load(open(gp)); gs={x['id']:x for x in g.get('groups',[])}
    res=collections.Counter(); items=collections.defaultdict(list)
    for q in g['questions']:
        n=q['number']
        txt=json.dumps({k:q.get(k) for k in ('stimulus_md','stem_md')},ensure_ascii=False)+json.dumps([o.get('text_md') for o in q.get('options',[])],ensure_ascii=False)
        if q.get('group_id') in gs: txt+=json.dumps(gs[q['group_id']],ensure_ascii=False)
        toks=set(TOK.findall(txt))
        links=[('q',i) for i in ([] if q.get('figure') is None else [].concat if False else ([q['figure']] if isinstance(q.get('figure'),str) else q.get('figure') or []))]
        for o in q.get('options',[]):
            f_=o.get('figure')
            for i in ([f_] if isinstance(f_,str) else (f_ or [])): links.append((o['letter'],i))
        replaced={e.get('spec_id') for e in byq[n]}|{e['figure_id'] for e in byq[n]}
        native_tok=[t for t in toks if t in specs and t not in trids]
        crop_stem=[e for e in byq[n] if not re.search(r'-opt-[a-d]-',e['figure_id'])] or [t for t in toks if t in trids]
        crop_opt={re.search(r'-opt-([a-d])-',e['figure_id']).group(1).upper() for e in byq[n] if re.search(r'-opt-[a-d]-',e['figure_id'])}
        for where,i in links+[('tok',t) for t in native_tok]:
            if i in replaced or i not in specs: continue
            k=specs[i].get('kind')
            draw=k in DRAW
            hascrop= bool(crop_stem) if where in ('q','tok') else (where in crop_opt)
            cat=('dup-' if hascrop else 'only-')+('draw' if draw else 'chart')
            res[cat]+=1; items[cat].append((n,where,i,k))
    out[slug]=(res,items)
tot=collections.Counter()
for s,(r,_) in out.items():
    tot.update(r); print(s,dict(r))
print('TOTAL',dict(tot))
json.dump({s:{k:v for k,v in it.items()} for s,(r,it) in out.items()},open('/home/claude/work/mp/dupaudit.json','w'),ensure_ascii=False,indent=0)
