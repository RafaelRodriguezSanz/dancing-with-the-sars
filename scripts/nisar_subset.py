"""Cut an area out of remote NISAR GCOV granules and write small web images.

Only the HDF5 chunks that cover the area are downloaded (HTTP range reads),
not the whole ~2 GB granule. Output, per date, in site/data/nisar/<area>/:
  <date>.webp         RGB composite on a regular lon/lat grid (R=HH, G=HV, B=HH-HV, in dB)
  <date>_steady.webp  same, with the viewing-angle difference between orbit passes removed (steady_view)
  <date>_classes.png  land-cover class per pixel (values in CLASSES), recoloured in the browser;
                      permanent water and built-up come from the whole time series (permanent_water, built_up)
  builtup.json        GeoJSON outlines of the built-up areas (towns, sheds), the same for every date
  manifest.json       dates, bounds, dB stretch, class shares and provenance
The cut dB values are cached in data/raw/nisar/<area>/<date>.npz (gitignored), so new
products can be derived later without downloading again. Products of every cached date are
always rebuilt (about 1 s each), because permanent water changes when a new date arrives.

Usage: .venv/Scripts/python scripts/nisar_subset.py [--area santa-lucia | --bbox w,s,e,n] [--freq B] [--limit N] [--offline]
Any box on Earth works with --bbox; its folder is area_slug(bbox), the same name the site computes.
Needs an Earthdata token (.env, see .env.example and nisar_access.py). The token is never written to output.
"""
import argparse
import json
import os
import sys
import time
import warnings
from concurrent.futures import ProcessPoolExecutor, as_completed

import fsspec
import h5py
import numpy as np
from PIL import Image, ImageFilter
from pyproj import Transformer
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from nisar_access import find_granules, signed_url  # noqa: E402
from outline import outline  # noqa: E402

AREAS = {'santa-lucia': ('Santa Lucía basin', [-56.75, -34.75, -56.05, -34.15]),
         'montevideo': ('Montevideo', [-56.45, -34.97, -56.0, -34.7]),
         'uruguay': ('Uruguay', [-58.5, -35.0, -53.1, -30.1])}
# Per-area overrides. Uruguay: 200 m pixels (a country, not a basin); one pass covers only a strip of it, so a date
# counts from 1% coverage, and the date-median outlier test is off (each strip sees different land and sea).
COUNTRY_OPTS = {'out_px': 2700, 'min_valid': 0.01, 'suspect_db': 99, 'mosaic': True}
AREA_OPTS = {'uruguay': COUNTRY_OPTS}
COUNTRY_SPAN_DEG = 1.5  # boxes wider than this (any side) are processed like a country: mosaic, ~2700 px


def area_options(slug, bbox):
    """Processing options of an area: named ones from AREA_OPTS; any big drawn box (a country or a region
    found by name in the site) gets the country options, since one pass covers only a strip of it."""
    if slug in AREA_OPTS:
        return AREA_OPTS[slug]
    return COUNTRY_OPTS if max(bbox[2] - bbox[0], bbox[3] - bbox[1]) > COUNTRY_SPAN_DEG else {}
MOSAIC = 'latest'  # products key of the mosaic: newest valid pixel of all dates (a country needs many passes)
WORKERS = int(os.environ.get('NISAR_WORKERS', 4))  # dates downloaded in parallel (separate processes: h5py serialises threads)


def area_slug(bbox):
    """Folder name of a box; must match areaDir() in site/js/layers/nisarCalibrated.js."""
    for key, (_, b) in AREAS.items():
        if [round(v, 4) for v in b] == [round(v, 4) for v in bbox]:
            return key
    return 'aoi_' + '_'.join(f'{v:.4f}' for v in bbox)


def resolve_area(area, bbox_arg):
    """(slug, name, bbox) from --area or --bbox 'w,s,e,n'."""
    if not bbox_arg:
        return (area, *AREAS[area])
    bbox = [round(float(v), 4) for v in bbox_arg.split(',')]
    w, s, e, n = bbox
    if not (-180 <= w < e <= 180 and -90 <= s < n <= 90):
        raise SystemExit(f'bad --bbox {bbox_arg}: expected w,s,e,n')
    return area_slug(bbox), f'Box {w}, {s} to {e}, {n}', bbox


