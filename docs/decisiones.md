# Decision log

Format: date · decision · reason

- 2026-11-13 · Repo `RafaelRodriguezSanz/dancing-with-the-sars`, public; `master` = releases, `develop` = integration · requested by Rafa, gitflow.
- 2026-11-13 · GitHub Pages source = GitHub Actions; default workflow token = write; workflows may NOT approve PRs · Pages deploy from CI; keep human/agent review separate.
- 2026-11-13 · Remote over HTTPS with the `gh` credential helper · no SSH key on the local machine.
- 2026-11-13 · spaceappschallenge.org omits its intermediate certificate; fetched SSL.com's intermediate from the URL in the certificate and verified the full chain (never disabled TLS checks) · reading the official pages safely.
- 2026-11-13 · Phases 0–3 = preparation only · the submission guide does not say whether coding before Nov 14 is allowed.
- 2026-11-13 · No GitHub Actions: Pages = "deploy from branch" (`master`, root) + root `index.html` redirecting to `site/`, `.nojekyll`; CI runs locally (scripts/hooks) instead of Actions · Rafa's account has Actions locked ("billing issue", free plan, no charges); branch deploys still work (verified 200).
- 2026-11-13 · Front end = static HTML + JS from CDN, no build step (docsify discarded) · the product is an interactive map/time series, not docs; README already renders on GitHub; easy to fix from anywhere.
- 2026-11-13 · Data downloaded and processed on Rafa's PC (data servers reachable from it), only small derived outputs committed · Actions unavailable; Claude cloud cannot reach data servers.
- 2026-11-13 · Supersedes "Pages source = GitHub Actions" above: Pages deploys from branch `master` root · Actions locked.
- 2026-11-13 · Plan v2 (planner + architect + independent review integrated): NISAR GCOV track 82D, Santa Lucía lower basin (pending Rafa), 8-bit PNG stack committed; forecast cut to future work; "open-water extent" wording · review in docs/revision-plan.md.
- 2026-11-13 · Stack: Python 3.12 + h5py 3.16.0 + rasterio 1.5.2 (+ earthaccess) on Rafa's PC; front end Leaflet 1.9.4 + Chart.js 4.4.1 from cdnjs; local CI `scripts/ci.sh` · Windows wheels exist; no build step.
- 2026-11-13 · H1 data path = browser-side CMR + NASA GIBS tiles, nothing downloaded to Rafa's PC (supersedes "Data downloaded and processed on Rafa's PC" for H1) · static Pages, no login; GIBS no-data tiles can be noise.
- 2026-11-13 · Product pivot: map of surface-change layers (water, fire, agriculture, deformation, glaciers, disturbance), toggleable, loaded on demand in quality tiers (T0 public/T1 committed pyramid/T2 login-only offline) · Rafa's direction; OPERA/DAAC files need Earthdata login and lack CORS.
- 2026-11-13 · Pre-event coding disclosure: the H1 map and layer framework were written with Claude on 2026-11-13, before the event (14-15 Nov); to be listed in the submission form.
