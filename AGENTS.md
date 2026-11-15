# AGENTS.md

Notes for coding agents that set up, run and test this project locally. Human-facing docs are in `README.md`.

## What this is

- A static web map (`site/`, plain HTML/CSS and ES modules, **no build step, no npm install**) served by GitHub Pages from the `master` root. The root `index.html` redirects to `site/`, and `.nojekyll` makes Pages serve the files as they are.
- Python scripts (`scripts/`) build the radar products from NISAR GCOV data into `site/data/nisar/<area>/`.
- `scripts/serve.py` is an optional local server: it serves the site and a small API that runs the pipeline for any area.

## Secrets (read first)

- The pipeline needs a NASA Earthdata Login token in `EARTHDATA_TOKEN`. It is read from `.env` (gitignored), from the environment variable, or from `~/.earthdata_token`.
- **Never print, log, commit or ask for the token in chat.** Don't `cat .env`. To check that it is set, run `make check` or `python scripts/check_env.py`. It only says whether the token is found.
- Script output can include signed download URLs. Filter it before showing it, for example `... 2>&1 | grep -iv -E "bearer|signature|token="`.
- If there is no token, everything except processing new areas still works (see "Run without a token").

## Setup

Requirements: Python 3.12, `make`, Node 18+ with npm (only for the tests).

```
make install                 # creates .venv and installs requirements.txt
cp .env.example .env         # Windows: copy .env.example .env ; the user pastes the token, not you
```

The Python interpreter is `.venv/Scripts/python` on Windows and `.venv/bin/python` on Linux/macOS.

## Run

| Goal | Command | Open |
|---|---|---|
| Site + processing API (needs token) | `make` (= `make run`; `make PORT=9000` to change the port) | http://127.0.0.1:8000/site/ |
| Site only, no token | `python -m http.server 8000` from the repo root | http://127.0.0.1:8000/site/ |

- `make run` stops with instructions if `.env` has no token (`scripts/check_env.py`).
- The server is long-running: start it in the background and don't start a second copy on the same port.
- Precomputed areas (`santa-lucia`, `montevideo`, `uruguay`) are in the repo and open without a token. Any box can be opened directly with `#bbox=w,s,e,n` in the URL.
- API: `GET /api/status`, `POST /api/process?bbox=w,s,e,n&limit=N`, `POST /api/cancel`. It listens on localhost only and never returns the token.

## Test

```
make test                    # npm install (first time) + npm test: Jest over tests/
```

- Tests are in `tests/<layer>/`, mirroring `site/js/<layer>/`, and import the code from `../../site/js/...`. Jest runs the ES modules natively (`--experimental-vm-modules`, no Babel), so keep `"transform": {}` in `package.json`.
- The tests are fast, need no network and cover the domain, application, infrastructure and layer code. Run them after any change in `site/js`. `node_modules/` is gitignored; commit `package-lock.json`.
- There are no Python unit tests. To check a script change, run it on a small area. Each step below writes to `site/data/nisar/<area>/`:

```
PY=.venv/Scripts/python
$PY scripts/nisar_subset.py --area santa-lucia      # downloads and caches passes in data/raw/ (needs token)
$PY scripts/nisar_alerts.py --area santa-lucia      # works from the cache
$PY scripts/validate.py --area santa-lucia          # downloads WorldCover/JRC references
$PY scripts/flood_precompute.py --area santa-lucia
$PY scripts/nisar_tiles.py --area santa-lucia --dates 2026-10-17
```

- `--bbox w,s,e,n` works instead of `--area` for any box. Named areas are in `AREAS` in `scripts/nisar_subset.py`, and the site's copy is in `site/js/domain/scene.js` and `site/js/layers/nisarCalibrated.js`.
- If the person you work with wants to check the UI in the browser themselves, don't run headless browsers or screenshots unless they ask. Tell them what to look at instead.

## Resource limits

- A whole country is heavy: `nisar_subset` for Uruguay takes about 20 minutes and several GB of RAM. Run one heavy job at a time.
- Lower `NISAR_WORKERS` in `.env` (parallel downloads, default 4) on machines with little RAM.
- If a job is killed for lack of memory, don't relaunch it in a loop. Report it.
- `data/raw/` is the download cache (about 1 GB) and is gitignored. Deleting it forces new downloads.

## Conventions

- Keep the clean architecture of the browser code:
  - `site/js/domain`: pure rules, no DOM, no network;
  - `site/js/application`: use cases;
  - `site/js/infrastructure`: HTTP and APIs;
  - `site/js/presentation`: DOM and map.

  `site/js/main.js` wires them together. Domain code should get a test.
- Code, comments, UI text and docs are in English.
- Files use LF line endings, UTF-8. On Windows, don't let editors or scripts rewrite them as CRLF.
- External scripts load only from pinned CDN versions (see `site/index.html`). Don't add a bundler or runtime npm dependencies to the site; npm is only for the test tooling.
- Science honesty:
  - alerts are *candidates*, not confirmed events;
  - validation is *agreement* with reference maps, not accuracy;
  - the flood map is a planning aid, not an official plan.

  Keep this wording.
- Commit generated data only for the named areas. Drawn areas (`site/data/nisar/aoi_*`) are gitignored.
- Git flow: feature branch → PR to `develop` → release PR `develop` → `master`, which is what Pages serves. There is no CI: run `make test` before pushing.
