# Submission text: Dancing with the SARs

Text for the NASA Space Apps Challenge 2026 project page (challenge: Dancing with the SARs).

## Short title

Dancing with the SARs: land change from NISAR radar

## Summary (about 100 words)

Dancing with the SARs is an interactive web map that turns real NISAR L-band radar data into readable land cover, change alerts and built-up areas. It opens on a country-wide Uruguay mosaic, lets you step through dates, and flags candidate floods, vegetation loss and crop growth with a plain-language reason. A flood candidate also shows the rain of the previous week, to tell floods from dry, smooth soil. For El Niño floods, it shows which ground a river rise would cover, which public buildings stay dry as refuges and a road route that avoids flooded streets. Run it locally and you can draw any area and analyze it from NASA Earthdata. Results are validated against ESA WorldCover and JRC water maps, with honest limits stated.

## Description

**What it does.** The app shows what NISAR radar sees on the ground. Layers: a colour composite of HH and HV backscatter, land-cover classes (water, woody vegetation, grass and crops, built-up), change alerts, and built-up areas next to OpenStreetMap towns. A start screen with a radar-scan animation loads a precomputed Uruguay mosaic (newest valid pixel of many passes, 200 m). Users can play dates as a time series and see class shares over time. With the local server, the "Analyze area" button processes any drawn area (up to 2 degrees a side) with a progress bar and cancel.

**Benefits.** Radar works through clouds and at night, so change can be tracked when optical images are blocked. The rules are simple thresholds in dB, so every class and alert can be explained to teachers, resource managers or the public. Flood candidates carry 7-day ERA5 rainfall as context. A disk cache keeps repeat analyses fast.

**How it works.** The CMR catalogue is searched for NISAR L2 GCOV granules. Only the HDF5 chunks covering the area are downloaded with HTTP range reads, not the whole ~2 GB file. Each pixel is classified from gamma0 in dB. Alerts compare dates after removing each pass's own median, so different viewing geometries can be mixed. Permanent water and built-up come from medians over the whole series. Products are small web images and GeoJSON read by a static MapLibre GL site on GitHub Pages.

**Validation.** In a test box west of Montevideo (823,491 pixels, 30 dates) agreement with ESA WorldCover 2021 is 90% (kappa 0.63). Water recall 0.71 and precision 0.78; woody 0.58 and 0.74; open land 0.97 and 0.93; built-up 0.30 and 0.41. Permanent water against JRC Global Surface Water: IoU 0.63.

**Tools and languages.** Python (numpy, scipy, h5py, fsspec, pyproj, Pillow) for processing and a small local server; JavaScript (ES modules, no build) with MapLibre GL JS for the site; HTML/CSS; GitHub Pages for hosting.

**Creativity.** Radar processing is presented as a scan you watch rather than a file you download. Explainable rules, a rainfall check for floods and an honest validation table aim at trust, not only a pretty map.

**Considerations and limits.** Alerts are candidates, not confirmed events, and are not validated against observed events. ERA5 rainfall is modelled at about 25 km. Some NISAR data is provisional. The country mosaic shows seams between passes. Built-up detection is weak at 80 m (towns with trees look like woody vegetation), so OpenStreetMap towns are shown alongside. Validation reference maps are from 2021 and have their own errors, so this is agreement, not accuracy. Analyzing a new area needs a free Earthdata token and the local server; the public site shows precomputed areas.

## NASA data used

- NISAR L2 GCOV (NISAR_L2_GCOV_V1 and the provisional version), HH and HV backscatter, from NASA Earthdata / ASF DAAC, found through NASA CMR. Core data of the project.
- NASA GIBS tiles of NISAR, shown for comparison.

## Space agency and partner data used

- ISRO: co-developer of NISAR (the NISAR data above is a NASA-ISRO product).
- ESA WorldCover 2021 v200 (validation).
- JRC Global Surface Water occurrence 1984-2021 (validation).
- Open-Meteo historical API, ERA5 reanalysis from Copernicus/ECMWF (rainfall context).
- OpenStreetMap contributors: basemap tiles and town outlines via the Overpass API (ODbL).

## References

- Challenge: https://www.spaceappschallenge.org/2026/challenges/dancing-with-the-sars/
- NASA Earthdata: https://search.earthdata.nasa.gov/ and ASF DAAC: https://asf.alaska.edu/
- NASA CMR: https://cmr.earthdata.nasa.gov/search
- NASA GIBS: https://earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs
- ESA WorldCover: https://esa-worldcover.org/
- JRC Global Surface Water: https://global-surface-water.appspot.com/ ; Pekel et al. 2016, "High-resolution mapping of global surface water and its long-term changes", Nature 540
- Open-Meteo: https://open-meteo.com/en/docs/historical-weather-api ; ERA5: Hersbach et al. 2020, QJRMS
- OpenStreetMap: https://www.openstreetmap.org/copyright
- MapLibre GL JS: https://maplibre.org/
- Python libraries: numpy, scipy, h5py, fsspec, pyproj, Pillow, requests, aiohttp (open source)
- Code: https://github.com/RafaelRodriguezSanz/dancing-with-the-sars

## AI usage disclosure

The code, tests and documentation were written with the help of Claude (Anthropic, via Claude Code), under the author's direction. The author chose the idea, the challenge and the approach, and reviewed the results. AI-assisted commits carry `Co-Authored-By` trailers. AI was not used to come up with the idea. No NASA logos, flags or mission identifiers are used or modified.
