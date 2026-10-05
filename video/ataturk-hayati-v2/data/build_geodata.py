#!/usr/bin/env python3
"""Builds data/region.json (the geodata maps.py reads) from Natural Earth data
shipped in npm packages. Only needed to regenerate the bundled file.

    npm pack world-atlas@2.0.2 && npm pack sane-topojson@4.0.0
    mkdir wa st && tar xzf world-atlas-2.0.2.tgz -C wa && tar xzf sane-topojson-4.0.0.tgz -C st
    python3 build_geodata.py wa/package st/package

Sources (both Natural Earth v4.1.0, public domain):
  * world-atlas (ISC):     land-10m.json, countries-10m.json  -> land, borders, Turkey
  * sane-topojson (MIT):   world_50m.json                     -> lakes, rivers

Output: lon/lat rings & lines clipped to BBOX, Douglas-Peucker simplified,
stored as integer micro-degree deltas (x1e4) to keep the file small.
"""

import json
import os
import sys

BBOX = (12.0, 28.0, 52.0, 50.0)  # lon0, lat0, lon1, lat1
TOL = 0.0012                      # simplification tolerance in degrees
Q = 1e4                           # stored precision: 1e-4 degree


def decode_arcs(topo):
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    out = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        out.append(pts)
    return out


def arc_pts(arcs, i):
    return arcs[i] if i >= 0 else arcs[~i][::-1]


def ring(arcs, idxs):
    pts = []
    for i in idxs:
        a = arc_pts(arcs, i)
        pts.extend(a if not pts else a[1:])
    return pts


def polygons(geom):
    if geom["type"] == "Polygon":
        return [geom["arcs"]]
    if geom["type"] == "MultiPolygon":
        return geom["arcs"]
    return []


def lines(geom):
    if geom["type"] == "LineString":
        return [geom["arcs"]]
    if geom["type"] == "MultiLineString":
        return geom["arcs"]
    return []


def clip_ring(pts, bbox):
    """Sutherland-Hodgman against the bbox rectangle."""
    x0, y0, x1, y1 = bbox
    edges = [
        (lambda p: p[0] >= x0, lambda a, b: (x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0]))),
        (lambda p: p[0] <= x1, lambda a, b: (x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0]))),
        (lambda p: p[1] >= y0, lambda a, b: (a[0] + (b[0] - a[0]) * (y0 - a[1]) / (b[1] - a[1]), y0)),
        (lambda p: p[1] <= y1, lambda a, b: (a[0] + (b[0] - a[0]) * (y1 - a[1]) / (b[1] - a[1]), y1)),
    ]
    out = list(pts)
    for inside, inter in edges:
        if not out:
            break
        src, out = out, []
        prev = src[-1]
        for cur in src:
            if inside(cur):
                if not inside(prev):
                    out.append(inter(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(inter(prev, cur))
            prev = cur
    return out


def clip_line(pts, bbox):
    x0, y0, x1, y1 = bbox
    res, cur = [], []
    for p in pts:
        if x0 <= p[0] <= x1 and y0 <= p[1] <= y1:
            cur.append(p)
        else:
            if len(cur) > 1:
                res.append(cur)
            cur = []
    if len(cur) > 1:
        res.append(cur)
    return res


def dp(pts, tol):
    """Iterative Douglas-Peucker."""
    n = len(pts)
    if n < 3:
        return list(pts)
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        L = (dx * dx + dy * dy) ** 0.5
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            if L == 0:
                d = ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
            else:
                d = abs(dy * px - dx * py + bx * ay - by * ax) / L
            if d > best:
                best, bi = d, i
        if best > tol and bi > 0:
            keep[bi] = True
            stack.append((a, bi))
            stack.append((bi, b))
    return [p for p, k in zip(pts, keep) if k]


def simplify_ring(pts, tol):
    if len(pts) < 8:
        return pts
    # split ring at the farthest point so DP keeps its shape
    h = len(pts) // 2
    s = dp(pts[: h + 1], tol)[:-1] + dp(pts[h:], tol)
    return s


def area(pts):
    a = 0.0
    for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]):
        a += x0 * y1 - x1 * y0
    return a / 2


def enc(pts):
    """Integer delta encoding."""
    out, px, py = [], 0, 0
    for x, y in pts:
        ix, iy = round(x * Q), round(y * Q)
        out += [ix - px, iy - py]
        px, py = ix, iy
    return out


def bbox_hit(pts, bbox):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return not (max(xs) < bbox[0] or min(xs) > bbox[2] or max(ys) < bbox[1] or min(ys) > bbox[3])


def poly_layer(topo, geoms, min_area=0.0):
    arcs = decode_arcs(topo)
    out = []
    for g in geoms:
        for poly in polygons(g):
            rings = []
            for k, idx in enumerate(poly):
                r = ring(arcs, idx)
                if not bbox_hit(r, BBOX):
                    continue
                r = clip_ring(r, BBOX)
                r = simplify_ring(r, TOL)
                if len(r) < 3 or abs(area(r)) < min_area:
                    continue
                rings.append((k, r))
            if rings and rings[0][0] == 0:
                out.append([enc(r) for _, r in rings])
    return out


def main():
    wa, st = sys.argv[1], sys.argv[2]
    land = json.load(open(os.path.join(wa, "land-10m.json")))
    countries = json.load(open(os.path.join(wa, "countries-10m.json")))
    world50 = json.load(open(os.path.join(st, "dist", "world_50m.json")))

    data = {"bbox": BBOX, "q": Q,
            "source": "Natural Earth v4.1.0 (public domain) via npm world-atlas@2.0.2 "
                      "(10m land/countries) and sane-topojson@4.0.0 (50m lakes/rivers)"}
    data["land"] = poly_layer(land, land["objects"]["land"]["geometries"], min_area=2e-5)

    tr = [g for g in countries["objects"]["countries"]["geometries"]
          if g.get("properties", {}).get("name") == "Turkey"]
    data["turkey"] = poly_layer(countries, tr, min_area=2e-5)

    # land borders = arcs shared by two different countries
    use = {}
    for gi, g in enumerate(countries["objects"]["countries"]["geometries"]):
        for poly in polygons(g):
            for r in poly:
                for i in r:
                    use.setdefault(i if i >= 0 else ~i, set()).add(gi)
    carcs = decode_arcs(countries)
    borders = []
    for i, gs in use.items():
        if len(gs) < 2:
            continue
        for seg in clip_line(carcs[i], BBOX):
            seg = dp(seg, TOL)
            if len(seg) > 1:
                borders.append(enc(seg))
    data["borders"] = borders

    data["lakes"] = poly_layer(world50, world50["objects"]["lakes"]["geometries"], min_area=0.004)
    rarcs = decode_arcs(world50)
    rivers = []
    for g in world50["objects"]["rivers"]["geometries"]:
        for idxs in lines(g):
            pts = ring(rarcs, idxs)
            for seg in clip_line(pts, BBOX):
                seg = dp(seg, TOL * 2)
                if len(seg) > 1:
                    rivers.append(enc(seg))
    data["rivers"] = rivers

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "region.json")
    with open(out, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    print(out, os.path.getsize(out), "bytes;",
          {k: len(v) for k, v in data.items() if isinstance(v, list)})


if __name__ == "__main__":
    main()
