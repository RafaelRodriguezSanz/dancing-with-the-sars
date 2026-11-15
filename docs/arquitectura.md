# Architecture — Dancing with the SARs (NISAR flood monitor)

Status: v1, 2026-11-13 13:30 UTC-3. Owner: architect agent. Changes go through a PR and a line in `decisiones.md`.

## 0. Hard constraints (drive every choice below)
- Raw NISAR data is reachable **only from Rafa's PC**, which is available **until 18:00 today**. After that we may have only a phone + Claude cloud (no data servers).
- So **today must produce an analysis-ready stack in the repo**. All weekend work (classification tuning, stats, forecast, UI, slides, video) runs on committed files.
- No GitHub Actions. Pages = branch `master`, root; app in `site/`. CI is local (`scripts/ci.sh` + git hooks).

## 1. Working methodology
- **Gitflow-lite:** `master` = what Pages serves (always demo-ready); `develop` = integration; `feature/<area>-<slug>` off `develop`. Small PRs (<400 changed lines, one concern), squash-merge into `develop`. Release = merge `develop` -> `master` at checkpoints (Sat 20:00, Sun 18:00, final Sun 20:00).
- **Review:** an agent never merges its own PR without a second pass (reviewer agent or `code-review` skill). Data PRs (binary layers) are reviewed via the contract tests, not by eye.
- **Local CI gate:** `git config core.hooksPath .githooks` (run once per clone, including each cloud session). `pre-commit` = fast guards; `pre-push` = full `scripts/ci.sh`. Never `--no-verify`.
- **State lives in the repo:** `docs/ESTADO.md` (current phase, done/next/blocked, owner per task, last-updated); `docs/decisiones.md` (append-only log); this file (design). Every agent reads `ESTADO.md` first and updates it in the same PR that finishes its task. Hand-off = merged PR + `ESTADO.md` "Next" entry naming the next owner and inputs.
- **Secrets:** Earthdata credentials only in `%USERPROFILE%\.netrc` on Rafa's PC. Never in repo, chat, logs or env dumps. CI greps for leaks.

## 2. Stack (pinned)
Python 3.12 venv from miniconda (`python -m venv .venv`, no global installs). Two requirement files:

| File | Where | Packages (exact) | Why |
|---|---|---|---|
| `requirements.txt` | everywhere (PC, cloud, CI) | numpy==2.5.4, scipy==1.18.1, pillow==13.0.0, jsonschema==4.26.0, pytest==9.2.0, ruff==0.17.5 | Pure-wheel, Windows/Linux safe. Otsu + damped-trend forecast implemented in numpy (~40 lines) instead of scikit-image/statsmodels. |
| `requirements-pipeline.txt` | Rafa's PC only | h5py==3.16.0, fsspec==2026.9.0, aiohttp==3.14.5, earthaccess==0.19.0, rasterio==1.5.2 | h5py reads HDF5 from an fsspec file object (HTTP range reads, page buffer); earthaccess handles URS login/redirects + CMR search; rasterio (bundled GDAL) for warping to the common grid and reading DSWx/watermask COGs. Win-amd64 cp312 wheels verified on PyPI. |

If a pin fails on Windows: drop to the previous minor, log it in `decisiones.md`.

Front end (static, no build, CDN with exact versions, URLs verified 200):
- Leaflet 1.9.4 — `https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.{js,css}` (map, `L.imageOverlay` per date, OSM basemap with attribution).
- Chart.js 4.4.1 — `https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js` (time series; category x-axis, so no date adapter).
- Before/after: own ~40-line CSS `clip-path` swipe over two overlays (no plugin). Plain ES modules, no framework.
- Video (optional, local): Playwright + ffmpeg on whatever machine has them; not in CI.

## 3. Data pipeline (Rafa's PC, today)
**AOI (proposed, confirm in ESTADO):** primary = lower Santa Lucía river, Uruguay, **NISAR track 082 descending only** (21 dates, one viewing geometry -> comparable backscatter). Stretch = Porto Alegre/Guaíba, one track. Mixing tracks shifts incidence angle and the water threshold; don't.

