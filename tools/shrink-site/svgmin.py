import re,base64,io,glob,sys
from PIL import Image
NUM=re.compile(r'[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?')
def fmt(v):
    v=round(v,1)
    if v==0: return '0'
    s=('%.1f'%v).rstrip('0').rstrip('.')
    if s.startswith('0.'): s=s[1:]
    elif s.startswith('-0.'): s='-'+s[2:]
    return s
def join(nums):
    out=''
    for s in nums:
        if out and not (s[0]=='-' or (s[0]=='.' and ('.' in out.split(' ')[-1].split('-')[-1] ))): out+=' '
        out+=s
    return out
def path_min(d):
    toks=NUM.findall(d); i=0; out=[]; cx=cy=sx=sy=0.0
    cmd=None
    def rd(v): return round(v,1)
    while i<len(toks):
        t=toks[i]
        if t.isalpha(): cmd=t; i+=1
        if cmd=='Z' or cmd=='z':
            out.append('z'); cx,cy=sx,sy; cmd=None; continue
        n={'M':2,'L':2,'C':6}[cmd]
        vals=[float(x) for x in toks[i:i+n]]; i+=n
        vals=[rd(v) for v in vals]
        rel=[]
        for k in range(0,n,2): rel+= [vals[k]-cx, vals[k+1]-cy]
        letter={'M':'m','L':'l','C':'c'}[cmd]
        out.append(letter+join([fmt(v) for v in rel]))
        cx,cy=vals[-2],vals[-1]
        if cmd=='M': sx,sy=cx,cy; cmd='L'
    return ''.join(out)
def svg_min(svg):
    return re.sub(r' d="([^"]*)"',lambda m:' d="'+path_min(m.group(1))+'"',svg)
def png_webp(raw,mime='png'):
    im=Image.open(io.BytesIO(raw))
    im=im.convert('RGBA' if ('A' in im.mode or im.mode=='P' or 'transparency' in im.info) else 'RGB')
    if im.mode=='RGBA' and im.getchannel('A').getextrema()==(255,255): im=im.convert('RGB')
    o=io.BytesIO(); im.save(o,'WEBP',quality=88,method=6); w=o.getvalue()
    return (w,'webp') if len(w)<len(raw) else (raw,mime)
def fix_inner_png(svg):
    def rep(m):
        w,mt=png_webp(base64.b64decode(m.group(1)))
        return 'href="data:image/%s;base64,%s"'%(mt,base64.b64encode(w).decode())
    return re.sub(r'href="data:image/png;base64,([A-Za-z0-9+/=]+)"',rep,svg)
def conv_svg(m):
    svg=base64.b64decode(m.group(1)).decode()
    new=fix_inner_png(svg_min(svg))
    return 'data:image/svg+xml;base64,'+base64.b64encode(new.encode()).decode()
def conv_png(m):
    w,mt=png_webp(base64.b64decode(m.group(1)))
    return 'data:image/%s;base64,%s'%(mt,base64.b64encode(w).decode())
if __name__=='__main__':
    for f in sorted(glob.glob(sys.argv[1]+'/exams/*.json')):
        s=open(f,encoding='utf-8').read()
        t=re.sub(r'data:image/svg\+xml;base64,([A-Za-z0-9+/=]+)',conv_svg,s)
        t=re.sub(r'data:image/png;base64,([A-Za-z0-9+/=]+)',conv_png,t)
        if t!=s:
            open(f,'w',encoding='utf-8').write(t); print(f.split('/')[-1],len(s)//1000,'->',len(t)//1000)