SHORT_NAMES = ['NISAR_L2_GCOV_V1', 'NISAR_L2_GCOV_PROVISIONAL_V1']
# Fixed dB stretch so every date uses the same colors and changes are comparable.
STRETCH = {'HH': (-25.0, 0.0), 'HV': (-32.0, -8.0), 'RATIO': (0.0, 15.0)}
OUT_PX = 900  # output width in pixels
ROOT = os.path.join(os.path.dirname(__file__), '..')

# Rule-based land cover from L-band gamma0 (dB). Simple, explainable thresholds, not a trained model.
# Order matters: the first rule that matches wins. 0 = no data.
def WATER(hh, hv):
    return (hh < -15) & (hv < -22)


CLASSES = [
    (1, 'water', 'Water on this date only: very low HH and HV, but not on most dates (flooding, or smooth bare soil)',
     WATER),
    (2, 'woody', 'Woody vegetation: high HV (volume scattering in branches)',
     lambda hh, hv: hv > -14),
    (3, 'double-bounce', 'Built-up or flooded vegetation: very high HH, much higher than HV (double bounce)',
     lambda hh, hv: (hh > -4) & (hh - hv > 9)),
    (4, 'herbaceous', 'Grassland and crops: everything else with data',
     lambda hh, hv: np.isfinite(hh) & np.isfinite(hv)),
    (5, 'permanent-water', 'Permanent water: the water rule holds on the median of all dates (rivers, lakes, reservoirs), plus open water that is nearly always there in JRC Global Surface Water (wind makes it too bright for radar)',
     None),  # not a per-date rule: stamped from permanent_water()
    (6, 'built-up', 'Built-up: very bright HH, far above HV, on the median of all dates (towns, sheds); shown as its own layer',
     None),  # not a per-date rule: stamped from built_up()
]
MIN_OBS = 5  # dates needed per pixel before calling it permanent
# Buildings: walls and ground form corner reflectors (double bounce), so HH is very high all year. Streets
# not aligned with the orbit also raise HV, which is why towns used to fall in 'woody' (HV > -14).
# Woody pixels have a median HH near -6 dB and HH-HV near 6 dB; town centres about -3 dB and 8-9 dB.
BUILT_HH, BUILT_RATIO = -4.0, 7.0  # dB, on the per-pixel median of all dates
BUILT_MIN_PX = 4  # smaller clusters (one barn, a silo) are dropped: ~2.5 ha at 80 m
SUSPECT_DB = 3  # a date whose median HH is this far from the usual is a calibration outlier


def pass_of(granule):
    """Orbit pass of a granule ('21:50 UTC'): same pass = same viewing geometry, so dates compare fairly."""
    t = str(granule).split('_')[-7][9:13]  # HHMM of the start time in the granule name
    return f'{t[:2]}:{int(t[2:]) // 10 * 10:02d} UTC'


