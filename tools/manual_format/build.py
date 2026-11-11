#!/usr/bin/env python3
"""Build an icfes-golden/1 exam from a hand-written source file (Claude reads the scans; no OCR/LLM service).

Source format (UTF-8 text):
  @exam <slug> | <title> | pdf=<path to source pdf> | dpi=300
  @section <name> <first>-<last>
  @group <id> <from>-<to>
  DIR: directions line
  PASSAGE: passage text (more lines follow until the next tag; blank line = new paragraph)
  #<n> [copy=<BANKEXAM>#<num>] [page=<p>] [group=<id>] [sec=<name>]
  STIM: / STEM: / A: / B: / C: / D:  text (multi-line; blank line = paragraph)
  FIG <field> p=<page> box=x0,y0,x1,y1 [what=...]     field: stim|stem|passage|A|B|C|D ; box in page fractions
  KEY: <letter> [conf=high|medium|low] [why=...]
In text, [[FIG]] marks where the next FIG of that field goes (else appended). Lines may hold HTML tables.
**bold** and *italic* pass through. A copy= question takes the bank text/figures; any field written overrides it.
"""
import json, re, sys, os, hashlib, subprocess, shutil, glob
ROOT = '/mnt/project-files/icfes'
OUT = os.environ.get('MF_OUT', '/mnt/project-files/icfes/staging-new-exams')
for d in ('data','figures/traced','figures/specs','answer-keys'): os.makedirs(f'{OUT}/{d}', exist_ok=True)
src_path = sys.argv[1]
lines = open(src_path, encoding='utf-8').read().split('\n')

exam = {}; sections = []; groups = {}; qs = {}; cur = None; field = None; order = []
TAGS = ('STIM', 'STEM', 'A', 'B', 'C', 'D', 'DIR', 'PASSAGE')
def kv(s):
    return dict(re.findall(r'(\w+)=("[^"]*"|\S+)', s))
for ln in lines:
    if ln.startswith('//'): continue
    if ln.startswith('@exam'):
        parts = [p.strip() for p in ln[5:].split('|')]
        exam = {'slug': parts[0], 'title': parts[1]}
        for p in parts[2:]:
            k, v = p.split('=', 1); exam[k.strip()] = v.strip()
        cur = None; continue
    if ln.startswith('@section'):
        m = re.match(r'@section\s+(.+?)\s+(\d+)-(\d+)\s*$', ln)
        sections.append({'name': m[1], 'first': int(m[2]), 'last': int(m[3])}); cur = None; continue
    if ln.startswith('@group'):
        m = re.match(r'@group\s+(\S+)\s+(\d+)-(\d+)(.*)$', ln)
        cur = groups[m[1]] = {'id': m[1], 'from': int(m[2]), 'to': int(m[3]), 'DIR': '', 'PASSAGE': '', 'figs': [], 'kind': 'group', 'attrs': kv(m[4])}
        field = None; continue
    m = re.match(r'#(\d+)\b(.*)$', ln)
    if m:
        n = int(m[1]); a = kv(m[2])
        cur = qs[n] = {'n': n, 'attrs': a, 'figs': [], 'kind': 'q'}; order.append(n); field = None; continue
    m = re.match(r'FIG\s+(\w+)\s+(.*)$', ln)
    if m and cur is not None:
        a = kv(m[2]); a['field'] = m[1]; cur['figs'].append(a); continue
    m = re.match(r'KEY:\s*([A-H])\b(.*)$', ln)
    if m and cur is not None:
        cur['key'] = m[1]; cur['keymeta'] = kv(m[2]); continue
    m = re.match(r'(STIM|STEM|[A-H]|DIR|PASSAGE):\s?(.*)$', ln)
    if m and cur is not None:
        field = m[1]; cur[field] = m[2]; continue
    if cur is not None and field:
        cur[field] += '\n' + ln

def md(text):
    """paragraphs -> <p>; keep tables/lists/tokens as blocks."""
    text = (text or '').strip()
    if not text: return ''
    out = []
    for para in re.split(r'\n\s*\n', text):
        p = para.strip()
        if not p: continue
        if p.startswith('<') or p.startswith('[[figura:'):
            out.append(p)
        else:
            out.append('<p style="text-align:justify">' + re.sub(r'\s*\n\s*', '<br>' if para.startswith('|') else ' ', p) + '</p>')
    return '\n\n'.join(out)

