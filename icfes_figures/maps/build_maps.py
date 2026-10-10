import json, math, os

OUT = '/home/claude/icfes/icfes_figures/maps'
os.makedirs(OUT, exist_ok=True)


def dp(points, tol):
    """Douglas-Peucker simplification of an open polyline."""
    if len(points) < 3:
        return points
    (x1, y1), (x2, y2) = points[0], points[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = math.hypot(dx, dy) or 1e-12
    best, idx = -1.0, 0
    for i in range(1, len(points) - 1):
        x, y = points[i]
        d = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / norm
        if d > best:
            best, idx = d, i
    if best > tol:
        left = dp(points[: idx + 1], tol)
        right = dp(points[idx:], tol)
        return left[:-1] + right
    return [points[0], points[-1]]


def simplify_ring(ring, tol, nd):
    pts = [(round(x, nd), round(y, nd)) for x, y in ring]
    if pts[0] == pts[-1] and len(pts) > 3:
        # A closed ring: split at the point farthest from the start, so DP keeps its shape.
        x0, y0 = pts[0]
        k = max(range(1, len(pts) - 1), key=lambda i: (pts[i][0] - x0) ** 2 + (pts[i][1] - y0) ** 2)
        s = dp(pts[: k + 1], tol)[:-1] + dp(pts[k:], tol)
    else:
        s = dp(pts, tol)
    # Keep a closed ring with at least three distinct points.
    if s[0] != s[-1]:
        s.append(s[0])
    if len(set(s)) < 3:
        return None
    return [[round(x, nd), round(y, nd)] for x, y in s]


def polygons_of(geom):
    if geom['type'] == 'Polygon':
        return [geom['coordinates']]
    if geom['type'] == 'MultiPolygon':
        return geom['coordinates']
    return []


def simplify_geom(geom, tol, nd, min_area=0.0):
    out = []
    for poly in polygons_of(geom):
        rings = []
        for k, ring in enumerate(poly):
            s = simplify_ring(ring, tol, nd)
            if s is None:
                if k == 0:
                    rings = []
                    break
                continue
            rings.append(s)
        if rings and abs(area(rings[0])) >= min_area:
            out.append(rings)
    return out


def area(ring):
    a = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        a += x1 * y2 - x2 * y1
    return a / 2


def write(name, source, features, notes):
    doc = {'source': source, 'license': 'Public domain (Natural Earth)', 'notes': notes, 'features': features}
    path = os.path.join(OUT, name)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
    print(name, os.path.getsize(path), 'bytes', len(features), 'features')


SRC = 'Natural Earth (naturalearthdata.com), public domain; via github.com/nvkelso/natural-earth-vector'

# Colombia departments, from the 10m admin-1 file.
d10 = json.load(open('/gen/geo/admin1_10m.geojson', encoding='utf-8'))
co = []
for f in d10['features']:
    p = f['properties']
    if p.get('iso_a2') != 'CO' or not p.get('name'):
        continue
    polys = simplify_geom(f['geometry'], 0.02, 2, min_area=0.0002)
    if polys:
        co.append({'name': p['name'], 'code': p.get('iso_3166_2'), 'polygons': polys})
write('colombia-departamentos.json', SRC + ' ne_10m_admin_1_states_provinces',
      co, 'Departments of Colombia, simplified to 0.02 degrees. Each polygon is a list of rings; the first ring is the outer edge.')

# Countries, from the 110m file: Colombia outline, South America, Europe and the world.
c110 = json.load(open('/gen/geo/countries_110m.geojson', encoding='utf-8'))
countries = []
for f in c110['features']:
    p = f['properties']
    if p.get('ISO_A3') == 'AQ' or p.get('ADM0_A3') == 'ATA':
        continue
    polys = simplify_geom(f['geometry'], 0.25, 1)
    if not polys:
        continue
    countries.append({'name': p.get('NAME') or p.get('ADMIN'), 'iso3': p.get('ADM0_A3'),
                      'continent': p.get('CONTINENT'), 'polygons': polys})

colombia = [c for c in countries if c['iso3'] == 'COL']
write('colombia-pais.json', SRC + ' ne_110m_admin_0_countries', colombia,
      'Outline of Colombia, simplified to 0.25 degrees.')
sa = [c for c in countries if c['continent'] == 'South America']
write('sudamerica.json', SRC + ' ne_110m_admin_0_countries', sa,
      'South American countries, simplified to 0.25 degrees.')
world = countries
write('mundo.json', SRC + ' ne_110m_admin_0_countries', world,
      'All countries, simplified to 0.25 degrees. Use continent to pick Europe, Asia and so on.')