**Common grid:** EPSG:4326, ~30 m (0.00027°), AOI ~25x25 km -> ~900x900 px. Everything (NISAR, watermask, DSWx, DEM) is warped onto it. Area per pixel = f(lat) computed in code.

| # | Step | Tool | Size | Time (laptop) |
|---|---|---|---|---|
| P0 | Search: CMR `NISAR_L2_GCOV_V1`, bbox+dates, filter `TRACK_NUMBER=82`, `DESCENDING`; write `data/manifest_granules.json` (GranuleUR, URL, md5, date) | earthaccess | KB | <1 min |
| P1 | **Spike (go/no-go):** open 1 granule via `earthaccess` fsspec HTTPS session, `h5py.File(fobj, page_buf_size=<k*page>)`; print chunk shape, fs page size, compression; time AOI read of `frequencyA/HHHH`,`HVHV`,`mask` | h5py+fsspec | ~40-80 MB fetched | 1-3 min |
| P2 | Subset: compute UTM row/col window from `xCoordinates/yCoordinates` + AOI (+1 chunk margin, chunk-aligned); read HHHH, HVHV (float32, gamma0 linear power, 10 m), `mask` (uint8) | same | ~50-80 MB/scene transferred (2500² px x 2 terms, compressed chunks) | ~0.5-2 min/scene -> **~15-40 min for 21** |
| P3 | Calibrate: GCOV is already RTC gamma0 (linear power). Invalid where mask says no data/layover. 3x3 block mean in linear power (10->30 m; also the speckle filter, ~9+ looks extra), then 5x5 median on dB only for classification. dB = 10·log10 | numpy/scipy | 8 MB/scene in RAM | <5 s |
| P4 | Warp to common grid (bilinear), write `data/work/<date>.npz` (gitignored, float32) | rasterio | ~6 MB/scene | <5 s |
| P5 | **Export stack (the key artefact):** per date `site/data/stack/<date>_hh.png`, `_hv.png` = 8-bit quantized dB (`v = round((dB+30)/35*254)+1`, 0 = nodata; 0.14 dB step), lossless PNG | pillow | ~0.35-0.5 MB each -> **~15-20 MB total** | <2 s |
| P6 | References on same grid: `NISAR_WATERMASK` tile -> `ref/permanent_water.png`; Copernicus GLO-30 DEM -> `ref/hand_proxy.png` (height above local min, uint8 m) | rasterio | <0.5 MB | ~2 min |
| P7 | OPERA DSWx-S1 (30 m COG, B01_WTR) for AOI since **Aug 2024** (verified CMR: 600+ granules over AOI 2024-25): per date water/not/nodata fractions -> `site/data/dswx_series.json`; plus `dswx/<date>.png` (1-bit) only for dates within ±3 days of a NISAR date | rasterio | series KB; ~20 KB/mask | ~20-40 min (many small COG reads; parallel 8) |
| P8 | Browse PNGs for each NISAR date (public, no auth) cached in `data/work/browse/` for slides only | requests | ~3 MB each, not committed | ~2 min |

Weekend steps (any machine, from committed stack): **A1** classify -> `water/<date>.png` + `timeseries.json`; **A2** baseline/anomaly/alert -> `alerts.json`; **A3** forecast -> `forecast.json`.

**Water classification (A1):** per scene, histogram of HH dB over valid pixels; threshold = Otsu, **clamped to [-22, -14] dB** and sanity-checked against samples inside/outside `permanent_water` (if Otsu fails bimodality — between-class variance ratio < 0.5 — use the permanent-water-trained threshold: midpoint of water p95 and land p5). water = HH < t_HH AND HV < t_HV (t_HV same procedure, clamp [-28, -20]) AND hand_proxy < 15 m; 3x3 majority filter; drop blobs < 5 px. **New water** = water AND NOT permanent_water. Flooded vegetation (L-band HH double-bounce brightening) = optional layer, flagged experimental. Validation: IoU/F1 vs DSWx-S1 on near-coincident dates, reported in Methods.

