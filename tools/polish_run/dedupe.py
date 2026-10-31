# dedupe.py files... : keep one answer per id (first without error, else first)
import json,sys
for p in sys.argv[1:]:
    best={}; order=[]
    for l in open(p):
        if not l.strip(): continue
        o=json.loads(l); k=o['id']
        if k not in best: best[k]=o; order.append(k)
        elif best[k].get('error') and not o.get('error'): best[k]=o
    open(p,'w').write(''.join(json.dumps(best[k],ensure_ascii=False)+'\n' for k in order))
    print(p.split('/')[-1],len(order),'kept',sum(1 for k in order if best[k].get('error')),'errors')
