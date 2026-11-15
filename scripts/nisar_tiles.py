"""High-resolution web tiles from NISAR GCOV frequency A (~10 m), only for the area box.

For each chosen date: read the frequency-A window over the box (HTTP range reads), average 2x2
pixels (~20 m, less speckle), resample to the Web-Mercator grid at zoom MAX_Z and cut a tile
pyramid MIN_Z..MAX_Z. Lower zooms average power, so they are real downsampled data.
Output in site/data/nisar/<area>/tiles/<date>/:
  rgb/{z}/{x}/{y}.webp   same colour composite and dB stretch as the 80 m image
  cls/{z}/{x}/{y}.png    land-cover class per pixel (recoloured in the browser)
Permanent water: median of all cached high-res dates (at least MIN_OBS of them), stamped on every date.
Dates with tiles are listed in tiles/index.json. Cache of the resampled dB grid: data/raw/nisar/<area>/<date>_z<MAX_Z>.npz (gitignored).

Usage: .venv/Scripts/python scripts/nisar_tiles.py [--dates 2026-10-28 2026-10-29] [--area santa-lucia]
Without --dates it only rebuilds the tiles of the cached dates (no download).
"""
import argparse
import json
import math
import os
import sys
import time

import fsspec
import h5py
import numpy as np
from PIL import Image
from pyproj import Transformer

sys.path.insert(0, os.path.dirname(__file__))
from nisar_access import find_granules, signed_url  # noqa: E402
from nisar_subset import AREAS, ROOT, SHORT_NAMES, STRETCH, classes_with_permanent, db, permanent_water, scale  # noqa: E402

MIN_Z, MAX_Z = 10, 13  # z13 ~ 16 m per pixel at this latitude
TILE = 256
MIN_OBS = 3  # high-res dates needed before anything is called permanent water
PERM_SHARE = 0.3  # zoomed out: a pixel is permanent water if this share of it is (keeps rivers visible)


def lonlat_to_px(lon, lat, z):
    n = TILE * 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def px_to_lonlat(x, y, z):
    n = TILE * 2 ** z
    lon = x / n * 360 - 180
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * y / n))))
    return lon, lat