**Range-read feasibility — what was checked:** GCOV Product Spec (JPL D-102274 Rev F, Jul 2026, §3.8) states products are **cloud-optimized HDF5: chunked (~512x512), compressed, paged file-space strategy with page > chunk**; ASF docs show streaming GCOV via `earthaccess`/fsspec + h5netcdf and GDAL `/vsicurl/`. Granule size 5.0 GB (CMR). HTTPS URL answers 303 -> URS login (needs EDL credentials); browse PNGs are public. **Not verified (no credentials on this PC yet):** actual page size, authenticated range-read throughput from Uruguay, and that our AOI does not straddle granule edges. That is what P1 tests.

**Fallbacks (in order, decide at P1 by 14:15):**
1. `frequencyB` (5 MHz, **80 m**) instead of A — ~64x fewer bytes; still NISAR L-band HH/HV. Keep grid at 80 m.
2. **Harmony/Earthdata variable subsetting** (server-side extract + spatial subset of GCOV to COG; documented by ASF) — async jobs, small outputs.
3. Full download: 5 GB/scene ≈ 14 min at 50 Mbit/s -> at most ~6-8 scenes before 18:00 (download in background, process while next downloads, delete after P5).
4. Browse PNGs only (qualitative, uncalibrated) + DSWx-S1 as the quantitative series — last resort, must be stated as a limit.

## 4. Baseline, anomaly, alert, forecast (A2/A3)
Honesty rule: 21 NISAR dates over Jun–Nov 2026 are **not** a seasonal baseline; we say so in the UI and slides.
- **Series:** `x_t` = % of AOI (land part, excluding permanent water) classified as new water, per NISAR date. Parallel series `d_t` from DSWx-S1 (C-band, 2024->now, ~12-day).
- **Short-record anomaly (NISAR only):** robust z vs expanding past window (min 5 dates): `z_t = (x_t − median(x_<t)) / (1.4826·MAD(x_<t) + 0.1)` (0.1 pp floor avoids /0 in dry spells).
- **Climatological context (DSWx):** per calendar month, p50/p90 of `d_t` over 2024–2026; place each NISAR date as percentile of its month. Cross-sensor bias: linear fit `x ~ d` on near-coincident pairs; report it, do not hide it.
- **Pixel anomaly map:** water frequency per pixel over all prior dates; anomalous = water now AND frequency < 0.2. Exported as one PNG per date (or folded into `water/<date>.png` palette: 0 nodata, 1 land, 2 permanent water, 3 seasonal water, 4 anomalous water).
- **Alert levels:** `watch` if z ≥ 2 or month-percentile ≥ 90; `warning` if z ≥ 3 and anomalous area ≥ 1 km²; else `normal`. Thresholds are constants in one file, shown in Methods.
- **Forecast (next 1–2 acquisitions, ≤24 days):** candidates = persistence, damped trend (`x̂_{t+h} = x_t + Σ_{i=1..h} φ^i·b_t`, b = last-step slope smoothed, φ = 0.5), climatology (DSWx month p50). Choose by **rolling-origin backtest MAE on the DSWx series** (~50+ origins), then apply to NISAR. Prediction interval = empirical 10–90% quantiles of backtest errors at that horizon, clipped to [0, 100]. Report skill vs persistence; if no model beats persistence, ship persistence and say so.

## 5. What runs where
| Where | When | Does | Must NOT need |
|---|---|---|---|
| **Rafa's PC** | **today until 18:00** | P0–P8, commit stack + refs + DSWx series + manifests via PR to `develop`; also a first A1 run to prove the stack is enough | — |
| Claude cloud | any time | A1–A3 (numpy/scipy on committed PNGs), front end, tests, docs, slides (HTML -> PDF), ESTADO | ASF/Earthdata/PC/AWS |
| Phone | weekend | review/merge PRs, release merge to `master`, submit | anything else |
| GitHub Pages | always | serves `master`: `site/` app, `site/slides.pdf` | Actions |

**Definition of "today done" (checked before 18:00):** `site/data/stack/` has all dates for the primary AOI, `ref/`, `dswx_series.json`, `manifest.json` validate against schemas; `ci.sh` green; pushed to `develop`. If short on time: fewer dates beats no dates; 80 m beats nothing.

