"""Change alerts from the NISAR time series of an area (caches of nisar_subset.py: 80 m for a box, 200 m for a country).

Three kinds, each a patch of connected pixels with simple, explainable rules on gamma0 (dB):
  flood            clearly dark on this date (HH < -17, HV < -23 dB: darker than dry, smooth bare soil,
                   which sits near -16 dB HH and fooled a looser rule in the dry June 2026), HH at least
                   3 dB below the usual date of the same pass, not permanent water, within 1 km of it
  vegetation-loss  woody before (HV > -14 dB) and HV drops >= 4 dB, lasting: median of the next
                   dates vs the previous ones (clear-cut, fire, storm damage)
  crop-growth      low HV before (< -18 dB) and HV rises >= 4 dB, lasting (crops or pasture growing)
Comparisons remove each pass's own per-pixel median first, so the three viewing geometries
(passes) can be mixed. Dates flagged suspect in the manifest (calibration outliers) are skipped.
Alerts are candidates to check, not confirmed events. Flood candidates carry the rain of the 7 days
before (Open-Meteo ERA5, scripts/rainfall.py) as context.

A country is too big to stack every date in memory at 200 m: it is averaged to 400 m first
(ALERT_BLOCK; patch sizes and distances are scaled to the pixel size).

Output: site/data/nisar/<area>/alerts.json (GeoJSON, one polygon per alert = the patch outline, smoothed).
Usage: .venv/Scripts/python scripts/nisar_alerts.py [--area santa-lucia | --bbox w,s,e,n]
"""
import argparse
import json
import os
import sys
import warnings

import numpy as np
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from nisar_subset import AREAS, ROOT, WATER, nanmedian, permanent_water, reference_water, resolve_area, area_options  # noqa: E402
from outline import outline  # noqa: E402
from rainfall import rain_before, verdict  # noqa: E402

ALERT_BLOCK = 2  # countries (mosaic areas): average 2x2 pixels, 200 m -> 400 m, a quarter of the memory
WINDOW = 4  # dates before / after a candidate change
FLOOD_HH, FLOOD_HV, FLOOD_DROP = -17, -23, 3  # dB
NOISE_FLOOR = -40  # dB: far below NISAR's noise level (about -25 to -30 dB); lower values are invalid
RULES = {  # kind: (min patch in pixels, explanation)
    'flood': (25, 'Much darker than usual and as dark as open water, next to a river or lake. Very dry, smooth bare soil can look similar: check rainfall.'),
    'vegetation-loss': (8, 'Woody vegetation whose HV (volume scattering) dropped and stayed low: clear-cut, fire or storm damage.'),
    'crop-growth': (40, 'Low HV that rose and stayed high: crops or pasture growing.'),
}


