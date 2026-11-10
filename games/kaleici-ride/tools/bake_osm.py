#!/usr/bin/env python3
"""Bake OpenStreetMap + SRTM data for Antalya Kaleiçi into data/kaleici.js.

Usage:  python3 tools/bake_osm.py [cache_dir]

Downloads (and caches) the raw OSM extract and an SRTM elevation grid, then
writes a compact, game-ready JSON: building footprints, streets, coastline,
city walls, piers, parks, landmarks and a height grid, all in local metres
(x = east, z = south).

Map data (c) OpenStreetMap contributors, ODbL. Elevation: NASA SRTM.
"""
import json, math, os, sys, time, urllib.request

LAT0, LON0 = 36.8840, 30.7050
BBOX = (30.7000, 36.8795, 30.7100, 36.8885)  # W,S,E,N
MX = math.cos(math.radians(LAT0)) * 111320.0
MZ = 110574.0
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'data', 'kaleici.js')
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '.cache')
UA = {'User-Agent': 'kaleici-ride-bake/1.0', 'Accept': 'application/json'}


def proj(lat, lon):
    return (round((lon - LON0) * MX, 2), round(-(lat - LAT0) * MZ, 2))


def fetch(url, path):
    if not os.path.exists(path):
        print('fetch', url[:90])
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=90) as r, open(path, 'wb') as f:
            f.write(r.read())
        time.sleep(1.1)
    with open(path) as f:
        return json.load(f)


def load_osm():
    w, s, e, n = BBOX
    mx, my = (w + e) / 2, (s + n) / 2
    els = {}
    for i, bb in enumerate([(w, s, mx, my), (mx, s, e, my), (w, my, mx, n), (mx, my, e, n)]):
        d = fetch('https://api.openstreetmap.org/api/0.6/map.json?bbox=%f,%f,%f,%f' % bb,
                  os.path.join(CACHE, 'osm%d.json' % i))
        for el in d['elements']:
            els[(el['type'], el['id'])] = el
    return els


def load_elev(step=40.0):
    w, s, e, n = BBOX
    x0, z0 = proj(n, w)
    x1, z1 = proj(s, e)
    nx = int(math.ceil((x1 - x0) / step)) + 1
    nz = int(math.ceil((z1 - z0) / step)) + 1
    pts = []
    for j in range(nz):
        for i in range(nx):
            x, z = x0 + i * step, z0 + j * step
            pts.append((LAT0 - z / MZ, LON0 + x / MX))
    vals = []
    for k in range(0, len(pts), 100):
        loc = '|'.join('%.6f,%.6f' % p for p in pts[k:k + 100])
        d = fetch('https://api.opentopodata.org/v1/srtm30m?locations=' + loc,
                  os.path.join(CACHE, 'elev%d.json' % (k // 100)))
        vals += [r['elevation'] or 0 for r in d['results']]
    return {'x0': x0, 'z0': z0, 'step': step, 'nx': nx, 'nz': nz, 'h': vals}


def area2(p):
    return sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p)))