## 6. Repo layout & owners
```
pipeline/        fetch_*.py, subset.py, export_stack.py      data-engineer (PC only)
analysis/        classify.py, stats.py, forecast.py          analyst (cloud OK)
schemas/         *.schema.json (data contract)              architect
site/            index.html, app.js, style.css               frontend
site/data/       generated outputs below (committed)         data-engineer + analyst
site/slides.pdf  ≤7 slides                                   storyteller
docs/            ESTADO.md, decisiones.md, arquitectura.md   all (ESTADO), architect
scripts/         ci.sh, check_sizes.py, make_video.*         qa
tests/           pytest: unit (synthetic arrays) + contract  qa / owner of code
.githooks/       pre-commit, pre-push                        qa
data/work/       raw subsets, npz, browse (gitignored)       PC only
```

**Data contract** (`site/data/`, all paths relative; JSON UTF-8; dates `YYYY-MM-DD`):
- `manifest.json`: `{aoi:{name, bbox:[W,S,E,N], crs:"EPSG:4326", width, height, pixel_deg}, sensor:{collection, track, direction, frequency:"A"|"B", spacing_m}, dates:[{date, granule, md5, layers:{hh, hv, water?, dswx?}}], quantization:{min_db:-30, max_db:5, nodata:0}, generated, pipeline_version}`
- `stack/<date>_{hh,hv}.png`: 8-bit gray, grid = manifest; `ref/permanent_water.png` (0/1), `ref/hand_proxy.png` (uint8 m).
- `water/<date>.png`: 8-bit paletted, classes 0–4 as in §4 (transparent 0).
- `timeseries.json`: `{unit:"percent_aoi", series:[{date, water_pct, new_water_pct, anomalous_km2, t_hh_db, t_hv_db, valid_pct}]}`
- `dswx_series.json`: `{source:"OPERA_L3_DSWX-S1_V1", series:[{date, water_pct, valid_pct}], monthly:[{month, p50, p90, n}]}`
- `alerts.json`: `{rules:{...}, items:[{date, z, month_pct, level:"normal"|"watch"|"warning", reason}]}`
- `forecast.json`: `{model, backtest:{mae, mae_persistence, n}, items:[{date, h, mean, lo, hi}]}`
- `validation.json`: `{pairs:[{nisar_date, dswx_date, iou, f1}]}`
Limits: each file < 5 MB, `site/data` total < 50 MB. Changing a schema = PR touching `schemas/` + producer + consumer together.

**Local CI** (`scripts/ci.sh`, bash; runs in Git Bash and Linux cloud; no network):
1. `ruff check .` and `ruff format --check .`
2. `pytest -q` — unit tests (Otsu, quantize round-trip, robust z, forecast backtest on synthetic series) + contract tests (every JSON validates; every PNG referenced exists and matches manifest width/height; dates sorted/unique).
3. `python scripts/check_sizes.py` — per-file 5 MB, total 50 MB.
4. Secret scan: fail on `.netrc`, `password`, `EARTHDATA_`, `Authorization:` in tracked files.
5. Site check: every local `src/href` in `site/*.html|js` resolves; CDN URLs carry an exact version.
`pre-commit` = steps 3+4 (fast). `pre-push` = all.

## 7. Top risks
| Risk | Mitigation |
|---|---|
| Range reads slow/fail (auth redirect with fsspec on Windows, tiny page buffer) | P1 spike by 14:15 with timing; fallbacks 1->4 in §3; run fetch in background, process as it lands |
| Earthdata login/EULA not ready (no `.netrc` on PC as of 13:10) | Rafa creates `.netrc` + authorizes ASF app **first**; test with one 1 KB range request before anything else |
| PC unavailable after 18:00 -> missing data | "Today done" checklist; commit incrementally (every ~5 dates); stack format lets weekend re-run everything |
| No real flood in Jun–Nov 2026 window -> "nothing to see" | Story = monitor + baseline + honest "normal" alerts; show river/lake seasonal dynamics and DSWx 2024–26 context; stretch AOI Porto Alegre |
| Threshold drift (wind-roughened water, incidence, wet soil) | single track; clamped per-scene Otsu; HV+HH both; HAND filter; DSWx IoU reported |
| Repo/Pages size bloat | 8-bit PNG stack at 30 m (or 80 m), size guard in hooks, nothing raw committed |
