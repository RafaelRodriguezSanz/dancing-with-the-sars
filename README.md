# Dancing with the SARs

Radar-based surface-change monitor for Uruguay, built for the **NASA Space Apps Challenge 2026**.

Made by **Rafael Rodriguez Sanz**, Montevideo, Uruguay.

> Hackathon entry, November 14-15, 2026. Unofficial: not affiliated with or endorsed by NASA, ISRO or any space agency.

**Live demo:** https://rafaelrodriguezsanz.github.io/dancing-with-the-sars/ (GitHub Pages, no login).

## The challenge

**[Dancing with the SARs](https://www.spaceappschallenge.org/2026/challenges/dancing-with-the-sars/?tab=details)**: build an interactive application that uses radar data from the NASA-ISRO Synthetic Aperture Radar (NISAR) mission to track and visualize surface change anywhere in the world. Full text and resources: [`docs/challenge.md`](docs/challenge.md).

## What it is

An interactive globe that turns real **NISAR** L-band radar data (HH and HV backscatter, GCOV product, from NASA Earthdata / ASF DAAC) into things a person can read:

- a **land-cover map** (water, woody vegetation, open land, built-up);
- **change alerts**: flood, vegetation loss and crop growth candidates;
- **built-up areas** next to OpenStreetMap towns;
- an **El Niño flood response** tool: which ground a river rise would cover, which public buildings stay dry as refuges, and a road route that avoids flooded streets.

Radar sees through clouds and at night, which matters most during the long rainy spells El Niño brings to Uruguay, when optical satellites see only clouds. The rules that turn backscatter into classes and alerts are simple and explainable on purpose (thresholds in dB, no black-box model), so each result comes with a plain reason.

## Using the app

- **Start.** The site opens on Uruguay with the precomputed "latest mosaic" (newest valid pixel of 35 passes, ~200 m).
- **Layers** (right panel). NISAR colour composite (R=HH, G=HV, B=HH-HV), land-cover classes (80 m, ~16 m tiles where built), change alerts, built-up areas, and NASA GIBS NISAR imagery for comparison.
- **Dates.** Step through acquisition dates, or press **Evolution of this view** to play them and chart class shares and mean backscatter over time.
- **Alerts.** Click a candidate to see its date, size, the rule that fired and, for floods, the rain of the previous 7 days.
- **Area & display.** Draw an area or use the current view, then **Analyze area** (needs the local server, see below). Progress bar and cancel included.
- **How good is it?** Agreement of the map with independent references, where computed.
- **El Niño flood response.** Zoom in to a riverside town and press **Analyze flood risk in this view**. Move the **River rise** slider (0-10 m) to see the flooded ground (blue), the safety margin (yellow) and the public buildings coloured by status: green stays dry, yellow is close to the water, red is flooded. Press **Plan evacuation from a point** and click where people need to leave from: the green line is the road route to the nearest dry refuge; a red dashed line shows the usual shortest way when it crosses flooded road. The panel also shows the 7-day rain forecast for the spot.
- **About.** Credits and this README.

### How the flood response works

Everything runs in the browser, from open data, with no server:

1. **Terrain** from NASA SRTM (~30 m) through the Terrain Tiles open dataset on AWS.
2. **Water seeds**: rivers, streams and lakes from OpenStreetMap, the sea, and the water NISAR sees on the selected date.
3. **Height above the nearest water** for every cell: a flood-fill spreads the water level from the seeds over the terrain (a simple HAND model). A river rise of *R* metres floods every cell less than *R* metres above its nearest water.
4. **Refuges**: schools, hospitals, clubs, community centres, town halls and other public buildings from OpenStreetMap. Safe means at least 2 m above the scenario water level.
5. **Routes**: the road network from OpenStreetMap; Dijkstra's shortest path where flooded road costs 50 times its length, so a start that is already under water still gets the shortest way out.

It is a **planning aid, not an official evacuation plan**. It ignores levees, drains, river flow and one-way streets, and OpenStreetMap buildings are not confirmed shelters. In an emergency follow [SINAE](https://www.gub.uy/sistema-nacional-emergencias/) and the departmental Cecoed.

## How the radar products are made

1. **Find** NISAR GCOV granules over the box through NASA CMR (`scripts/nisar_access.py`).
2. **Cut** the box out of each remote HDF5 granule with HTTP range reads: only the chunks covering the area are downloaded, not the ~2 GB file (`scripts/nisar_subset.py`). dB values are cached in `data/raw/` (gitignored).
3. **Classify** each pixel with rules on gamma0 in dB: water, woody (high HV), double bounce (built-up or flooded vegetation), herbaceous (the rest). Permanent water and built-up come from per-pixel medians over the time series. For the whole country, a mosaic keeps the newest valid pixel of many passes.
4. **Alert** on changes between dates (`scripts/nisar_alerts.py`). Each pass is first normalised by its own per-pixel median, so different viewing geometries can be mixed.
   - *Flood*: HH < -17 dB and HV < -23 dB, at least 3 dB darker than usual, near permanent water.
   - *Vegetation loss*: HV > -14 dB before and a lasting drop of 4 dB or more.
   - *Crop growth*: HV < -18 dB before and a lasting rise of 4 dB or more.
5. **Add context.** Flood candidates carry the 7-day rainfall before the date from Open-Meteo (ERA5) (`scripts/rainfall.py`): above 20 mm flooding is plausible, below 5 mm it is more likely dry, smooth soil.
6. **Validate** against independent maps (`scripts/validate.py`).
7. **Serve.** A static MapLibre GL site (plain ES modules, no build step) reads the products. `scripts/serve.py` adds a small localhost API that runs steps 1-6 for a drawn area.

## Validation

`scripts/validate.py` compares our map (most frequent class per pixel over 30 dates) with ESA WorldCover 2021 in four groups, and our permanent water with JRC Global Surface Water (water at least 50% of the time). Test box west of Montevideo (-56.75, -34.75 to -56.05, -34.15), 823,491 pixels at ~80 m:

| Group | Recall | Precision |
|---|---|---|
| Water | 0.71 | 0.78 |
| Woody | 0.58 | 0.74 |
| Open land (grass, crops, bare) | 0.97 | 0.93 |
| Built-up | 0.30 | 0.41 |

Overall agreement 90%, kappa 0.63. Permanent water vs JRC: IoU 0.63 (recall 0.76, precision 0.79).

WorldCover is from 2021 and has its own errors (about 75% overall accuracy); our maps are from 2026, so some disagreement is real change. This measures agreement with another map, not accuracy against ground truth. The alerts are **not** validated against observed events.

## Data sources

| Source | Use | Licence / terms |
|---|---|---|
| **NISAR L2 GCOV** (NASA-ISRO), via [NASA Earthdata](https://search.earthdata.nasa.gov/) / [ASF DAAC](https://asf.alaska.edu/) and [CMR](https://cmr.earthdata.nasa.gov/search) | Core data: HH/HV backscatter. Some granules are provisional. Earthdata Login required. | NASA open data policy |
| [NASA GIBS](https://earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs) | NISAR browse tiles for comparison, Blue Marble | NASA open data |
| NASA SRTM via [Terrain Tiles on AWS](https://registry.opendata.aws/terrain-tiles/) | Terrain for the flood scenario | Public domain (SRTM); see the dataset attribution |
| [ESA WorldCover 2021 v200](https://esa-worldcover.org/) | Validation of land cover | CC BY 4.0 |
| [JRC Global Surface Water](https://global-surface-water.appspot.com/) | Validation of permanent water | Copernicus free and open; Pekel et al. 2016, Nature |
| [Open-Meteo](https://open-meteo.com/) (ERA5 archive and forecast API) | Past rain for flood alerts, 7-day rain forecast | CC BY 4.0; ERA5 under the Copernicus licence |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) (tiles; Overpass API) | Basemap, towns, roads, rivers, public buildings | ODbL, © OpenStreetMap contributors |
| [MapLibre GL JS](https://maplibre.org/) 5.12.0, [marked](https://marked.js.org/) 12 | Map rendering, README viewer | BSD-3-Clause, MIT |

## Run locally

Requires Python 3.12 and `make` (Node only for the tests).

1. Create a free account at https://urs.earthdata.nasa.gov, open "Generate Token" and copy the token (valid 60 days).
2. Copy `.env.example` to `.env` and set `EARTHDATA_TOKEN`. `.env` is gitignored: never commit it. Optional: `NISAR_CACHE_DAYS` (drawn areas unused for that many days are deleted, default 7) and `NISAR_WORKERS` (parallel downloads, default 4; lower it on machines with little RAM).
3. Run `make`. It creates `.venv`, installs `requirements.txt`, checks `.env` and starts `scripts/serve.py`. Open http://127.0.0.1:8000/site/
4. Draw an area and press **Analyze area**. Products go to `site/data/nisar/<area>/`; drawn areas (`aoi_*`) are gitignored.

Other targets: `make install`, `make test` (unit tests with `node --test`), `make PORT=9000`.

Command line:

```
.venv/Scripts/python scripts/nisar_subset.py --bbox w,s,e,n --limit 12
.venv/Scripts/python scripts/nisar_alerts.py --bbox w,s,e,n
.venv/Scripts/python scripts/validate.py --bbox w,s,e,n
```

`scripts/nisar_tiles.py` builds the ~16 m tiles for chosen dates. On Linux/macOS use `.venv/bin/python`.

## Code layout

- `site/js/domain`: pure rules (scenes, areas, land cover, flood height, routing). No browser or network code.
- `site/js/application`: use cases (scene lists, evolution series, validation summary).
- `site/js/infrastructure`: NASA CMR, Overpass, terrain tiles, Open-Meteo, the local processing API.
- `site/js/presentation`: map, panels and controls. `site/js/main.js` wires everything.
- `scripts/`: Python pipeline and local server.

## Known limitations

- Alerts are **candidates** from simple rules, not confirmed events. Very dry, smooth bare soil can look like water to radar.
- The flood scenario is a bathtub model on 30 m terrain: no river flow, levees or drains. Use it to see where to look first, not as a forecast.
- ERA5 rain is modelled at ~25 km, not gauge data; it is context only.
- NISAR data in use is partly provisional and may change.
- The country mosaic mixes passes from different dates and geometries, so seams between strips are visible. Uruguay-wide alerts are not precomputed.
- **Built-up is weak** (recall 0.30, precision 0.41): towns full of trees look like woody vegetation at 80 m. OpenStreetMap towns are shown alongside for that reason.
- Analyzing a new area needs a personal Earthdata token and the local server; the public site only shows precomputed areas.

## Use of AI

The code, tests and documentation were written with the help of Claude (Anthropic, via Claude Code) under the author's direction. The author chose the idea, the challenge and the approach, and reviewed the results. AI-assisted commits carry `Co-Authored-By` trailers. No NASA logos or branding are used or implied.

## Author

Rafael Rodriguez Sanz, Montevideo, Uruguay. Solo entry for the NASA Space Apps Challenge 2026.