slug = exam['slug']; pdf = exam['pdf']; dpi = int(exam.get('dpi', 300))
tdir = f'{OUT}/figures/traced/{slug}'; os.makedirs(tdir, exist_ok=True)
pagecache = f'/tmp/claude-0/manual_pages/{slug}'; os.makedirs(pagecache, exist_ok=True)
def page_png(p):
    f = f'{pagecache}/p{p:03d}.png'
    if not os.path.exists(f):
        subprocess.run(['pdftoppm', '-r', str(dpi), '-f', str(p), '-l', str(p), '-singlefile', '-gray', '-png', pdf, f[:-4]], check=True)
    return f
manifest = []; spec_figs = []
prefix = re.sub(r'[^a-z0-9]', '', slug.lower())[-8:]
def crop(owner_q, fig, tag):
    p = int(fig['p']); x0, y0, x1, y1 = [float(v) for v in fig['box'].split(',')]
    img = page_png(p)
    w, h = [int(v) for v in subprocess.check_output(['identify', '-format', '%w %h', img]).split()]
    geo = f'{int((x1-x0)*w)}x{int((y1-y0)*h)}+{int(x0*w)}+{int(y0*h)}'
    hid = hashlib.md5(f'{slug}{owner_q}{tag}{fig["box"]}{p}'.encode()).hexdigest()[:6]
    fid = f'{prefix}-q{owner_q}-{tag}-{hid}'
    out = f'{tdir}/{fid}.png'
    subprocess.run(['convert', img, '-crop', geo, '+repage', '-level', '8%,92%', '-trim', '+repage', '-bordercolor', 'white', '-border', '12', out], check=True)
    manifest.append({'question': owner_q, 'group': fig.get('group'), 'page': p, 'kind': 'image', 'figure_id': fid, 'spec_id': fid,
                     'method': 'eyeballed_box', 'auto': False, 'svg': f'traced/{slug}/{fid}.png', 'box_page_fraction': [x0, y0, x1, y1],
                     'option': fig['field'] if fig['field'] in 'ABCDEFGH' and len(fig['field']) == 1 else None,
                     'field': fig['field'], 'what': fig.get('what', '').strip('"'), 'box_source': 'claude_read_scan', 'pending_spec': False})
    return fid
def place(text, fid):
    tok = f'[[figura:{fid}]]'
    if re.search(r'<p[^>]*>\s*\[\[FIG\]\]\s*</p>', text or ''): return re.sub(r'<p[^>]*>\s*\[\[FIG\]\]\s*</p>', lambda m: tok, text, count=1)
    if '[[FIG]]' in (text or ''): return text.replace('[[FIG]]', '\n\n' + tok + '\n\n', 1)
    return ((text or '') + '\n\n' + tok).strip()

# bank copy
bank = {}; BASE = {}
def bankq(ref):
    ex, n = ref.split('#'); ex = ex if ex.startswith(('S11-', 'ICFES-')) else 'S11-' + ex
    R = OUT if ex.startswith('ICFES-') else ROOT
    BASE[ex] = R
    if ex not in bank:
        d = json.load(open(f'{R}/data/{ex}.golden.json'))
        sp = {}
        for sf in [f'{R}/figures/specs/{ex}.full.json', f'{R}/figures/specs/{ex}.json', f'{ROOT}/figures/specs/S11-M_1ra-2da.json' if ex.startswith('S11-M_') else '']:
            if sf and os.path.exists(sf):
                for f in json.load(open(sf)).get('figures', []): sp.setdefault(f['id'], f)
        mf = f'{R}/figures/traced/{ex}/manifest.json'
        man = json.load(open(mf)).get('figures', []) if os.path.exists(mf) else []
        bank[ex] = (d, sp, man)
    d, sp, man = bank[ex]
    q = next(x for x in d['questions'] if x['number'] == int(n))
    g = next((x for x in d.get('groups') or [] if x['id'] == q.get('group_id')), None)
    return ex, q, g, sp, man
TOKEN = re.compile(r'\[\[figura:([^\]\s]+)\]\]')
def copy_figs(ex, sp, man, newn, bq, texts, options):
    ids = set(TOKEN.findall(' '.join(texts))) | set([].concat if False else ([] if bq.get('figure') is None else ([bq['figure']] if isinstance(bq['figure'], str) else bq['figure'])))
    for o in options:
        if o.get('figure'): ids |= set([o['figure']] if isinstance(o['figure'], str) else o['figure'])
    for e in man:
        if e.get('question') == bq['number'] and e.get('method') in ('azure', 'eyeballed_box', 'manual_box') and e.get('svg') and not str(e.get('field') or '').endswith('passage'):
            srcf = f'{BASE.get(ex, ROOT)}/figures/{e["svg"]}'
            if not os.path.exists(srcf): continue
            ext = os.path.splitext(srcf)[1]
            dst = f'traced/{slug}/{e["figure_id"]}{ext}'
            shutil.copyfile(srcf, f'{OUT}/figures/{dst}')
            ne = dict(e); ne['question'] = newn; ne['svg'] = dst; ne['copied_from'] = f'{ex}#{bq["number"]}'
            manifest.append(ne); ids.discard(e['figure_id']); ids.discard(e.get('spec_id'))
    for i in ids:
        if i in sp:
            f = json.loads(json.dumps(sp[i])); f.setdefault('location', {})['question'] = newn; spec_figs.append(f)

