import json,os,re,sys
JS='/mnt/user-data/uploads/Downloads/icfes-azure-data/json'
def lay(slug):
    if slug.startswith('S11-P'): return '/home/claude/work/split/crops/%s.layout.json'%slug[4:]
    e,s=slug[4:].split('_'); return JS+'/'+[f for f in os.listdir(JS) if re.match(rf'S11-_{e}_{s}_',f)][0]
for a in sys.argv[1:]:
    slug,n=a.split(':'); L=json.load(open(lay(slug))); hits=[]
    for ch in L['chunks']:
        off=ch.get('page_offset',0)
        for p in ch['result'].get('paragraphs',[]):
            if re.match(r'^\s*%s\s*\\?[\.\)](?!\d)'%n,p['content']) or re.match(r'^\s*RESPONDA.*\b%s\b'%n,p['content']):
                br=p['boundingRegions'][0]; hits.append((br['pageNumber']+off,round(br['polygon'][1],2),p['content'][:50]))
    print(slug,n,hits[:4])