def block_mean(a, k):
    """Average of k x k pixel blocks, ignoring NaN (edges that do not fill a block are dropped)."""
    ny, nx = a.shape[0] // k * k, a.shape[1] // k * k
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        return np.nanmean(a[:ny, :nx].reshape(ny // k, k, nx // k, k), axis=(1, 3)).astype(np.float32)


def patches(mask, kind, date, extra, lonlat, pixel_ha, limit=15):
    """Connected patches of `mask` bigger than the kind's minimum, biggest first, as GeoJSON features.
    The minimum is set in ~80 m pixels (0.64 ha) and scaled to the real pixel size."""
    min_px = max(2, round(RULES[kind][0] * 0.64 / pixel_ha))
    lab, n = ndimage.label(mask)
    if n == 0:
        return []
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    out = []
    boxes = ndimage.find_objects(lab)
    for i in np.argsort(-sizes)[:limit]:
        if sizes[i] < min_px:
            break
        sl = boxes[i]
        r0, c0 = sl[0].start - 1, sl[1].start - 1
        patch = np.pad(lab[sl] == i + 1, 1)  # only the patch's box: a full-grid mask per patch was slow on a country
        rows, cols = np.nonzero(patch)
        rows, cols = rows + r0, cols + c0
        ring = [list(lonlat(r0 + y, c0 + x)) for x, y in outline(patch)]  # clockwise on screen; reversed below (GeoJSON: counter-clockwise)
        props = {'kind': kind, 'date': date, 'area_ha': round(float(sizes[i]) * pixel_ha),
                 'why': RULES[kind][1], **{k: round(float(np.nanmean(v[rows, cols])), 1) for k, v in extra.items()}}
        out.append({'type': 'Feature', 'properties': props,
                    'geometry': {'type': 'Polygon', 'coordinates': [ring[::-1] + [ring[-1]]]}})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--area', default='santa-lucia', choices=AREAS)
    ap.add_argument('--bbox', help='any box instead of --area: w,s,e,n in degrees')
    a = ap.parse_args()
    slug, name, bbox = resolve_area(a.area, a.bbox)
    base = os.path.join(ROOT, 'site', 'data', 'nisar', slug)
    cachedir = os.path.join(ROOT, 'data', 'raw', 'nisar', slug)
    scenes = json.load(open(os.path.join(base, 'manifest.json'), encoding='utf-8'))['scenes']
    dates = [d for d in sorted(scenes) if not scenes[d].get('suspect')]
    load = lambda d: np.load(os.path.join(cachedir, f'{d}.npz'))  # noqa: E731
    block = ALERT_BLOCK if area_options(slug, bbox).get('mosaic') else 1
    def grid(a):
        a = a.astype(np.float32)
        a[a < NOISE_FLOOR] = np.nan  # swath-edge fill, not a measurement (a -73 dB 'before' made a fake crop-growth)
        return block_mean(a, block) if block > 1 else a
    HH = np.stack([grid(load(d)['hh']) for d in dates])
    HV = np.stack([grid(load(d)['hv']) for d in dates])
    passes = np.array([scenes[d]['pass'] for d in dates])
    ny, nx = HH.shape[1:]
    w, s, e, n = bbox
    px_m = ((e - w) / nx * 111320 * np.cos(np.radians((s + n) / 2)), (n - s) / ny * 110570)
    pixel_ha = px_m[0] * px_m[1] / 1e4
    print(f'{len(dates)} dates, grid {nx} x {ny}, pixel ~{px_m[0]:.0f} x {px_m[1]:.0f} m', flush=True)
    lonlat = lambda r, c: (round(float(w + c / nx * (e - w)), 5), round(float(n - r / ny * (n - s)), 5))  # noqa: E731
    warnings.simplefilter('ignore')  # all-NaN medians outside the swaths

    perm = permanent_water(list(HH), list(HV))
    ref = reference_water(bbox, perm.shape)  # wind-roughened sea and estuary: not a flood candidate when calm
    if ref is not None:
        perm |= ref
    near_perm = ndimage.binary_dilation(perm, iterations=max(2, round(1000 / px_m[0])))  # ~1 km
    usual_hh, usual_hv = np.empty_like(HH), np.empty_like(HV)
    anom = np.empty_like(HV)  # HV minus the per-pixel median of its own pass
    for p in set(passes):
        k = passes == p
        usual_hh[k], usual_hv[k] = nanmedian(HH[k], 0), nanmedian(HV[k], 0)
        anom[k] = HV[k] - usual_hv[k]

    features = []
    for t, d in enumerate(dates):  # floods: one date against the usual state of its own pass
        flood = ((HH[t] < FLOOD_HH) & (HV[t] < FLOOD_HV) & (usual_hh[t] - HH[t] >= FLOOD_DROP)
                 & ~perm & ~WATER(usual_hh[t], usual_hv[t]) & near_perm)
        flood = ndimage.binary_opening(flood)  # drop isolated speckle
        features += patches(flood, 'flood', d, {'hh_db': HH[t], 'usual_hh_db': usual_hh[t]}, lonlat, pixel_ha)
    for f in features:  # rain context: dark radar after a dry week is more likely bare soil
        ring = f['geometry']['coordinates'][0]
        lon, lat = (sum(c[i] for c in ring) / len(ring) for i in (0, 1))
        mm = rain_before(lat, lon, f['properties']['date'], dates[0], dates[-1])
        if mm is not None:
            f['properties'].update(rain_7d_mm=mm, rain=verdict(mm))

    best = {k: np.zeros((ny, nx), np.float32) for k in ('loss', 'gain')}  # strongest lasting change per pixel
    when = {k: np.full((ny, nx), -1, int) for k in best}
    before_hv, after_hv = {k: np.full((ny, nx), np.nan, np.float32) for k in best}, {k: np.full((ny, nx), np.nan, np.float32) for k in best}
    for t in range(WINDOW, len(dates) - WINDOW + 1):
        delta = nanmedian(anom[t:t + WINDOW], 0) - nanmedian(anom[t - WINDOW:t], 0)
        hv0, hv1 = nanmedian(HV[t - WINDOW:t], 0), nanmedian(HV[t:t + WINDOW], 0)
        for k, change, ok in (('loss', -delta, hv0 > -14), ('gain', delta, hv0 < -18)):
            better = ok & (change > best[k])
            best[k][better], when[k][better] = change[better], t
            before_hv[k][better], after_hv[k][better] = hv0[better], hv1[better]
    for k, kind in (('loss', 'vegetation-loss'), ('gain', 'crop-growth')):
        for t, d in enumerate(dates):
            mask = ndimage.binary_opening((best[k] >= 4) & (when[k] == t))
            features += patches(mask, kind, d, {'hv_before_db': before_hv[k], 'hv_after_db': after_hv[k]}, lonlat, pixel_ha)

    counts = {kind: sum(f['properties']['kind'] == kind for f in features) for kind in RULES}
    json.dump({'type': 'FeatureCollection', 'area': name, 'dates': dates, 'counts': counts,
               'note': 'Candidates from simple rules on NISAR GCOV backscatter, not confirmed events.',
               'features': features}, open(os.path.join(base, 'alerts.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print(counts)
    for f in sorted(features, key=lambda f: -f['properties']['area_ha'])[:12]:
        p = f['properties']; c = f['geometry']['coordinates'][0]
        print(p['kind'], p['date'], p['area_ha'], 'ha', c[0], c[2], {k: v for k, v in p.items() if k.endswith('db')})


if __name__ == '__main__':
    main()
