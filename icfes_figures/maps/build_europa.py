# Builds maps/europa.json: Europe, the former USSR and Turkey (Natural Earth 110m countries), with Germany
# split into its Länder (Natural Earth 10m admin-1), and named unions from europa-merges.json dissolved into
# one shape each, so period borders (USSR, Yugoslavia, East Germany, ...) fill as one region.
# Needs shapely. Inputs are read from /gen/geo, as in build_maps.py. Public domain (Natural Earth).
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

countries = json.load(open(os.path.join(GEO, 'countries_110m.geojson'), encoding='utf-8'))
admin1 = json.load(open(os.path.join(GEO, 'admin1_10m.geojson'), encoding='utf-8'))
merges = json.load(open(os.path.join(HERE, 'europa-merges.json'), encoding='utf-8'))

shapes = {}   # name -> (geometry, code)
for f in countries['features']:
    p = f['properties']
    name = p.get('NAME')
    if p.get('ADM0_A3') == 'DEU':
        continue  # Germany is replaced by its Länder below
    if p.get('CONTINENT') == 'Europe' or name in ASIA_OF_USSR_AND_TURKEY:
        shapes[name] = (simplified(shape(f['geometry']), 0.25), p.get('ADM0_A3'))
for f in admin1['features']:
    p = f['properties']
    if p.get('iso_a2') == 'DE' and p.get('name'):
        shapes[p['name']] = (simplified(shape(f['geometry']), 0.02), p.get('iso_3166_2'))

features = []
used = set()
for group, members in merges.items():
    missing = [m for m in members if m not in shapes]
    if missing:
        raise SystemExit(f'{group}: no shape for {missing}')
    union = unary_union([shapes[m][0] for m in members]).buffer(0)
    features.append({'name': group, 'code': None, 'merged': True, 'members': members,
                     'polygons': rings_of(simplified(union, 0.02))})
    used.update(members)

for name, (geom, code) in sorted(shapes.items()):
    if name in used:
        continue
    features.append({'name': name, 'code': code, 'polygons': rings_of(geom)})

doc = {'source': SRC, 'license': 'Public domain (Natural Earth)',
       'notes': 'Europe, the former USSR and Turkey, with Germany split into its Länder. Features with merged true are named unions (members listed) for period borders.',
       'features': features}
path = os.path.join(HERE, 'europa.json')
with open(path, 'w', encoding='utf-8') as f:
    json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
print(path, os.path.getsize(path), 'bytes', len(features), 'features')
