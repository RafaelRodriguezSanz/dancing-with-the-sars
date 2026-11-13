# H1 — NISAR map on GitHub Pages (spec)

Goal: a static page (no build, no server, no login) that shows NISAR radar imagery over Uruguay,
streamed tile by tile from the NASA source. Nothing is downloaded to anyone's PC beforehand.

## Data sources (browser-side, both CORS `*`, no auth)
- **Imagery:** NASA GIBS WMTS, layer `NISAR_L2_Geocoded_Polarimetric_Covariance`
  ("NISAR Normalized Radar Backscatter (False Color, GCOV)"), PNG, max native zoom 13.
  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/NISAR_L2_Geocoded_Polarimetric_Covariance/default/{date}/GoogleMapsCompatible_Level13/{z}/{y}/{x}.png`
  GIBS time coverage (from capabilities, 2026-11-13): 2025-10-29/2026-03-01, 2026-03-04/2026-03-29,
  2026-04-01/2026-04-12, 2026-04-14/2026-07-27, 2026-08-10/2026-11-11.
- **Scene dates:** NASA CMR `https://cmr.earthdata.nasa.gov/search/granules.json?short_name=<C>&bounding_box=-56.75,-34.75,-56.05,-34.15&page_size=200&sort_key=start_date`
  for C in `NISAR_L2_GCOV_PROVISIONAL_V1`, `NISAR_L2_GCOV_V1`. Granule title split on `_`: `[5]`=track, `[6]`=A|D.
- **Fallback:** `site/data/fallback-scenes.json` (same scene shape) if CMR fails.
- Caveat shown in UI: false-colour visualisation tiles, not calibrated backscatter values.

## Architecture (clean, ES modules, dependency rule points inward)
```
site/js/domain/          pure: Scene, AreaOfInterest, date helpers, GIBS coverage check
site/js/application/     use cases: listScenesForArea(repo, aoi), pickDefaultDate(...)
site/js/infrastructure/  CmrSceneRepository, FallbackSceneRepository, gibsTileUrl(layer,date)
site/js/presentation/    Leaflet map view, date selector (prev/next + list), opacity slider, status line
site/js/main.js          composition root (only place that wires concrete classes)
```
- Domain/application must not import Leaflet, `fetch` or DOM. Infrastructure receives `fetch` injected.
- Leaflet 1.9.4 from cdnjs (exact version). OSM basemap with attribution.
- Default view: Santa Lucía lower basin; AOI rectangle outlined. Dates without GIBS coverage are marked/disabled.
- Attribution: "Imagery: NASA GIBS — NISAR GCOV (NASA-ISRO)". No logos. Footer: AI disclosure line.
- Mobile-first (Rafa uses a phone). Tests: `node --test site/js/**/*.test.js` with fake repositories.