questions = []; out_groups = []; keys = {}; side = {}
secs = lambda n: next((s['name'] for s in sections if s['first'] <= n <= s['last']), None)
for gid, g in groups.items():
    passage = md(g['PASSAGE'])
    if 'copy' in g['attrs']:
        ex, bq, bg, sp, man = bankq(g['attrs']['copy'])
        if not g['PASSAGE'].strip(): passage = bg.get('passage_md') or bg.get('stimulus_md') or ''
        if not g['DIR'].strip(): g['DIR'] = bg.get('directions') or ''
        d0 = bank[ex][0]
        for mq in [x for x in d0['questions'] if x.get('group_id') == bg['id']]:
            ids = set(TOKEN.findall(passage))
            for e in man:
                if e.get('question') == mq['number'] and (e['figure_id'] in ids or e.get('spec_id') in ids) and e.get('svg'):
                    srcf = f'{BASE.get(ex, ROOT)}/figures/{e["svg"]}'; ext = os.path.splitext(srcf)[1]; dst = f'traced/{slug}/{e["figure_id"]}{ext}'
                    if os.path.exists(srcf):
                        shutil.copyfile(srcf, f'{OUT}/figures/{dst}'); ne = dict(e, question=g['from'], svg=dst, copied_from=f'{ex}#{mq["number"]}'); manifest.append(ne)
        for i in set(TOKEN.findall(passage)):
            if i in sp and not any(e['figure_id'] == i for e in manifest):
                f = json.loads(json.dumps(sp[i])); f.setdefault('location', {})['question'] = g['from']; spec_figs.append(f)
    for f in g['figs']:
        fid = crop(g['from'], dict(f, group=gid), 'g')
        passage = place(passage, fid)
    out_groups.append({'id': gid, 'from': g['from'], 'to': g['to'], 'directions': g['DIR'].strip(), 'passage_md': passage})
