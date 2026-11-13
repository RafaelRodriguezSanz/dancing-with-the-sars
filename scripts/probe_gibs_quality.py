"""Measure which NISAR GCOV dates render cleanly in NASA GIBS over the area of interest.

Rule, per z10 tile covering the AOI bbox (what a browser would draw):
  empty   - (almost) no visible pixels: the satellite did not image there (normal).
  valid   - mostly opaque, <5% semi-transparent speckle, median channel spread (chroma) >= 25.
  corrupt - anything else with visible pixels: semi-transparent noise, or opaque grey/white/black.
Corrupt tiles are what GIBS returns where it has no data: random bytes, different on every request.
A date is "clean" when it has no corrupt and no missing tiles. The web app also hides corrupt tiles at
draw time with the same rule (site/js/domain/tileQuality.js): keep the two in sync.

Dev tool (needs numpy + Pillow). Writes site/data/gibs-quality.json. Re-run when new dates appear:
    python scripts/probe_gibs_quality.py
"""
import io, json, math, urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date
import numpy as np
from PIL import Image

LAYER = "NISAR_L2_Geocoded_Polarimetric_Covariance"
Z = 10
BBOX = (-56.75, -34.75, -56.05, -34.15)  # west, south, east, north
SCENES = "site/data/fallback-scenes.json"
OUT = "site/data/gibs-quality.json"
RULE = "z10 tiles over the AOI: valid = opaque, <5% semi-transparent, median chroma >= 25; empty = <2% visible; else corrupt"


def xy(lat, lon, z):
    n = 2 ** z
    return int((lon + 180) / 360 * n), int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)


def classify(rgba):
    alpha, rgb = rgba[..., 3], rgba[..., :3].astype(int)
    opaque = (alpha >= 250).mean()
    partial = ((alpha > 0) & (alpha < 250)).mean()
    if opaque < 0.02 and partial < 0.02:
        return "empty"
    mask = alpha >= 250
    chroma = np.median((rgb.max(2) - rgb.min(2))[mask]) if mask.any() else 0
    return "valid" if partial < 0.05 and chroma >= 25 else "corrupt"


def fetch_tile(args):
    d, x, y = args
    url = f"https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{LAYER}/default/{d}/GoogleMapsCompatible_Level13/{Z}/{y}/{x}.png"
    for _ in range(3):  # GIBS answers HTTP 500 now and then; retry before calling a tile missing
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return classify(np.array(Image.open(io.BytesIO(r.read())).convert("RGBA")))
        except Exception:
            continue
    return "missing"


def main():
    w, s, e, n = BBOX
    x0, y0 = xy(n, w, Z)
    x1, y1 = xy(s, e, Z)
    dates = sorted({sc["date"] for sc in json.load(open(SCENES))["scenes"]})
    out = {}
    with ThreadPoolExecutor(8) as pool:
        for d in dates:
            kinds = list(pool.map(fetch_tile, [(d, x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]))
            out[d] = {k: kinds.count(k) for k in ("valid", "corrupt", "empty", "missing")}
            print(d, out[d])
    json.dump({"layer": LAYER, "zoom": Z, "bbox": list(BBOX), "rule": RULE, "retrieved": date.today().isoformat(), "dates": out},
              open(OUT, "w"), indent=1)


if __name__ == "__main__":
    main()
