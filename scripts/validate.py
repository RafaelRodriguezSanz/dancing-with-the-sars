"""Validate the radar land cover of a processed area against independent maps.

  ESA WorldCover 2021 (10 m, read at its 80 m overview) -> confusion matrix of 4 groups:
      water, woody, open land (grass, crops, bare), built-up.
  JRC Global Surface Water occurrence (1984-2021) -> our permanent water vs. water present >= 50% of the time.

Our class per pixel is the most frequent one over all processed dates (the per-date water class, floods,
counts as water). Reference tiles are downloaded once into data/raw/reference/ (gitignored). Writes
site/data/nisar/<area>/validation.json and prints a summary.

Honest limits: WorldCover is 2021 and has its own errors (~75% overall accuracy); our maps are 2026.
Agreement is not accuracy, but large disagreement shows where the radar rules fail.

Usage:  python scripts/validate.py --area santa-lucia   (or --bbox w,s,e,n for a processed box)
"""
import argparse
import json
import math
import os
import ssl
import sys
import urllib.request

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from nisar_subset import AREAS, ROOT, resolve_area  # noqa: E402

Image.MAX_IMAGE_PIXELS = None
REF_DIR = os.path.join(ROOT, 'data', 'raw', 'reference')
WC_URL = 'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{}_Map.tif'
WC_PAGE = 3  # overview level: 36000 px / 2**3 = 4500 px per 3 degrees, ~74 m
GSW_URL = 'https://storage.googleapis.com/global-surface-water/downloads2021/occurrence/occurrence_{}v1_4_2021.tif'
GSW_WATER = 50  # % of observations with water since 1984

GROUPS = ['water', 'woody', 'open', 'built']
OURS = {1: 'water', 5: 'water', 2: 'woody', 4: 'open', 3: 'built', 6: 'built'}  # our class value -> group
WORLDCOVER = {80: 'water', 10: 'woody', 30: 'open', 40: 'open', 60: 'open', 50: 'built'}  # shrub, wetland, moss: left out


def fetch(url, name):
    """Downloads a reference tile once (they are public, no login)."""
    os.makedirs(REF_DIR, exist_ok=True)
    path = os.path.join(REF_DIR, name)
    if not os.path.exists(path):
        print('downloading', name, flush=True)
        try:
            import certifi
            ctx = ssl.create_default_context(cafile=certifi.where())
        except ImportError:
            ctx = None
        with urllib.request.urlopen(url, context=ctx, timeout=900) as r, open(path + '.part', 'wb') as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)
        os.replace(path + '.part', path)
    return path


def lzw(data, size):
    """TIFF LZW decoder (MSB first, early change): JRC tiles are 40000 px, too big for Pillow in one piece."""
    out, table, prev = bytearray(), [bytes([i]) for i in range(256)] + [b'', b''], None
    bits = width = 9
    buf = nbits = 0
    for byte in data:
        buf, nbits = (buf << 8) | byte, nbits + 8
        while nbits >= width:
            nbits -= width
            code = (buf >> nbits) & ((1 << width) - 1)
            if code == 257:
                return bytes(out[:size])
            if code == 256:
                table, prev, width = table[:258], None, bits
                continue
            entry = table[code] if code < len(table) else prev + prev[:1]
            if prev is not None:
                table.append(prev + entry[:1])
            out += entry
            prev = entry
            if len(table) + 1 >= (1 << width) and width < 12:
                width += 1
    return bytes(out[:size])


