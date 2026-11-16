# Submission text: Dancing with the SARs

Text for the NASA Space Apps Challenge 2026 project page (challenge: Dancing with the SARs).

## Short title

Dancing with the SARs: when the river rises, radar finds the dry way out

## Summary (about 100 words)

When El Niño floods Uruguay, clouds blind optical satellites. Radar sees through. Dancing with the SARs is an interactive web map that turns real NISAR L-band radar data into an answer for that moment: which ground a river rise would cover, which public buildings stay dry and a road route to the nearest one that avoids flooded streets. Behind it, the radar gives readable land cover, built-up areas and change alerts that flag candidate floods, vegetation loss and crop growth with a plain-language reason and the rain of the week before. It opens on the Santa Lucía river, with Montevideo and the whole country ready. Run locally, it analyzes any country from NASA Earthdata.

## Description

**El Niño flood response.** El Niño years bring long rainy spells and river floods to Uruguay, when optical satellites see only clouds. One button answers for the current view: a terrain model (NASA SRTM, ~30 m) and the rivers, streams and water NISAR sees give the ground a river rise of 0 to 10 m would cover. Public buildings from OpenStreetMap are coloured as dry, close to the water or flooded. Click a point and the app plans a road route to the nearest dry refuge that avoids flooded streets, and shows when the usual shortest way crosses water. A 7-day rain forecast for the spot is shown alongside.

**What else it shows.** The app shows what NISAR radar sees on the ground. Layers: a colour composite of HH and HV backscatter, land-cover classes (water, woody vegetation, grass and crops, double bounce, built-up), change alerts, built-up areas next to OpenStreetMap towns, and the wind at the radar pass as moving lines. A start screen with a radar-scan animation opens the Santa Lucía river area with every layer on. Ready buttons under the search bar jump to Montevideo and to a whole-Uruguay mosaic (newest valid pixel of 35 passes, 200 m); all three have alerts, validation and the El Niño flood map precomputed. Dates are picked from a calendar that marks high-resolution days (~16 m tiles), days with 80 m products and NISAR passes without products. **Evolution** plays every date and charts class shares and mean backscatter inside the current view.

**Tested in Uruguay.** Everything was built and checked on Uruguay, the author's country, where El Niño years bring heavy rain and the Uruguay, Negro, Santa Lucía, Yí, Cuareim and Olimar rivers overflow. Three areas were processed end to end from real NISAR passes (July to November 2026): the Santa Lucía river basin (80 m, with ~16 m tiles on selected dates), Montevideo and its coast, and the whole country (200 m mosaic of 35 passes). For each one the pipeline produced radar products, change alerts with rainfall context, validation against ESA WorldCover and JRC water, and the El Niño flood map with public buildings. Country-wide, the flood analysis answers instantly for any view; zoomed in to a riverside town it adds streams, roads and an evacuation route.

**Analyze any area.** With the local server and a free Earthdata token, the search bar finds a country, region or city by name (or you draw a box), and **Analyze area** builds radar products, alerts and the flood map for it, with a progress bar and cancel. Boxes up to about 10 degrees a side are processed like a country.

**Benefits.** Radar works through clouds and at night, so change can be tracked when optical images are blocked. The rules are simple thresholds in dB, so every class and alert can be explained to teachers, emergency planners or the public. Flood candidates carry 7-day ERA5 rainfall as context, and the wind layer warns when strong wind makes open water look like land.

**How it works.** The CMR catalogue is searched for NISAR L2 GCOV granules. Only the HDF5 chunks covering the area are downloaded with HTTP range reads, not the whole ~2 GB file. Each pixel is classified from gamma0 in dB. Alerts compare dates after removing each pass's own median, so different viewing geometries can be mixed; values below the noise floor are discarded. Permanent water and built-up come from medians over the whole series. Selected dates also get ~16 m map tiles from frequency A. Products are small web images, tiles and GeoJSON read by a static MapLibre GL site on GitHub Pages; the flood model and routing run in the browser.

**Validation.** In a test box west of Montevideo (823,491 pixels, 30 dates) agreement with ESA WorldCover 2021 is 90% (kappa 0.63). Water recall 0.71 and precision 0.78; woody 0.58 and 0.74; open land 0.97 and 0.93; built-up 0.30 and 0.41. Permanent water against JRC Global Surface Water: IoU 0.63. For the whole of Uruguay (35 dates, 7.6 million pixels at ~200 m): 86.5% agreement, kappa 0.69; water recall 0.98 and precision 0.71; permanent water IoU 0.64.

