# Builds two Europe maps from Natural Earth (public domain), needs shapely:
#   maps/europa.json       Europe, the former USSR and Turkey, with modern borders and the 1991-era unions
#                          from europa-merges.json (URSS, Yugoslavia, the two Germanies, ...), plus a unified
#                          Alemania (all 16 Länder) for post-1991 maps.
#   maps/europa-1914.json  Europe in 1914, as a partition into empires and states. Built from the pieces and
#                          groups in europa-1914-parts.json, so no two shapes overlap.
# Natural Earth inputs are read from /gen/geo, as in build_maps.py.
import json, os
from shapely.geometry import shape, Polygon, MultiPolygon
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
GEO = '/gen/geo'
SRC = 'Natural Earth (naturalearthdata.com), public domain; ne_110m_admin_0_countries and ne_10m_admin_1_states_provinces'
ASIA_OF_USSR_AND_TURKEY = ['Kazakhstan', 'Uzbekistan', 'Turkmenistan', 'Kyrgyzstan', 'Tajikistan', 'Georgia', 'Armenia', 'Azerbaijan', 'Turkey']

def rings_of(g):
    """Polygons as lists of rings, outer ring first, rounded to 2 decimals."""
    polys = [g] if isinstance(g, Polygon) else list(g.geoms) if isinstance(g, MultiPolygon) else []
    out = []
    for p in polys:
        if p.is_empty:
            continue
        rings = [[round(x, 2), round(y, 2)] for x, y in p.exterior.coords]
        holes = [[[round(x, 2), round(y, 2)] for x, y in h.coords] for h in p.interiors]
        out.append([rings] + holes)
    return out

def simplified(geom, tol):
    return geom.simplify(tol, preserve_topology=True)

def load(name):
    with open(os.path.join(GEO, name) if name.endswith('.geojson') else os.path.join(HERE, name), encoding='utf-8') as f:
        return json.load(f)

def features_from(parts, groups, disjoint):
    """parts: name -> (geometry, code). groups: union name -> member names. Members of a group are not drawn alone.
    disjoint: groups may not share members (the 1914 partition); the 1991 unions overlap on purpose (Alemania and the two Germanies)."""
    used = set()
    features = []
    for group, members in groups.items():
        missing = [m for m in members if m not in parts]
        if missing:
            raise SystemExit(f'{group}: no shape for {missing}')
        dup = [m for m in members if m in used] if disjoint else []
        if dup:
            raise SystemExit(f'{group}: {dup} already in another union')
        union = unary_union([parts[m][0] for m in members]).buffer(0)
        features.append({'name': group, 'code': None, 'merged': True, 'members': members,
                         'polygons': rings_of(simplified(union, 0.02))})
        used.update(members)
    for name, (geom, code) in sorted(parts.items()):
        if name not in used:
            features.append({'name': name, 'code': code, 'polygons': rings_of(geom)})
    return features

def write(doc_name, doc):
    path = os.path.join(HERE, doc_name)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
    print(path, os.path.getsize(path), 'bytes', len(doc['features']), 'features')

# ---- 1991 and modern borders ----
def build_1991():
    countries = load('countries_110m.geojson')
    admin1 = load('admin1_10m.geojson')
    merges = load('europa-merges.json')
    parts = {}
    for f in countries['features']:
        p = f['properties']
        name = p.get('NAME')
        if p.get('ADM0_A3') == 'DEU':
            continue  # Germany is replaced by its Länder below
        if p.get('CONTINENT') == 'Europe' or name in ASIA_OF_USSR_AND_TURKEY:
            parts[name] = (simplified(shape(f['geometry']), 0.25), p.get('ADM0_A3'))
    for f in admin1['features']:
        p = f['properties']
        if p.get('iso_a2') == 'DE' and p.get('name'):
            parts[p['name']] = (simplified(shape(f['geometry']), 0.02), p.get('iso_3166_2'))
    return {'source': SRC, 'license': 'Public domain (Natural Earth)',
            'notes': 'Europe, the former USSR and Turkey, with Germany split into its Länder. Features with merged true are named unions (members listed) for period borders. Alemania is the unified Germany.',
            'features': features_from(parts, merges, disjoint=False)}

# ---- 1914 ----
def build_1914():
    countries = load('countries_110m.geojson')
    admin1 = load('admin1_10m.geojson')
    cfg = load('europa-1914-parts.json')
    units = {}
    for f in admin1['features']:
        p = f['properties']
        if p.get('iso_a2') and p.get('name'):
            units[(p['iso_a2'], p['name'])] = shape(f['geometry'])
    claimed = {}
    # Explicit units first, so that the wildcard (ISO:*) takes what is left.
    for piece, refs in cfg['units'].items():
        for ref in refs:
            iso, name = ref.split(':', 1)
            if name == '*':
                continue
            if (iso, name) not in units:
                raise SystemExit(f'{piece}: no unit {ref} in Natural Earth')
            if (iso, name) in claimed:
                raise SystemExit(f'{ref} is in {claimed[(iso, name)]} and {piece}')
            claimed[(iso, name)] = piece
    pieces = {}
    for piece, refs in cfg['units'].items():
        geoms = []
        for ref in refs:
            iso, name = ref.split(':', 1)
            if name == '*':
                left = [k for k in units if k[0] == iso and k not in claimed]
                for k in left:
                    claimed[k] = piece
                geoms += [units[k] for k in left]
            else:
                geoms.append(units[(iso, name)])
        pieces[piece] = unary_union(geoms).buffer(0)
    for iso in ['DE', 'PL', 'UA', 'RO']:
        left = [k for k in units if k[0] == iso and k not in claimed]
        if left:
            raise SystemExit(f'{iso}: units not in any piece: {[k[1] for k in left]}')
    raw = {}
    replaced = set(cfg['replace'])
    for f in countries['features']:
        p = f['properties']
        name = p.get('NAME')
        if name in replaced or not (p.get('CONTINENT') == 'Europe' or name in ASIA_OF_USSR_AND_TURKEY):
            continue
        geom = shape(f['geometry'])
        if name in cfg['carve']:
            geom = geom.difference(unary_union([pieces[c] for c in cfg['carve'][name]])).buffer(0)
        raw[name] = (geom, p.get('ADM0_A3'))
    clash = [n for n in pieces if n in raw]
    if clash:
        raise SystemExit(f'piece names clash with countries: {clash}')
    # Priority: each shape keeps only the land no earlier shape claimed. Provinces go first, because the 110m
    # countries are too coarse to match their borders, so the countries give way to them.
    parts, claimed = {}, None
    for name in list(pieces) + sorted(raw):
        geom, code = (pieces[name], None) if name in pieces else raw[name]
        if claimed is not None:
            geom = geom.difference(claimed).buffer(0)
        claimed = geom if claimed is None else claimed.union(geom)
        parts[name] = (simplified(geom, 0.02), code)  # small tolerance: a larger one moves the cut borders
    return {'source': SRC, 'license': 'Public domain (Natural Earth)',
            'notes': 'Europe in 1914, approximate: a partition, so no two shapes overlap. Empires and states are unions of countries and provinces (members listed). Serbia includes Vojvodina; Austria-Hungary includes Galicia and Transylvania as Natural Earth provinces.',
            'features': features_from(parts, cfg['groups'], disjoint=True)}

write('europa.json', build_1991())
write('europa-1914.json', build_1914())