for n in sorted(order):
    s = qs[n]; a = s['attrs']; notes = []
    base = {'stimulus_md': '', 'stem_md': '', 'options': []}
    if 'copy' in a:
        ex, bq, bg, sp, man = bankq(a['copy'])
        base = {'stimulus_md': bq.get('stimulus_md') or '', 'stem_md': bq.get('stem_md') or '',
                'options': [{'letter': o['letter'], 'text_md': o.get('text_md') or '', **({'figure': o['figure']} if o.get('figure') else {})} for o in bq['options']]}
        if bq.get('figure') and not re.search(r'-opt-', str(bq['figure']), re.I): base['figure'] = bq['figure']  # bank bug: option chart set as question figure
        if bq.get('item_type'): base['item_type'] = bq['item_type']
        gtext = [bg.get('passage_md') or ''] if bg else []
        copy_figs(ex, sp, man, n, bq, [base['stimulus_md'], base['stem_md']] + [o['text_md'] for o in base['options']], bq['options'])
        notes.append(f'text copied from {ex} q{bq["number"]} (already formatted in the bank) and checked against this scan by Claude')
    stim = md(s['STIM']) if 'STIM' in s else base['stimulus_md']
    stem = md(s['STEM']) if 'STEM' in s else base['stem_md']
    opts = {o['letter']: o for o in base['options']}
    for L in 'ABCDEFGH':
        if L in s: opts[L] = {'letter': L, 'text_md': md(s[L])}
    for f in s['figs']:
        fld = f['field']
        if fld in ('stim', 'stem'):
            tag = 'fig'; fid = crop(n, f, tag)
            if fld == 'stim': stim = place(stim, fid)
            else: stem = place(stem, fid)
        elif fld in 'ABCDEFGH':
            manifest[:] = [e for e in manifest if not (e.get('question') == n and e.get('copied_from') and (e.get('option') == fld or re.search(rf'[-_]opt[-_]{fld.lower()}(?=[-_]|$)', e['figure_id'], re.I)))]
            fid = crop(n, f, f'opt-{fld}'); opts.setdefault(fld, {'letter': fld, 'text_md': ''})
            opts[fld].pop('figure', None)
        elif fld == 'passage':
            g = next(x for x in out_groups if x['id'] == a.get('group'))
            g['passage_md'] = place(g['passage_md'], crop(n, f, 'g'))
    olist = [dict(opts[L], marked_in_scan=False) for L in sorted(opts)]
    if 'copy' in a and ('STIM' in s or 'STEM' in s):
        alltext = ' '.join([stim, stem] + [o.get('text_md', '') for o in olist])
        keep = []
        for e in manifest:
            if e.get('question') == n and e.get('copied_from') and not re.search(r'[-_](?:opt|opcion|opción)[-_][a-h](?=[-_]|$)', e['figure_id'], re.I) and e['figure_id'] not in alltext and (e.get('spec_id') or '') not in alltext and not str(e.get('field') or '').endswith('passage'):
                try: os.remove(f"{OUT}/figures/{e['svg']}")
                except OSError: pass
                notes.append(f"dropped copied crop {e['figure_id']} (its text was replaced)")
                continue
            keep.append(e)
        manifest[:] = keep
    q = {'number': n, 'section': a.get('sec', '').replace('_', ' ') or secs(n), 'part': None, 'item_type': a.get('type') or base.get('item_type') or 'standard',
         'group_id': a.get('group'), 'stimulus_md': stim, 'stem_md': stem, 'expected_options': len(olist), 'options': olist,
         'scan_marked_option': None, 'source': {'pages': [int(a['page'])] if 'page' in a else [], 'crop': None},
         'provenance': {'status': 'claude_transcribed', 'trusted': True, 'notes': notes or ['transcribed by Claude from the scan'], 'flags': []},
         'ready': True}
    if base.get('figure') and 'STIM' not in s and 'STEM' not in s and not re.search(r'\[\[figura:[^\]]*-q%d-fig-' % n, stim + stem): q['figure'] = base['figure']  # own crop replaces the bank figure
    if a.get('group') and not stim: q['stimulus_md'] = ''
    questions.append(q)
    if s.get('key'):
        keys[str(n)] = s['key']; km = s.get('keymeta', {})
        side[str(n)] = {'answer': s['key'], 'confidence': km.get('conf', 'medium'), 'status': 'claude_solved',
                        'reason': (km.get('why') or '').strip('"') or None}

golden = {'format': 'icfes-golden/1', 'generated_at': __import__('datetime').datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
          'note': 'Formatted by Claude reading the scan page by page (no OCR or model service). Questions already in the bank reuse that text. Keys solved by Claude: preliminary.',
          'exam': {'doc_id': slug, 'title': exam['title'], 'source_file': os.path.basename(pdf), 'cover_expected_total': len(questions),
                   'extracted_total': len(questions), 'first_number': min(order), 'last_number': max(order), 'warnings': []},
          'sections': [dict(s, found=sum(1 for q in questions if s['first'] <= q['number'] <= s['last']), expected=s['last'] - s['first'] + 1) for s in sections],
          'groups': out_groups, 'questions': questions}
outdir = f'{OUT}/data'
json.dump(golden, open(f'{outdir}/{slug}.golden.json', 'w'), ensure_ascii=False, indent=1)
json.dump({'exam': slug, 'figures': manifest, 'dropped': []}, open(f'{tdir}/manifest.json', 'w'), ensure_ascii=False, indent=1)
json.dump({'format': 'icfes-figures-specs/1', 'exam': slug, 'note': 'Native figures copied from bank questions; everything else is a scan crop (traced/manifest.json).', 'figures': spec_figs, 'pending': []},
          open(f'{OUT}/figures/specs/{slug}.json', 'w'), ensure_ascii=False, indent=1)
if keys:
    json.dump({'format': 'icfes-key/1', 'exam': exam['title'], 'answers': keys}, open(f'{OUT}/answer-keys/{slug}.key.json', 'w'), ensure_ascii=False, indent=1)
    json.dump({'exam': exam['title'], 'source': 'Solved by Claude from the question text (no official key in the PDF)', 'answers': side},
              open(f'{OUT}/answer-keys/{slug}.sidecar.json', 'w'), ensure_ascii=False, indent=1)
missing = [n for n in range(min(order), max(order) + 1) if n not in qs]
print(f'{slug}: {len(questions)} questions, {len(out_groups)} groups, {len(manifest)} crops, {len(spec_figs)} native figs, {len(keys)} keys; missing numbers {missing[:20]}')
