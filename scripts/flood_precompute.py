"""
Precomputes the El Niño flood response for a whole area (default Uruguay), so the site answers instantly at
country scale without downloading terrain or calling Overpass:

  flood_hand.png   height above the nearest permanent water, decimetres (0-254; 255 = no data), on the Web
                   Mercator grid of the terrain tiles (same maths as site/js/infrastructure/terrain.js)
  flood_hand.json  grid description: zoom, tile origin, size, corners
  flood_sites.json public buildings from OpenStreetMap (possible refuges) with their height above water

Height above water (HAND-like, as in site/js/domain/floodRisk.js): each cell takes the level of the nearest
water cell; height = elevation - that level. Water = JRC Global Surface Water occurrence >= 50% (rivers wider
than ~30 m, lakes, the Río de la Plata) plus the sea (elevation <= 0). Small streams are not seeds, so heights
next to them are overestimated; the in-browser analysis of a small view adds OpenStreetMap streams.

Usage: .venv/Scripts/python scripts/flood_precompute.py [--area uruguay | --bbox w,s,e,n] [--zoom 10]
"""
import argparse
import io
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from nisar_subset import AREAS, ROOT, resolve_area  # noqa: E402
from validate import surface_water  # noqa: E402

TERRAIN = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
OVERPASS = 'https://overpass-api.de/api/interpreter'
TILE_DIR = os.path.join(ROOT, 'data', 'raw', 'terrain')
TILE = 256
WATER_OCCURRENCE = 50
AMENITY = 'school|college|university|hospital|clinic|community_centre|social_facility|shelter|townhall|fire_station|police|place_of_worship'
LEISURE = 'sports_centre|stadium|sports_hall'
LABEL = {  # same labels as site/js/infrastructure/osmEvacuation.js
    'school': 'School', 'college': 'College', 'university': 'University', 'hospital': 'Hospital', 'clinic': 'Clinic',
    'community_centre': 'Community centre', 'social_facility': 'Social facility', 'shelter': 'Shelter', 'townhall': 'Town hall',
    'fire_station': 'Fire station', 'police': 'Police', 'place_of_worship': 'Place of worship', 'sports_centre': 'Sports centre',
    'stadium': 'Stadium', 'sports_hall': 'Sports hall', 'assembly_point': 'Assembly point',
}


def ssl_ctx():
    try:
        import certifi
        import ssl
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return None