def grid(bbox):
    """Tile-aligned Web-Mercator grid at MAX_Z covering bbox: first tile x/y and pixel lon/lat axes."""
    w, s, e, n = bbox
    x0, y0 = lonlat_to_px(w, n, MAX_Z)
    x1, y1 = lonlat_to_px(e, s, MAX_Z)
    tx0, ty0, tx1, ty1 = int(x0 // TILE), int(y0 // TILE), int(x1 // TILE), int(y1 // TILE)
    xs = np.arange(tx0 * TILE, (tx1 + 1) * TILE) + 0.5
    ys = np.arange(ty0 * TILE, (ty1 + 1) * TILE) + 0.5
    lon, _ = px_to_lonlat(xs, np.zeros_like(xs), MAX_Z)
    _, lat = px_to_lonlat(np.zeros_like(ys), ys, MAX_Z)
    return tx0, ty0, lon, lat


def sample_granule(url, bbox, lon, lat, hh, hv):
    """Fill NaN cells of hh/hv (power) from one granule's frequency-A data."""
    fs = fsspec.filesystem('http', block_size=4 * 2 ** 20)
    with fs.open(signed_url(url), 'rb', cache_type='blockcache') as f, h5py.File(f, 'r') as h:
        g = h['science/LSAR/GCOV/grids/frequencyA']
        epsg = int(g['projection'][()])
        xs, ys = g['xCoordinates'][:], g['yCoordinates'][:]
        dx, dy = xs[1] - xs[0], ys[1] - ys[0]
        tr = Transformer.from_crs(4326, epsg, always_xy=True)
        w, s, e, n = bbox
        ex, ey = tr.transform([w, e, w, e], [s, s, n, n])
        c0 = max(int((min(ex) - xs[0]) / dx) - 4, 0); c1 = min(int((max(ex) - xs[0]) / dx) + 4, xs.size)
        r0 = max(int((max(ey) - ys[0]) / dy) - 4, 0); r1 = min(int((min(ey) - ys[0]) / dy) + 4, ys.size)
        if c1 <= c0 or r1 <= r0:
            return False
        r1 -= (r1 - r0) % 2; c1 -= (c1 - c0) % 2
        bands = []
        for pol in ('HHHH', 'HVHV'):
            a = g[pol][r0:r1, c0:c1].astype(np.float32)  # only the chunks of the box are fetched
            a[a <= 0] = np.nan
            with np.errstate(invalid='ignore'):
                a = np.nanmean(a.reshape(a.shape[0] // 2, 2, a.shape[1] // 2, 2), axis=(1, 3))  # 2x2 looks
            bands.append(a)
        LON, LAT = np.meshgrid(lon, lat)
        inbox = (LON >= w) & (LON <= e) & (LAT >= s) & (LAT <= n)
        X, Y = tr.transform(LON, LAT)
        col = np.floor((X - (xs[c0] - dx / 2)) / (2 * dx)).astype(int)
        row = np.floor((Y - (ys[r0] - dy / 2)) / (2 * dy)).astype(int)
        ok = inbox & np.isnan(hh) & (col >= 0) & (col < bands[0].shape[1]) & (row >= 0) & (row < bands[0].shape[0])
        hh[ok] = bands[0][row[ok], col[ok]]
        hv[ok] = bands[1][row[ok], col[ok]]
        return True


def built_from_80m(base, date, bbox, lon, lat):
    """Built-up mask of the 80 m product (class 6 in <date>_classes.png, from all 30 dates) on the tile grid:
    four high-res dates are too few for a stable median, and the two zoom levels must agree."""
    path = os.path.join(base, f'{date}_classes.png')
    if not os.path.exists(path):
        return np.zeros((lat.size, lon.size), np.float32)
    cls = np.array(Image.open(path))
    w, s, e, n = bbox
    ny, nx = cls.shape
    c, r = ((lon - w) / (e - w) * nx).astype(int), ((n - lat) / (n - s) * ny).astype(int)
    out = cls[np.ix_(np.clip(r, 0, ny - 1), np.clip(c, 0, nx - 1))] == 6
    out &= ((r >= 0) & (r < ny))[:, None] & ((c >= 0) & (c < nx))[None, :]
    return out.astype(np.float32)


def halve(a, tx0, ty0):
    """Next zoom out: pad to even tile alignment, then average 2x2 (power)."""
    if tx0 % 2:
        a = np.pad(a, ((0, 0), (TILE, 0)), constant_values=np.nan); tx0 -= 1
    if ty0 % 2:
        a = np.pad(a, ((TILE, 0), (0, 0)), constant_values=np.nan); ty0 -= 1
    h, w = a.shape
    a = np.pad(a, ((0, (2 * TILE - h % (2 * TILE)) % (2 * TILE)), (0, (2 * TILE - w % (2 * TILE)) % (2 * TILE))), constant_values=np.nan)
    with np.errstate(invalid='ignore'):
        a = np.nanmean(a.reshape(a.shape[0] // 2, 2, a.shape[1] // 2, 2), axis=(1, 3))
    return a, tx0 // 2, ty0 // 2


def write_tiles(hh, hv, perm, built, tx0, ty0, z, outdir):
    n = 0
    for ty in range(hh.shape[0] // TILE):
        for tx in range(hh.shape[1] // TILE):
            sl = np.s_[ty * TILE:(ty + 1) * TILE, tx * TILE:(tx + 1) * TILE]
            h, v = db(hh[sl]), db(hv[sl])
            nodata = np.isnan(h) | np.isnan(v)
            if nodata.all():
                continue
            rgb = np.stack([scale(h, *STRETCH['HH']), scale(v, *STRETCH['HV']), scale(h - v, *STRETCH['RATIO'])], axis=-1)
            img = np.dstack([np.nan_to_num(rgb), np.where(nodata, 0, 255)]).astype(np.uint8)
            for kind in ('rgb', 'cls'):
                os.makedirs(os.path.join(outdir, kind, str(z), str(tx0 + tx)), exist_ok=True)
            Image.fromarray(img, 'RGBA').save(os.path.join(outdir, 'rgb', str(z), str(tx0 + tx), f'{ty0 + ty}.webp'), quality=75, method=4)
            cls = Image.fromarray(classes_with_permanent(h, v, perm[sl] >= PERM_SHARE, built[sl] >= 0.5), 'L')
            cls.save(os.path.join(outdir, 'cls', str(z), str(tx0 + tx), f'{ty0 + ty}.png'), optimize=True)
            n += 1
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--area', default='santa-lucia', choices=AREAS)
    ap.add_argument('--dates', nargs='+', default=[], help='dates to download (cached dates are always rebuilt)')
    a = ap.parse_args()
    name, bbox = AREAS[a.area]
    base = os.path.join(ROOT, 'site', 'data', 'nisar', a.area)
    cachedir = os.path.join(ROOT, 'data', 'raw', 'nisar', a.area)
    os.makedirs(cachedir, exist_ok=True)
    tx0, ty0, lon, lat = grid(bbox)
    by_date = {}
    for short in SHORT_NAMES if a.dates else []:
        for gr in find_granules(short, bbox):
            by_date.setdefault(gr['start'][:10], []).append(gr)
    for date in a.dates:  # 1) download the missing dates
        cache = os.path.join(cachedir, f'{date}_z{MAX_Z}.npz')
        if os.path.exists(cache):
            continue
        t = time.time()
        hh = np.full((lat.size, lon.size), np.nan, np.float32)
        hv = hh.copy()
        for gr in by_date.get(date, []):
            try:
                sample_granule(gr['h5'], bbox, lon, lat, hh, hv)
            except Exception as e:
                print(date, gr['title'][-40:], 'FAILED', type(e).__name__, str(e)[:120])
        if np.isnan(hh).all():
            print(date, 'no data'); continue
        np.savez_compressed(cache, hh=db(hh).astype(np.float16), hv=db(hv).astype(np.float16))
        print(date, 'downloaded', f'{time.time() - t:.0f}s')
    suffix = f'_z{MAX_Z}.npz'
    dates = sorted(f[:10] for f in os.listdir(cachedir) if f.endswith(suffix))
    stack = {d: np.load(os.path.join(cachedir, d + suffix)) for d in dates}
    if len(dates) >= MIN_OBS:
        perm = permanent_water([z['hh'] for z in stack.values()], [z['hv'] for z in stack.values()], MIN_OBS).astype(np.float32)
    else:
        perm = np.zeros((lat.size, lon.size), np.float32)
    print('permanent water from', len(dates), 'dates:', f'{perm.mean():.2%} of the grid')
    for date, z in stack.items():  # 2) cut the pyramid of every cached date with the same mask
        t = time.time()
        hh, hv = 10 ** (z['hh'].astype(np.float32) / 10), 10 ** (z['hv'].astype(np.float32) / 10)
        p, outdir = perm.copy(), os.path.join(base, 'tiles', date)
        b = built_from_80m(base, date, bbox, lon, lat)
        x0, y0, total = tx0, ty0, 0
        for zoom in range(MAX_Z, MIN_Z - 1, -1):
            total += write_tiles(hh, hv, p, b, x0, y0, zoom, outdir)
            if zoom > MIN_Z:
                hh, _, _ = halve(hh, x0, y0)
                p, _, _ = halve(p, x0, y0)
                b, _, _ = halve(b, x0, y0)
                hv, x0, y0 = halve(hv, x0, y0)
        print(date, total, 'tiles', f'{time.time() - t:.0f}s')
    json.dump({'dates': dates, 'min_zoom': MIN_Z, 'max_zoom': MAX_Z}, open(os.path.join(base, 'tiles', 'index.json'), 'w', encoding='utf-8'), indent=1)


if __name__ == '__main__':
    main()