def nanmedian(a, axis=0):
    """np.nanmedian over `axis` without numpy's one-warning-per-empty-pixel loop (tens of millions of
    calls outside the swaths took minutes): sort (NaN goes last) and pick the middle valid values."""
    a = np.asarray(a, np.float32)
    n = np.isfinite(a).sum(axis)
    srt = np.sort(a, axis=axis)
    pick = lambda i: np.take_along_axis(srt, np.expand_dims(i, axis), axis).squeeze(axis)  # noqa: E731
    out = (pick(np.maximum(n - 1, 0) // 2) + pick(n // 2)) / 2
    out[n == 0] = np.nan
    return out


def medians(hh_stack, hv_stack, rows=512):
    """Per-pixel median over time of HH and HV (dB), and the number of dates with data."""
    shape = hh_stack[0].shape
    mh, mv, n = np.full(shape, np.nan, np.float32), np.full(shape, np.nan, np.float32), np.zeros(shape, int)
    for r in range(0, shape[0], rows):  # row blocks keep memory low on big grids
        hh = np.stack([a[r:r + rows] for a in hh_stack]).astype(np.float32)
        hv = np.stack([a[r:r + rows] for a in hv_stack]).astype(np.float32)
        n[r:r + rows] = (np.isfinite(hh) & np.isfinite(hv)).sum(0)
        with warnings.catch_warnings():
            warnings.simplefilter('ignore')  # all-NaN pixels outside the swaths
            mh[r:r + rows], mv[r:r + rows] = nanmedian(hh, 0), nanmedian(hv, 0)
    return mh, mv, n


REFERENCE_WATER = 90  # % JRC occurrence: water almost always since 1984 (sea, estuary, big lakes)


def reference_water(bbox, shape):
    """Water that is there nearly always, from JRC Global Surface Water, on the product grid; None if unavailable.
    Wind-roughened open water (the Río de la Plata, the ocean) is often too bright for the radar water rule, so
    the radar alone would call it grassland. This mask fills it in; the radar still decides everything else."""
    from validate import surface_water  # lazy: validate imports this module
    w, s, e, n = bbox
    ny, nx = shape
    lon, lat = np.meshgrid(np.linspace(w, e, nx), np.linspace(n, s, ny))  # same grid as cut()
    try:
        occ = surface_water(lon, lat)
    except Exception as err:  # offline or server down: keep the radar-only mask
        print('reference water unavailable:', type(err).__name__, str(err)[:80], flush=True)
        return None
    return (occ >= REFERENCE_WATER) & (occ <= 100)


def permanent_water(hh_stack, hv_stack, min_obs=MIN_OBS):
    """Boolean mask: water rule on the per-pixel median over time (dB). The median removes speckle,
    so thin rivers stay continuous, and ignores fields that are dark only after tilling."""
    mh, mv, n = medians(hh_stack, hv_stack)
    with np.errstate(invalid='ignore'):
        return WATER(mh, mv) & (n >= min_obs)


def built_up(mh, mv, n, min_obs=MIN_OBS):
    """Boolean mask of built-up clusters from the per-pixel medians (see BUILT_HH). Towns full of trees
    look like woody vegetation to the radar and are missed; big metal sheds and greenhouses are caught."""
    with np.errstate(invalid='ignore'):
        m = (mh > BUILT_HH) & (mh - mv > BUILT_RATIO) & (n >= min_obs)
    lab, k = ndimage.label(m, structure=np.ones((3, 3)))
    sizes = ndimage.sum(m, lab, range(1, k + 1))
    return np.isin(lab, np.nonzero(sizes >= BUILT_MIN_PX)[0] + 1)


def built_up_geojson(mask, mh, mv, bbox):
    """One smoothed polygon per built-up cluster (8-connected), with its median HH and HV."""
    ny, nx = mask.shape
    w, s, e, n = bbox
    lab, _ = ndimage.label(mask, structure=np.ones((3, 3)))
    feats = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        r0, c0 = sl[0].start - 1, sl[1].start - 1
        patch = np.pad(lab[sl] == i + 1, 1)
        ring = [[round(w + (c0 + x) / nx * (e - w), 5), round(n - (r0 + y) / ny * (n - s), 5)] for x, y in outline(patch)]
        rows, cols = np.nonzero(patch[1:-1, 1:-1])
        rows, cols = rows + sl[0].start, cols + sl[1].start
        feats.append({'type': 'Feature', 'geometry': {'type': 'Polygon', 'coordinates': [ring[::-1] + [ring[-1]]]},
                      'properties': {'kind': 'built-up', 'area_ha': round(len(rows) * 0.64, 1),
                                     'median_HH_db': round(float(np.nanmedian(mh[rows, cols])), 1),
                                     'median_HV_db': round(float(np.nanmedian(mv[rows, cols])), 1)}})
    return {'type': 'FeatureCollection', 'features': feats}


def steady_view(hh, hv, pass_med, all_med):
    """Swap the per-pixel median of this date's orbit pass for the median of all dates, so a playback
    that mixes passes shows real change instead of viewing-angle flicker."""
    return hh - pass_med[0] + all_med[0], hv - pass_med[1] + all_med[1]


def db(power):
    with np.errstate(divide='ignore', invalid='ignore'):
        return 10 * np.log10(power)


def scale(x, lo, hi):
    return np.clip((x - lo) / (hi - lo) * 255, 0, 255)


def cut(url, bbox, freq):
    """Return (hh_db, hv_db) resampled to a regular lon/lat grid over bbox, NaN where no data."""
    fs = fsspec.filesystem('http', block_size=2 ** 20)
    with fs.open(signed_url(url), 'rb', cache_type='blockcache') as f, h5py.File(f, 'r') as h:
        g = h[f'science/LSAR/GCOV/grids/frequency{freq}']
        epsg = int(g['projection'][()])
        xs, ys = g['xCoordinates'][:], g['yCoordinates'][:]
        w, s, e, n = bbox
        aspect = (n - s) / ((e - w) * np.cos(np.radians((n + s) / 2)))
        nx, ny = OUT_PX, int(round(OUT_PX * aspect))
        lon = np.linspace(w, e, nx)
        lat = np.linspace(n, s, ny)
        LON, LAT = np.meshgrid(lon, lat)
        X, Y = Transformer.from_crs(4326, epsg, always_xy=True).transform(LON, LAT)
        dx, dy = xs[1] - xs[0], ys[1] - ys[0]
        col = np.round((X - xs[0]) / dx).astype(int)
        row = np.round((Y - ys[0]) / dy).astype(int)
        inside = (col >= 0) & (col < xs.size) & (row >= 0) & (row < ys.size)
        if not inside.any():
            return None
        r0, r1 = row[inside].min(), row[inside].max() + 1
        c0, c1 = col[inside].min(), col[inside].max() + 1
        out = {}
        for pol in ('HHHH', 'HVHV'):
            win = g[pol][r0:r1, c0:c1]  # only these chunks are fetched
            band = np.full(LON.shape, np.nan, dtype=np.float32)
            band[inside] = win[row[inside] - r0, col[inside] - c0]
            band[band <= 0] = np.nan
            out[pol] = db(band)
        return out['HHHH'], out['HVHV'], {'epsg': epsg, 'spacing_m': float(abs(dx)), 'window': [int(r0), int(r1), int(c0), int(c1)]}


def to_image(hh, hv, path):
    rgb = np.stack([scale(hh, *STRETCH['HH']), scale(hv, *STRETCH['HV']), scale(hh - hv, *STRETCH['RATIO'])], axis=-1)
    alpha = np.where(np.isnan(hh) | np.isnan(hv), 0, 255)
    img = np.dstack([np.nan_to_num(rgb), alpha]).astype(np.uint8)
    Image.fromarray(img, 'RGBA').save(path, quality=80, method=4)  # WebP: ~150 KB per date; method 6 was 3x slower for ~5% smaller


def classify(hh, hv):
    out = np.zeros(hh.shape, dtype=np.uint8)
    with np.errstate(invalid='ignore'):
        for value, _, _, rule in reversed(CLASSES):  # reversed so earlier rules overwrite later ones
            if rule is not None:
                out[rule(hh, hv)] = value
    return out


def classes_with_permanent(hh, hv, perm, built=None):
    cls = classify(hh, hv)
    cls = np.array(Image.fromarray(cls, 'L').filter(ImageFilter.ModeFilter(3)))  # remove single-pixel speckle
    if built is not None:
        cls[built & (cls > 0)] = 6
    if perm is not None:
        cls[perm & (cls > 0)] = 5  # after the filter, so narrow rivers are not eroded
    return cls


def build_products(hh, hv, outdir, date, perm=None, built=None):
    to_image(hh, hv, os.path.join(outdir, f'{date}.webp'))
    cls = classes_with_permanent(hh, hv, perm, built)
    Image.fromarray(cls, 'L').save(os.path.join(outdir, f'{date}_classes.png'), optimize=True)
    valid = max(int((cls > 0).sum()), 1)
    return {key: round(float((cls == v).sum()) / valid, 4) for v, key, _, _ in CLASSES}


def download_to_cache(grans, bbox, freq, date, cache, out_px):
    """Worker process: one date -> <date>.npz. Returns a log line."""
    global OUT_PX
    OUT_PX = out_px
    t = time.time()
    hh, hv, used, info = download(grans, bbox, freq, date)
    if hh is None:
        return f'{date} no data'
    np.savez_compressed(cache, hh=hh.astype(np.float16), hv=hv.astype(np.float16), granules=np.array(used),
                        epsg=info.get('epsg', 0), spacing_m=info.get('spacing_m', 0))
    return f'{date} downloaded {time.time() - t:.0f}s'


def download(grans, bbox, freq, date):
    hh = hv = None
    used, info = [], {}
    for gr in grans:  # several frames of one pass: fill the gaps of the first with the next
        try:
            res = cut(gr['h5'], bbox, freq)
        except Exception as e:  # keep going; one bad granule must not stop the batch
            print(date, gr['title'][-40:], 'FAILED', type(e).__name__, str(e)[:120]); continue
        if res is None:
            continue
        h, v, info = res
        if hh is None:
            hh, hv = h, v
        else:
            gap = np.isnan(hh)
            hh[gap], hv[gap] = h[gap], v[gap]
        used.append(gr['title'])
    return hh, hv, used, info


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--area', default='santa-lucia', choices=AREAS)
    ap.add_argument('--bbox', help='any box instead of --area: w,s,e,n in degrees')
    ap.add_argument('--freq', default='B', choices='AB')
    ap.add_argument('--offline', action='store_true', help='do not search or download, only rebuild from the cache')
    ap.add_argument('--limit', type=int, default=0, help='only the newest N dates (0 = all)')
    a = ap.parse_args()
    slug, name, bbox = resolve_area(a.area, a.bbox)
    global OUT_PX
    opts = area_options(slug, bbox)
    OUT_PX = opts.get('out_px', OUT_PX)
    outdir = os.path.join(ROOT, 'site', 'data', 'nisar', slug)
    cachedir = os.path.join(ROOT, 'data', 'raw', 'nisar', slug)
    os.makedirs(outdir, exist_ok=True)
    os.makedirs(cachedir, exist_ok=True)
    mpath = os.path.join(outdir, 'manifest.json')
    manifest = json.load(open(mpath, encoding='utf-8')) if os.path.exists(mpath) else {'scenes': {}}
    by_date = {}  # date -> granules; the final collection first so it wins where both exist
    if not a.offline:
        for short in SHORT_NAMES:
            for gr in find_granules(short, bbox):
                by_date.setdefault(gr['start'][:10], []).append({**gr, 'collection': short})
    dates = sorted(by_date, reverse=True)  # newest first
    todo = [d for d in (dates[:a.limit] if a.limit else dates) if not os.path.exists(os.path.join(cachedir, f'{d}.npz'))]
    print(f'@progress 0.02 {len(dates)} NISAR dates found, {len(todo)} to download', flush=True)
    with ProcessPoolExecutor(WORKERS) as pool:  # 1) download what is not cached yet (the progress bar: 2% to 85%)
        jobs = [pool.submit(download_to_cache, by_date[d], bbox, a.freq, d, os.path.join(cachedir, f'{d}.npz'), OUT_PX) for d in todo]
        for i, job in enumerate(as_completed(jobs)):
            print(f'@progress {0.02 + 0.83 * (i + 1) / len(todo):.3f} {job.result()} ({i + 1}/{len(todo)})', flush=True)
    cached = {}  # <date>.npz only, not the _z13 tile caches; dates with almost no data are left out
    for f in sorted(os.listdir(cachedir)):
        if len(f) == 14 and f.endswith('.npz'):
            z = np.load(os.path.join(cachedir, f))
            if np.isfinite(z['hh'].astype(np.float32)).mean() >= opts.get('min_valid', 0.05):
                cached[f[:10]] = z
    med = {d: float(np.nanmedian(z['hh'].astype(np.float32))) for d, z in cached.items()}
    usual = float(np.median(list(med.values())))
    suspect = {d for d, m in med.items() if abs(m - usual) > opts.get('suspect_db', SUSPECT_DB)}
    good = [d for d in cached if d not in suspect]
    mh, mv, nobs = medians([cached[d]['hh'] for d in good], [cached[d]['hv'] for d in good])
    with np.errstate(invalid='ignore'):
        perm = WATER(mh, mv) & (nobs >= MIN_OBS)
    Image.fromarray(perm.astype(np.uint8) * 255).save(os.path.join(outdir, 'permanent_water_radar.png'))  # radar only, for validate.py
    ref = reference_water(bbox, perm.shape)
    if ref is not None:
        print(f'reference water (JRC >= {REFERENCE_WATER}%) adds {(ref & ~perm & (nobs > 0)).mean():.2%} of the box', flush=True)
        perm |= ref & (nobs > 0)
    built = built_up(mh, mv, nobs) & ~perm
    print('permanent water from', len(good), 'dates:', f'{perm.mean():.2%} of the box; built-up {built.mean():.2%}; suspect:', sorted(suspect))
    json.dump(built_up_geojson(built, mh, mv, bbox), open(os.path.join(outdir, 'builtup.json'), 'w', encoding='utf-8'), separators=(',', ':'))
    passes = {d: pass_of(z['granules'][0]) for d, z in cached.items()}
    pass_med = {p: medians([cached[d]['hh'] for d in good if passes[d] == p], [cached[d]['hv'] for d in good if passes[d] == p])[:2]
                for p in set(passes.values())}
    manifest['scenes'] = {}
    for i, (date, z) in enumerate(cached.items()):  # 2) rebuild every product with the same masks (85% to 100%)
        print(f'@progress {0.85 + 0.15 * i / len(cached):.3f} building images {i + 1}/{len(cached)}', flush=True)
        hh, hv = z['hh'].astype(np.float32), z['hv'].astype(np.float32)
        valid = float(np.isfinite(hh).mean())
        shares = build_products(hh, hv, outdir, date, perm, built)
        to_image(*steady_view(hh, hv, pass_med[passes[date]], (mh, mv)), os.path.join(outdir, f'{date}_steady.webp'))
        manifest['scenes'][date] = {'granules': [str(g) for g in z['granules']], 'valid': round(valid, 3),
                                    'epsg': int(z['epsg']), 'spacing_m': float(z['spacing_m']),
                                    'hh_median_db': round(float(np.nanmedian(hh)), 2),
                                    'hv_median_db': round(float(np.nanmedian(hv)), 2),
                                    'pass': passes[date], 'suspect': date in suspect,
                                    'class_share': shares}
        print(date, f'{valid:.0%} valid', shares)
    manifest.pop('mosaic', None)
    if opts.get('mosaic') and good:
        order = sorted(good, reverse=True)
        hh = np.full(cached[order[0]]['hh'].shape, np.nan, dtype=np.float32)
        hv = hh.copy()
        for d in order:  # newest first: each pixel keeps its most recent observation
            gap = np.isnan(hh)
            if not gap.any():
                break
            hh[gap], hv[gap] = cached[d]['hh'].astype(np.float32)[gap], cached[d]['hv'].astype(np.float32)[gap]
        shares = build_products(hh, hv, outdir, MOSAIC, perm, built)
        to_image(hh, hv, os.path.join(outdir, f'{MOSAIC}_steady.webp'))  # mixed passes: no single pass to steady
        manifest['mosaic'] = {'key': MOSAIC, 'dates': len(order), 'first': order[-1], 'last': order[0],
                              'valid': round(float(np.isfinite(hh).mean()), 3), 'class_share': shares,
                              'note': 'newest valid pixel of every date; seams where orbit passes meet'}
        print('mosaic of', len(order), 'dates:', f'{np.isfinite(hh).mean():.0%} of the box', flush=True)
    manifest.update({'area': name, 'bbox': bbox, 'frequency': a.freq, 'stretch': STRETCH,
                     'composite': 'R=HH, G=HV, B=HH-HV (dB, gamma0 RTC)',
                     'classes': [{'value': v, 'key': k, 'rule': d} for v, k, d, _ in CLASSES],
                     'permanent_water': {'dates': len(good), 'min_obs': MIN_OBS, 'share': round(float(perm.mean()), 4),
                                         'reference': f'plus JRC Global Surface Water occurrence >= {REFERENCE_WATER}% (open water roughened by wind)' if ref is not None else None},
                     'built_up': {'median_hh_above_db': BUILT_HH, 'median_hh_minus_hv_above_db': BUILT_RATIO,
                                  'min_pixels': BUILT_MIN_PX, 'share': round(float(built.mean()), 4)},
                     'steady': 'per-pixel median of each orbit pass replaced by the median of all dates',
                     'source': f'NASA/ISRO NISAR L2 GCOV ({", ".join(SHORT_NAMES)}) via NASA Earthdata (ASF DAAC)'})
    json.dump(manifest, open(mpath, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)

if __name__ == '__main__':
    main()