def pip(x, z, poly):
    c = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, zi = poly[i]
        xj, zj = poly[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi:
            c = not c
        j = i
    return c


def simplify(p, tol=0.15):
    """Drop near-duplicate and collinear vertices."""
    out = []
    for q in p:
        if not out or math.hypot(q[0] - out[-1][0], q[1] - out[-1][1]) > tol:
            out.append(q)
    return out


# Hand-traced outline of the walled old town (lat, lon): Kalekapısı -> Atatürk Cd.
# -> Hadrian -> Karaalioğlu -> Hıdırlık -> coast -> harbour -> back.
OLD_TOWN = [proj(*p) for p in [
    (36.8868, 30.7030), (36.8869, 30.7052), (36.8862, 30.7075), (36.8853, 30.7089),
    (36.8838, 30.7090), (36.8822, 30.7084), (36.8806, 30.7066), (36.8798, 30.7040),
    (36.8800, 30.7020), (36.8822, 30.7010), (36.8845, 30.7008), (36.8862, 30.7015)]]

LANDMARKS = {
    'Hadrian Kapısı': 'hadrian', 'Yivli Minare': 'yivli', 'Saat Kulesi': 'saat',
    'Kesik Minare': 'kesik', 'Hıdırlık Kulesi': 'hidirlik', 'Kale Kapısı Burcu': 'burc',
}
ROAD_W = {'residential': 4.2, 'pedestrian': 4.6, 'living_street': 4.0, 'footway': 2.4, 'path': 2.0,
          'steps': 2.6, 'service': 3.2, 'tertiary': 9.0, 'tertiary_link': 6.0, 'secondary': 13.0,
          'cycleway': 2.0}


def main():
    os.makedirs(CACHE, exist_ok=True)
    els = load_osm()
    nodes = {k[1]: proj(e['lat'], e['lon']) for k, e in els.items() if k[0] == 'node'}
    ways = [e for k, e in els.items() if k[0] == 'way']
    x0, z0 = proj(BBOX[3], BBOX[0])
    x1, z1 = proj(BBOX[1], BBOX[2])

    def geom(w):
        return [nodes[n] for n in w['nodes'] if n in nodes]

    buildings, roads, coast, walls, piers, parks, marks, trees = [], [], [], [], [], [], [], []
    for w in ways:
        t = w.get('tags', {})
        g = geom(w)
        if len(g) < 2:
            continue
        if 'building' in t and len(g) >= 4:
            p = simplify(g[:-1] if g[0] == g[-1] else g)
            if len(p) < 3:
                continue
            if area2(p) < 0:
                p.reverse()  # keep a consistent winding (positive shoelace in x,z)
            a = abs(area2(p)) / 2
            if a < 6:
                continue
            cx = sum(q[0] for q in p) / len(p)
            cz = sum(q[1] for q in p) / len(p)
            if not (x0 - 20 < cx < x1 + 20 and z0 - 20 < cz < z1 + 20):
                continue
            old = pip(cx, cz, OLD_TOWN)
            lv = None
            try:
                lv = int(float(t.get('building:levels', '')))
            except ValueError:
                pass
            if lv is None:
                h = (w['id'] * 2654435761) % 100
                lv = (2 if h < 62 else 3 if h < 85 else 1) if old else (4 + h % 4)
            if old:
                lv = min(lv, 3)
            b = {'p': p, 'l': lv, 'o': 1 if old else 0}
            name = t.get('name')
            if name:
                b['n'] = name
            if name in LANDMARKS:
                b['k'] = LANDMARKS[name]
            elif t.get('building') == 'mosque' or (t.get('amenity') == 'place_of_worship' and 'Cami' in (name or '')):
                b['k'] = 'mosque'
            elif t.get('historic') == 'ruins' or t.get('building') == 'ruins':
                b['k'] = 'ruin'
            buildings.append(b)
        elif 'highway' in t and t['highway'] in ROAD_W:
            r = {'p': g, 'k': t['highway'], 'w': ROAD_W[t['highway']]}
            if 'name' in t:
                r['n'] = t['name']
            roads.append(r)
        elif t.get('natural') == 'coastline':
            coast.append(g)
        elif t.get('barrier') in ('city_wall', 'retaining_wall') or t.get('historic') == 'castle':
            walls.append({'p': g, 'k': t.get('barrier', 'city_wall')})
        elif t.get('man_made') == 'pier':
            piers.append(g)
        elif t.get('leisure') in ('park', 'garden') or t.get('landuse') in ('grass', 'forest', 'orchard'):
            parks.append(g)

    for k, e in els.items():
        t = e.get('tags', {})
        if k[0] == 'node' and t.get('natural') == 'tree':
            trees.append(nodes[k[1]])

    # join coastline ways end to end (land is on the left of the direction of travel)
    joined = True
    while joined:
        joined = False
        for i in range(len(coast)):
            for j in range(len(coast)):
                if i != j and coast[i][-1] == coast[j][0]:
                    coast[i] = coast[i] + coast[j][1:]
                    del coast[j]
                    joined = True
                    break
            if joined:
                break

    # which wall edges face open air (not glued to a neighbouring building)?
    cell = 25.0
    grid = {}
    for bi, b in enumerate(buildings):
        xs = [q[0] for q in b['p']]
        zs = [q[1] for q in b['p']]
        b['_bb'] = (min(xs), min(zs), max(xs), max(zs))
        for gx in range(int(min(xs) // cell), int(max(xs) // cell) + 1):
            for gz in range(int(min(zs) // cell), int(max(zs) // cell) + 1):
                grid.setdefault((gx, gz), []).append(bi)
    for bi, b in enumerate(buildings):
        p = b['p']
        ex = []
        for i in range(len(p)):
            ax, az = p[i]
            bx, bz = p[(i + 1) % len(p)]
            dx, dz = bx - ax, bz - az
            ln = math.hypot(dx, dz) or 1
            nx_, nz_ = dz / ln, -dx / ln  # outward normal for positive-shoelace winding
            hit = False
            for d in (0.6, 1.4):
                px, pz = (ax + bx) / 2 + nx_ * d, (az + bz) / 2 + nz_ * d
                for oj in grid.get((int(px // cell), int(pz // cell)), []):
                    if oj != bi:
                        o = buildings[oj]
                        bb = o['_bb']
                        if bb[0] <= px <= bb[2] and bb[1] <= pz <= bb[3] and pip(px, pz, o['p']):
                            hit = True
                            break
                if hit:
                    break
            ex.append(0 if hit else 1)
        b['e'] = ex
    for b in buildings:
        del b['_bb']
        cx = sum(q[0] for q in b['p']) / len(b['p'])
        cz = sum(q[1] for q in b['p']) / len(b['p'])
        if 'k' in b and b['k'] not in ('mosque', 'ruin'):
            marks.append({'k': b['k'], 'n': b['n'], 'x': round(cx, 1), 'z': round(cz, 1)})

    out = {
        'attribution': 'Map data (c) OpenStreetMap contributors (ODbL). Elevation: NASA SRTM.',
        'origin': [LAT0, LON0], 'bounds': [x0, z0, x1, z1],
        'buildings': buildings, 'roads': roads, 'coast': coast, 'walls': walls,
        'piers': piers, 'parks': parks, 'trees': trees, 'marks': marks,
        'oldTown': OLD_TOWN, 'elev': load_elev(),
    }
    with open(OUT, 'w') as f:
        f.write('// Generated by tools/bake_osm.py. Map data (c) OpenStreetMap contributors, ODbL.\nexport default ')
        json.dump(out, f, separators=(',', ':'), ensure_ascii=False)
    print('buildings %d roads %d coast %d walls %d piers %d parks %d trees %d -> %d kB' % (
        len(buildings), len(roads), len(coast), len(walls), len(piers), len(parks), len(trees),
        os.path.getsize(OUT) // 1024))
    print('marks', marks)


if __name__ == '__main__':
    main()