def sample_tiled(path, west, north, deg, lon, lat):
    """Nearest pixel of a tiled LZW uint8 GeoTIFF, decoding only the tiles the points fall in."""
    im = Image.open(path)
    t = im.tag_v2
    w, tw, th = t[256], t[322], t[323]
    offs, counts = t[324], t[325]
    px = deg / w
    col = np.floor((lon - west) / px).astype(int)
    row = np.floor((north - lat) / px).astype(int)
    inside = (col >= 0) & (col < w) & (row >= 0) & (row < t[257])
    out = np.full(lon.shape, -1, dtype=np.int16)
    per_row = -(-w // tw)
    tile = (row // th) * per_row + col // tw
    with open(path, 'rb') as f:
        for k in np.unique(tile[inside]):
            f.seek(offs[k])
            arr = np.frombuffer(lzw(f.read(counts[k]), tw * th), dtype=np.uint8)
            arr = np.pad(arr, (0, tw * th - arr.size)).reshape(th, tw)
            sel = inside & (tile == k)
            out[sel] = arr[row[sel] % th, col[sel] % tw]
    return out


def sample(path, page, west, north, deg, lon, lat):
    """Nearest pixel of one page of a lon/lat GeoTIFF tile at the given points; -1 outside the tile."""
    im = Image.open(path)
    im.seek(page)
    px = deg / im.size[0]
    col = np.floor((lon - west) / px).astype(int)
    row = np.floor((north - lat) / px).astype(int)
    inside = (col >= 0) & (col < im.size[0]) & (row >= 0) & (row < im.size[1])
    out = np.full(lon.shape, -1, dtype=np.int16)
    if inside.any():
        r0, r1, c0, c1 = row[inside].min(), row[inside].max() + 1, col[inside].min(), col[inside].max() + 1
        win = np.asarray(im.crop((c0, r0, c1, r1)))
        out[inside] = win[row[inside] - r0, col[inside] - c0]
    return out


def worldcover(lon, lat):
    out = np.full(lon.shape, -1, dtype=np.int16)
    for la in range(math.floor(lat.min() / 3) * 3, math.floor(lat.max() / 3) * 3 + 1, 3):
        for lo in range(math.floor(lon.min() / 3) * 3, math.floor(lon.max() / 3) * 3 + 1, 3):
            name = f'{"S" if la < 0 else "N"}{abs(la):02d}{"W" if lo < 0 else "E"}{abs(lo):03d}'
            try:
                path = fetch(WC_URL.format(name), f'worldcover_{name}.tif')
            except urllib.error.HTTPError:  # open ocean: no tile
                continue
            v = sample(path, WC_PAGE, lo, la + 3, 3, lon, lat)
            out[v >= 0] = v[v >= 0]
    return out


def surface_water(lon, lat):
    out = np.full(lon.shape, -1, dtype=np.int16)
    for top in range(math.ceil(lat.max() / 10) * 10, math.floor(lat.min() / 10) * 10, -10):
        for lo in range(math.floor(lon.min() / 10) * 10, math.floor(lon.max() / 10) * 10 + 1, 10):
            name = f'{abs(lo)}{"W" if lo < 0 else "E"}_{abs(top)}{"S" if top < 0 else "N"}'
            if top == 0:
                name = f'{abs(lo)}{"W" if lo < 0 else "E"}_0N'
            v = sample_tiled(fetch(GSW_URL.format(name), f'gsw_occurrence_{name}.tif'), lo, top, 10, lon, lat)
            out[v >= 0] = v[v >= 0]
    return out


def our_mode(outdir, manifest):
    """Most frequent class per pixel over the non-suspect dates (0 = never had data)."""
    dates = [d for d, s in manifest['scenes'].items() if not s.get('suspect')]
    first = np.asarray(Image.open(os.path.join(outdir, f'{dates[0]}_classes.png')))
    counts = np.zeros((7, *first.shape), dtype=np.uint16)
    for d in dates:
        cls = np.asarray(Image.open(os.path.join(outdir, f'{d}_classes.png')))
        for v in range(1, 7):
            counts[v] += cls == v
    mode = counts.argmax(0).astype(np.uint8)
    mode[counts.sum(0) == 0] = 0
    return mode, len(dates)


def confusion(ours, ref):
    m = np.zeros((len(GROUPS), len(GROUPS)), dtype=np.int64)  # rows: reference, columns: ours
    for i, g_ref in enumerate(GROUPS):
        for j, g_our in enumerate(GROUPS):
            m[i, j] = int(((ref == g_ref) & (ours == g_our)).sum())
    n = m.sum()
    oa = np.trace(m) / n
    pe = (m.sum(0) * m.sum(1)).sum() / n ** 2
    per = {g: {'reference_px': int(m[i].sum()), 'ours_px': int(m[:, i].sum()),
               'recall': round(m[i, i] / m[i].sum(), 3) if m[i].sum() else None,      # producer's accuracy
               'precision': round(m[i, i] / m[:, i].sum(), 3) if m[:, i].sum() else None}  # user's accuracy
           for i, g in enumerate(GROUPS)}
    return {'groups': GROUPS, 'matrix_rows_reference_cols_ours': m.tolist(), 'pixels': int(n),
            'overall_agreement': round(float(oa), 3), 'kappa': round(float((oa - pe) / (1 - pe)), 3), 'per_group': per}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--area', default='santa-lucia', choices=AREAS)
    ap.add_argument('--bbox')
    a = ap.parse_args()
    slug, name, bbox = resolve_area(a.area, a.bbox)
    outdir = os.path.join(ROOT, 'site', 'data', 'nisar', slug)
    manifest = json.load(open(os.path.join(outdir, 'manifest.json'), encoding='utf-8'))
    mode, ndates = our_mode(outdir, manifest)
    w, s, e, n = bbox
    ny, nx = mode.shape
    lon, lat = np.meshgrid(np.linspace(w, e, nx), np.linspace(n, s, ny))  # same grid as nisar_subset.cut()

    wc = worldcover(lon, lat)
    ours_g = np.full(mode.shape, '', dtype=object)
    ref_g = np.full(mode.shape, '', dtype=object)
    for v, g in OURS.items():
        ours_g[mode == v] = g
    for v, g in WORLDCOVER.items():
        ref_g[wc == v] = g
    land = confusion(ours_g, ref_g)

    gsw = surface_water(lon, lat)
    seen = (gsw >= 0) & (gsw <= 100) & (mode > 0)
    ref_w = seen & (gsw >= GSW_WATER)
    our_w = seen & (mode == 5)
    inter, union = int((ref_w & our_w).sum()), int((ref_w | our_w).sum())
    water = {'reference': f'JRC Global Surface Water occurrence >= {GSW_WATER}% (1984-2021)',
             'iou': round(inter / union, 3) if union else None,
             'recall': round(inter / int(ref_w.sum()), 3) if ref_w.sum() else None,
             'precision': round(inter / int(our_w.sum()), 3) if our_w.sum() else None,
             'reference_px': int(ref_w.sum()), 'ours_px': int(our_w.sum())}

    result = {'area': name, 'dates': ndates, 'ours': 'most frequent radar class per pixel over all dates',
              'land_cover': {'reference': 'ESA WorldCover 2021 v200 (10 m, 80 m overview)', **land},
              'permanent_water': water,
              'limits': 'Reference maps have their own errors and are older (2021); agreement, not accuracy.'}
    json.dump(result, open(os.path.join(outdir, 'validation.json'), 'w', encoding='utf-8'), indent=1)
    print(f'{name}: {ndates} dates, {land["pixels"]} pixels compared')
    print(f'land cover vs WorldCover: agreement {land["overall_agreement"]:.0%}, kappa {land["kappa"]:.2f}')
    for g, p in land['per_group'].items():
        print(f'  {g:6s} recall {p["recall"]}  precision {p["precision"]}  (ref {p["reference_px"]} px, ours {p["ours_px"]} px)')
    print(f'permanent water vs JRC: IoU {water["iou"]}, recall {water["recall"]}, precision {water["precision"]}')


if __name__ == '__main__':
    main()