lon_x = lambda lon, z: (lon + 180) / 360 * 2 ** z  # noqa: E731
lat_y = lambda lat, z: (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * 2 ** z  # noqa: E731
x_lon = lambda x, z: x / 2 ** z * 360 - 180  # noqa: E731
y_lat = lambda y, z: math.degrees(math.atan(math.sinh(math.pi - 2 * math.pi * y / 2 ** z)))  # noqa: E731


def tile(z, x, y):
    """Elevation (m) of one Terrarium tile, cached on disk; NaN when missing (open sea)."""
    path = os.path.join(TILE_DIR, str(z), str(x), f'{y}.png')
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        try:
            with urllib.request.urlopen(TERRAIN.format(z=z, x=x, y=y), context=ssl_ctx(), timeout=60) as r:
                data = r.read()
        except urllib.error.HTTPError:
            return np.full((TILE, TILE), np.nan, np.float32)
        with open(path + '.part', 'wb') as f:
            f.write(data)
        os.replace(path + '.part', path)
    px = np.asarray(Image.open(path).convert('RGB'), dtype=np.float32)
    return px[..., 0] * 256 + px[..., 1] + px[..., 2] / 256 - 32768


def terrain(bbox, z):
    w, s, e, n = bbox
    tx0, tx1 = math.floor(lon_x(w, z)), math.floor(lon_x(e, z))
    ty0, ty1 = math.floor(lat_y(n, z)), math.floor(lat_y(s, z))
    elev = np.full(((ty1 - ty0 + 1) * TILE, (tx1 - tx0 + 1) * TILE), np.nan, np.float32)
    jobs = [(x, y) for y in range(ty0, ty1 + 1) for x in range(tx0, tx1 + 1)]
    print(f'terrain z{z}: {len(jobs)} tiles, grid {elev.shape[1]} x {elev.shape[0]}', flush=True)
    with ThreadPoolExecutor(8) as pool:
        for (x, y), arr in zip(jobs, pool.map(lambda j: tile(z, *j), jobs)):
            elev[(y - ty0) * TILE:(y - ty0 + 1) * TILE, (x - tx0) * TILE:(x - tx0 + 1) * TILE] = arr
    return elev, tx0, ty0


def cell_lonlat(shape, tx0, ty0, z):
    """Lon/lat of every cell centre of the grid."""
    h, w = shape
    lon = np.array([x_lon((tx0 * TILE + c + 0.5) / TILE, z) for c in range(w)])
    lat = np.array([y_lat((ty0 * TILE + r + 0.5) / TILE, z) for r in range(h)])
    return np.meshgrid(lon, lat)


def height_above_water(elev, water):
    """Elevation minus the elevation of the nearest water cell (Euclidean nearest; NaN without data)."""
    _, (ri, ci) = ndimage.distance_transform_edt(~water, return_indices=True)
    level = elev[ri, ci]
    return elev - level


def overpass_sites(bbox):
    w, s, e, n = bbox
    b = f'{s},{w},{n},{e}'
    q = (f'[out:json][timeout:300];(nwr["amenity"~"^({AMENITY})$"]({b});nwr["leisure"~"^({LEISURE})$"]({b});'
         f'node["emergency"="assembly_point"]({b}););out center tags qt;')
    for attempt in range(3):
        try:
            req = urllib.request.Request(OVERPASS, data=urllib.parse.urlencode({'data': q}).encode(),
                                         headers={'User-Agent': 'dancing-with-the-sars (hackathon demo)'})
            with urllib.request.urlopen(req, context=ssl_ctx(), timeout=400) as r:
                elements = json.load(r)['elements']
            break
        except Exception as err:  # Overpass is often busy
            print('overpass failed:', err, flush=True)
            time.sleep(20 * (attempt + 1))
    else:
        return []
    sites = []
    for el in elements:
        t = el.get('tags', {})
        p = el if el['type'] == 'node' else el.get('center')
        if not p:
            continue
        kind = 'assembly_point' if t.get('emergency') == 'assembly_point' else t.get('amenity') or t.get('leisure')
        sites.append({'name': t.get('name') or LABEL.get(kind, kind), 'type': LABEL.get(kind, kind),
                      'lon': round(p['lon'], 5), 'lat': round(p['lat'], 5)})
    return sites


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--area', default='uruguay', choices=sorted(AREAS))
    ap.add_argument('--bbox', help='w,s,e,n instead of a named area')
    ap.add_argument('--zoom', type=int, default=10, help='terrain zoom: 10 = about 130 m cells at 33 S')
    args = ap.parse_args()
    slug, name, bbox = resolve_area(args.area, args.bbox)
    out = os.path.join(ROOT, 'site', 'data', 'nisar', slug)
    os.makedirs(out, exist_ok=True)
    z = args.zoom
    t0 = time.time()
    elev, tx0, ty0 = terrain(bbox, z)
    print(f'  {time.time() - t0:.0f}s', flush=True)
    lon, lat = cell_lonlat(elev.shape, tx0, ty0, z)
    occ = surface_water(lon, lat)
    water = ((occ >= WATER_OCCURRENCE) & (occ <= 100)) | (elev <= 0)
    print(f'water seeds: {water.mean():.1%} of cells  {time.time() - t0:.0f}s', flush=True)
    hand = height_above_water(elev, water)
    dm = np.where(np.isfinite(hand), np.clip(np.round(hand * 10), 0, 254), 255).astype(np.uint8)
    Image.fromarray(dm, 'L').save(os.path.join(out, 'flood_hand.png'), optimize=True)
    h, w = dm.shape
    corner = lambda c, r: [round(x_lon((tx0 * TILE + c) / TILE, z), 6), round(y_lat((ty0 * TILE + r) / TILE, z), 6)]  # noqa: E731
    meta = {'area': name, 'bbox': bbox, 'zoom': z, 'tx0': tx0, 'ty0': ty0, 'width': w, 'height': h,
            'corners': [corner(0, 0), corner(w, 0), corner(w, h), corner(0, h)], 'scale_m': 0.1, 'nodata': 255,
            'water': f'JRC Global Surface Water occurrence >= {WATER_OCCURRENCE}% and the sea (elevation <= 0)',
            'terrain': 'NASA SRTM via Terrain Tiles (AWS Open Data)'}
    with open(os.path.join(out, 'flood_hand.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print(f'flood_hand.png {w} x {h}  {time.time() - t0:.0f}s', flush=True)
    sites = overpass_sites(bbox)
    for site in sites:
        c = int((lon_x(site['lon'], z) - tx0) * TILE)
        r = int((lat_y(site['lat'], z) - ty0) * TILE)
        v = hand[r, c] if 0 <= r < h and 0 <= c < w else np.nan
        site['hand'] = round(float(v), 1) if np.isfinite(v) else None
    with open(os.path.join(out, 'flood_sites.json'), 'w', encoding='utf-8') as f:
        json.dump({'source': 'OpenStreetMap contributors (ODbL), via Overpass', 'sites': sites}, f, ensure_ascii=False, separators=(',', ':'))
    print(f'flood_sites.json: {len(sites)} public buildings  {time.time() - t0:.0f}s', flush=True)


if __name__ == '__main__':
    main()
