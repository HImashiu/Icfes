import re,base64,glob,sys
from urllib.parse import quote
def enc(svg):
    svg=svg.replace('"',"'")
    out=[]
    for ch in svg:
        if ch in '%#<>{}\n\r\t\\' or ord(ch)>126 or ord(ch)<32: out.append(quote(ch,safe=''))
        else: out.append(ch)
    return 'data:image/svg+xml,'+''.join(out)
def conv(m):
    svg=base64.b64decode(m.group(1)).decode('utf-8')
    if '"' in svg and "'" in svg: return m.group(0)
    return enc(svg)
for f in sorted(glob.glob(sys.argv[1]+'/exams/*.json')):
    s=open(f,encoding='utf-8').read()
    t=re.sub(r'data:image/svg\+xml;base64,([A-Za-z0-9+/=]+)',conv,s)
    if t!=s: open(f,'w',encoding='utf-8').write(t)