**Tools and languages.** Python (numpy, scipy, h5py, fsspec, pyproj, Pillow) for processing and a small local server; JavaScript (ES modules, no build step, clean architecture: domain, application, infrastructure, presentation) with MapLibre GL JS for the site; HTML/CSS; GitHub Pages for hosting.

**Creativity.** Most radar maps stop at showing change. This one asks what a person needs when the water rises: where is dry, and how do I get there. The route planner avoids flooded streets and shows when the usual shortest way crosses water. Each flood candidate is checked against the rain of the week before, and open water against the wind at the radar pass, so the map explains itself instead of asking for trust. Rules are plain dB thresholds, not a black box, and the validation table is published with its weak spots. Radar processing is presented as a scan you watch rather than a file you download.

**Considerations and limits.** Alerts are candidates, not confirmed events, and are not validated against observed events. The flood map is a planning aid, not an official plan: it spreads water over terrain and ignores levees and drains, and refuges are public buildings, not confirmed shelters. ERA5 rainfall is modelled at about 25 km. Some NISAR data is provisional. The country mosaic shows seams between passes, and country-wide alerts use a 400 m grid. Built-up detection is weak at 80 m (towns with trees look like woody vegetation), so OpenStreetMap towns are shown alongside. Validation reference maps are from 2021 and have their own errors, so this is agreement, not accuracy. Analyzing a new area needs a free Earthdata token and the local server; the public site shows the precomputed areas.

## NASA data used

- NISAR L2 GCOV (NISAR_L2_GCOV_V1 and the provisional version), HH and HV backscatter, from NASA Earthdata / ASF DAAC, found through NASA CMR. Core data of the project.
- NASA GIBS: Blue Marble shaded relief basemap and NISAR tiles shown for comparison.
- NASA SRTM elevation (through the open Terrarium terrain tiles), for the flood model.

## Space agency and partner data used

- ISRO: co-developer of NISAR (the NISAR data above is a NASA-ISRO product).
- ESA WorldCover 2021 v200 (validation).
- JRC Global Surface Water occurrence 1984-2021 (validation; fills wind-roughened permanent water).
- Open-Meteo: ERA5 reanalysis from Copernicus/ECMWF (rainfall before flood candidates), historical wind at the radar pass and the 7-day rain forecast.
- OpenStreetMap contributors: basemap, towns, rivers, roads and public buildings via the Overpass API, and place search via Nominatim (ODbL).

## References

- Challenge: https://www.spaceappschallenge.org/2026/challenges/dancing-with-the-sars/
- NASA Earthdata: https://search.earthdata.nasa.gov/ and ASF DAAC: https://asf.alaska.edu/
- NASA CMR: https://cmr.earthdata.nasa.gov/search
- NASA GIBS: https://earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs
- NASA SRTM: https://www.earthdata.nasa.gov/data/instruments/srtm ; Terrarium terrain tiles: https://registry.opendata.aws/terrain-tiles/
- ESA WorldCover: https://esa-worldcover.org/
- JRC Global Surface Water: https://global-surface-water.appspot.com/ ; Pekel et al. 2016, "High-resolution mapping of global surface water and its long-term changes", Nature 540
- Open-Meteo: https://open-meteo.com/en/docs/historical-weather-api ; ERA5: Hersbach et al. 2020, QJRMS
- OpenStreetMap: https://www.openstreetmap.org/copyright ; Nominatim: https://nominatim.org/
- MapLibre GL JS: https://maplibre.org/
- Python libraries: numpy, scipy, h5py, fsspec, pyproj, Pillow, requests, aiohttp (open source)
- Code: https://github.com/RafaelRodriguezSanz/dancing-with-the-sars

## AI usage disclosure

The code, tests and documentation were written with the help of Claude (Anthropic, via Claude Code), under the author's direction. The author chose the idea, the challenge and the approach, and reviewed the results. AI-assisted commits carry `Co-Authored-By` trailers. AI was not used to come up with the idea. No NASA logos, flags or mission identifiers are used or modified. The 30 s demo video is a screen recording of the app; its edit was AI-assisted (Claude Code) and its music was AI-generated (composed by Claude in the ArtCraft SoundCraft app). The video carries a visible watermark saying so, and the same note is in its file metadata.
