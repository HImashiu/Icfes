# dropdup.py [--apply] : where a question (stem) or an option has a scan crop, drop the native spec links
# (q.figure / option.figure) at that level, and drop [[figura:SPEC]] tokens of drawings when the stem has a crop.
import json,os,re,glob,collections,sys,shutil
R='/mnt/project-files/icfes'; SD=R+'/figures/specs'; APPLY='--apply' in sys.argv
specfiles={}
for f in sorted(os.listdir(SD)):
    if not f.endswith('.json'): continue
    s=f.replace('.full.json','').replace('.json','')
    if s not in specfiles or f.endswith('.full.json'): specfiles[s]=f
alias={"S11-M_1ra":"S11-M_1ra-2da","S11-M_2da":"S11-M_1ra-2da"}
DRAW={'diagram','geometry','map'}
TOKRE=re.compile(r'\[\[figura:([^\]|]+)[^\]]*\]\]')
OPT=re.compile(r'[-_](?:opt|opcion|opción)[-_]([a-d])(?=[-_]|$)',re.I)
tot=collections.Counter(); per={}
KEEP={('S11-B_1ra',117),('S11-D_1ra',17),('S11-E_2da',58),('S11-I_1ra',110),('S11-F_2da',66)}  # crop shows a different picture
for gp in sorted(glob.glob(R+'/data/S11-*.golden.json')):
    slug=os.path.basename(gp).replace('.golden.json','')
    if slug.startswith('S11-A_'): continue
    sf=specfiles.get(slug) or specfiles.get(alias.get(slug,''))
    specs={x['id']:x for x in json.load(open(f'{SD}/{sf}')).get('figures',[])} if sf else {}
    mp=f'{R}/figures/traced/{slug}/manifest.json'
    man=json.load(open(mp)).get('figures',[]) if os.path.exists(mp) else []
    tr=[e for e in man if e.get('method') in ('azure','eyeballed_box','manual_box')]
    trids={e['figure_id'] for e in tr}
    byq=collections.defaultdict(list)
    for e in tr: byq[e.get('question')].append(e)
    g=json.load(open(gp)); gs={x['id']:x for x in g.get('groups',[])}
    c=collections.Counter(); changed=False
    for q in g['questions']:
        n=q['number']
        own=' '.join([q.get('stimulus_md') or '',q.get('stem_md') or ''])
        grp=gs.get(q.get('group_id'))
        alltxt=own+(' '+(grp.get('passage_md') or '')+' '+(grp.get('stimulus_md') or '') if grp else '')
        toks=set(TOKRE.findall(alltxt))
        stem_crop=any(not OPT.search(e['figure_id']) for e in byq[n]) or any(t in trids for t in toks)
        opt_crop={OPT.search(e['figure_id']).group(1).upper() for e in byq[n] if OPT.search(e['figure_id'])}
        replaced={e.get('spec_id') for e in byq[n]}|{e['figure_id'] for e in byq[n]}
        # stem links
        f_=q.get('figure'); lst=[f_] if isinstance(f_,str) else list(f_ or [])
        keep=[i for i in lst if not (stem_crop and i in specs and i not in replaced and (slug,n) not in KEEP)]
        if len(keep)!=len(lst):
            c['stem_link']+=len(lst)-len(keep); changed=True
            q['figure']=(keep[0] if len(keep)==1 else (keep or None)) if isinstance(f_,str) or len(keep)<=1 else keep
        for o in q.get('options',[]):
            f2=o.get('figure')
            if f2 and o['letter'] in opt_crop and (f2 if isinstance(f2,str) else 'x') in specs and f2 not in replaced:
                o['figure']=None; c['option_link']+=1; changed=True
        # native drawing tokens in the question's own text when a crop is there
        if stem_crop:
            for k in ('stimulus_md','stem_md'):
                v=q.get(k) or ''
                def sub(m):
                    i=m.group(1)
                    if i in specs and i not in trids and specs[i].get('kind') in DRAW:
                        c['draw_token']+=1; return ''
                    return m.group(0)
                nv=TOKRE.sub(sub,v)
                if nv!=v: q[k]=re.sub(r'\n{3,}','\n\n',nv).strip(); changed=True
    per[slug]=dict(c); tot.update(c)
    if APPLY and changed:
        b=gp+'.bak-20261102-dedupfig'
        if not os.path.exists(b): shutil.copy2(gp,b)
        json.dump(g,open(gp,'w'),ensure_ascii=False,indent=1)
for s,c in per.items():
    if c: print(s,c)
print('TOTAL',dict(tot),'applied' if APPLY else 'dry run')
