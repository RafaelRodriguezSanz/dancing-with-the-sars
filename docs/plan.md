# Plan — Dancing with the SARs (solo, NASA Space Apps 2026)

Status: v2 — planner (opus) draft + architecture (`docs/arquitectura.md`) + independent review
(`docs/revision-plan.md`) integrated by the lead, Fri 2026-11-13 ~14:15 UTC-3. Times are Uruguay local (UTC-3).
Pending Rafa's approval (section 6, items 1 and 6).

## 0. Binding changes from the review (override anything below)

1. **Friday = fallback ladder** in `revision-plan.md` §1: Earthdata login + `.netrc` by 14:40; range-read
   go/no-go 15:15; NISAR fetch stops 17:15; push + cloud contract test 17:40. **Track 82D only, ≥8 dates spread
   Jun–Nov**; public browse PNGs + CMR inventory secured first (no login needed).
2. **Storage = 8-bit PNG stack + `manifest.json` committed to the repo** (as in arquitectura.md). No Release /
   float16 path. No AOI B, no tracks 154D/60A, no analysis run today. AOI 25×25 km.
3. **Science wording:** "open-water extent (%)", never "% flooded". Flooded vegetation = experimental layer, not
   the headline. Alerts = "unusual vs. this season so far (demo flag, not an operational alert)". No DSWx
   percentile rule. Per-date threshold shown in the UI. Confounders listed (wind, Río de la Plata tides/estuary,
   wet soil). 2023 drought = motivation only, never implied as observed by NISAR.
4. **Forecast cut** to a future-work slide (at most a persistence line labelled "naive, not a forecast"). OPERA
   DSWx-S1 = context line on the chart + second NASA dataset only (from Aug 2024).
5. **Rules:** Rafa states the idea and study-area choice in his own words (logged in `decisiones.md`); pre-event
   fetch tooling and preprocessing disclosed with commit timestamps; Rafa checks today on the phone that he can
   open the Space Apps team/project page; final merge to master by Sun 18:00 + private-window test.
6. CI script name: `scripts/ci.sh`. Agents merge via `gh`; Rafa never reviews code.

## 1. Goal and scope

Build an open-source web app (GitHub Pages, static) that uses **NISAR L2 GCOV (L-band, HH+HV)** to track how
**surface water and flooded wetlands expand and retract** in one study area over Jun–Nov 2026: a water map per
NISAR date, % of area flooded over time, deviation from a "normal" baseline, an alert flag when a new scene
deviates, and a short, clearly-labelled forecast of % flooded. Key angle: L-band sees water **under vegetation**
(HH double-bounce) that C-band (Sentinel-1/OPERA) misses. Honest about limits throughout.

- **In scope:** NISAR GCOV time series for 1 AOI; water / flooded-vegetation classification; time slider map +
  before/after slider; % flooded chart; anomaly vs baseline; alert rule; naive forecast with uncertainty band;
  physical-driver hypotheses (rain, river level, season); ≤7-slide PDF; README with data, references, AI disclosure.
- **Baseline honesty:** 5 months of NISAR (~12 scenes/track) cannot give a seasonal baseline. Use
  **OPERA DSWx-S1 (2024–2026)** for the long monthly baseline; NISAR anomalies are computed against it on
  overlapping water classes, and against NISAR's own running median. State this on screen and in slides.
- **Out of scope:** earthquake/tsunami prediction, InSAR deformation, operational alerting (future work slide).
- **Stretch (only if ahead):** HV-drop forest/vegetation loss layer; simple 3-class land cover (water / flooded
  veg / other); NISAR-vs-OPERA same-date comparison panel; ≤30 s subtitled video.

## 2. Study area

| Option | NISAR | Impact | Creativity | Validity | Relevance | Presentation |
|---|---|---|---|---|---|---|
| **A. Santa Lucía river & wetlands (UY), -56.40,-34.45** | 42 granules, 3 tracks (82D 21, 154D 12, 60A 9) — densest | Montevideo's drinking-water basin (2023 water crisis); protected wetland | L-band flooded-marsh detection is a genuine NISAR strength | Mixed geometries (asc+desc) need care; enough dates to filter noise | Wetlands "extending and retracting" is literally in the challenge text | Home-region story (Rafa is Uruguayan) |
| B. Porto Alegre / Guaíba (BR) | 39 granules, 3 tracks | 2024 megaflood is famous | Strong story, but | **NISAR cannot show 2024 event**; would show "normal" 2026 unless a 2026 event exists | Good | Risk of implying NISAR saw 2024 |
| C. Atlántida coast (UY) | 31 granules | Low (small streams, coast) | Low | Few water dynamics expected | Weak | Personal only |

**Recommendation: A (Santa Lucía lower basin + wetlands, AOI ~30×30 km).** Fallback: B, using OPERA/Sentinel-1
for 2024 as context only and NISAR for 2026 recovery state. Subset B's data today too, if bandwidth allows.

Must be checked in the data before any claim (ml-analyst, Sat morning): (1) is there a measurable water/wetland
extent change across Jun–Nov 2026 in A? (2) any real high-water episode — cross-check with public river-level or
rainfall records (cite source); **never invent an event**; if none, the story is "seasonal wetland pulse + what the
monitor would flag", stated as such; (3) asc vs desc geometry bias (compare per track before mixing).

## 3. Milestones (each verifiable)

| ID | Milestone | Evidence | Owner (model) |
|---|---|---|---|
| H0 | Plan approved; Earthdata login works on PC | Rafa's "OK"; `earthaccess.login()` succeeds on PC | lead (opus) / Rafa |
| H1 | Data inventory | `data/inventory/*.json` (CMR results A, B) committed; counts match 42/39 | data-engineer (sonnet) |
| H2 | Raw cache built (tooling only, no product logic) | GitHub Release `data-v0` has AOI subsets (HH, HV, mask, geotransform, date, track) + OPERA DSWx-S1 tiles + `SHA256SUMS`; a **cloud** session downloads and verifies checksums | data-engineer (sonnet) + ci-qa (haiku) |
| H3 | Common grid + water classifier | `pytest` passes: regrid, dB conversion, threshold on synthetic data; `out/water_YYYYMMDD.png` for every date | ml-analyst (sonnet) |
| H4 | Time series + baseline + anomaly + alert + forecast | `site/data/series.json` validated by schema test; forecast has interval; science notes in `docs/science.md` | ml-analyst (sonnet), review lead (opus) |
| H5 | Demo v0.1 live (map + date slider + % chart) | Pages URL loads in private window on phone; tag `v0.1` on master | frontend (sonnet) |
| H6 | Minimum viable submission (MVS) | `v0.2` on master; `site/slides.pdf` ≤7 slides loads; README sections filled; `docs/submission.md` with all form fields ready to paste | docs-video (sonnet), reviewer (sonnet) |
| H7 | Full feature set + science review | anomaly/alert/forecast panels live; `docs/science.md` limits section approved by lead | frontend, ml-analyst, lead |
| H8 | Feature freeze / RC | tag `v1.0-rc` Sun 13:00; `scripts/check.sh` (lint, tests, link check, slide count, file sizes) green | ci-qa (haiku) |
| H9 | Final release + submitted | tag `v1.0` on master; private-window test log; Rafa confirms "Submitted for Judging" screenshot | lead + Rafa |

Process: every change = small PR feature/*→develop, reviewed by reviewer (sonnet), checks by ci-qa (haiku) via local
script/hook; develop→master only for v0.1, v0.2, v1.0-rc, v1.0. Only small derived outputs committed to repo
(PNGs ≤ 1 MB, JSON); raw cache lives in Release assets.

## 4. Prep-rule tension (DECISION FOR RAFA)

The guide is silent on pre-event coding; lead set phases 0–3 = prep. But the only machine that reaches the data
servers (Rafa's PC) is guaranteed only until **today 18:00**. Proposed safest option:

- **Today:** only *data acquisition* — a tiny generic fetch/subset script (search CMR, HTTP range-read a bbox of
  HH/HV, save with metadata), labelled `tooling/`, no classification, no analytics, no UI. Equivalent to downloading
  data with a GUI, which the challenge text itself tells you to do. Commit timestamps make it auditable; disclose it
  in the project description ("data pre-fetched Nov 13; all analysis/app built Nov 14–15").
- **Sat 09:00 onward:** all product code (classifier, series, forecast, site, slides).
- Alternative (stricter): download full browse PNGs + raw subsets manually without any script. Slower, riskier.
- Rafa decides with one word: `FETCH-OK` (recommended) or `STRICT`.

## 5. Timeline

**Fri 13 (PC until 18:00) — data window, no product code** (superseded by §0.1 ladder; summary)
- by 14:15 Claude: CMR inventory 82D + all browse PNGs + venv. Rafa: approval + idea line + `FETCH-OK|STRICT`.
- by 14:40 Rafa: Earthdata login, ASF app approved, `.netrc` typed by Rafa on the PC.
- 15:15 range-read spike go/no-go → subset ≥8 spread 82D dates (HH, HV, mask) → 8-bit PNG stack + manifest, pushed every ~5 dates.
- 17:15 stop NISAR; DSWx-S1 series only if ≥6 dates done (30 min max).
- 17:40 push; cloud session clones and runs contract tests. 17:55 Rafa replies `PC-WEEKEND yes|no`.

**Sat 14 (Rafa: phone only)**
- 09:00 Event starts. ml-analyst: loader + regrid + classifier (H3). frontend: site skeleton (map, slider) with placeholder data.
- 11:00 Data question answered (event? change? asc/desc bias?) → lead fixes story; fallback to B decided here at latest.
- 12:30 Release v0.1 → master (H5).
- **13:00 Check-in 1:** Rafa opens URL on phone, replies OK / one-line comment.
- 13:00–18:00 series + baseline (OPERA) + anomaly + alert + forecast (H4); slides draft; README; `docs/submission.md`.
- 19:00–20:30 MVS assembly, private-window test, release v0.2 (H6).
- **21:00 Check-in 2:** Rafa pastes `docs/submission.md` into the form and submits MVS (resubmission allowed). Safe by Sat 21:00.
- 21:00–24:00 H7 work (comparison panel, UX polish), science review by lead.

**Sun 15**
- 08:00–12:30 H7 finish; stretch only if H7 is green; optional video.
- **13:00 Feature freeze + Check-in 3:** tag `v1.0-rc` (H8); Rafa opens URL + slides, replies OK.
- 13:00–18:00 fixes, references, AI disclosure, watermarks, limits text, final slides PDF.
- 18:00 Release v1.0 → master; 18:00–19:00 private-window test (desktop + phone).
- 19:00 Updated `docs/submission.md` handed to Rafa. **20:00 Rafa updates the form and clicks "Submit for Judging"** (H9). Buffer to 23:59.

**Already cut (review):** forecast (future-work slide), AOI B, NISAR-vs-OPERA panel, DSWx percentile alerts.
**Cut list (drop in this order if behind):** video → land-cover / forest-loss stretch → flooded-vegetation
experimental layer → OPERA context line → demo flag (keep NISAR running median in the chart).
**Never cut:** NISAR maps per date + slider, % flooded chart, honest limits, ≤7-slide PDF, references, AI disclosure.

**MVS (safe by Sat 21:00):** Pages site with NISAR water map per date + date slider + % flooded chart; 7-slide PDF
(team, member, challenge, image, UX, how NASA data enables it, limits); README with data + references + AI disclosure;
form text ready to paste.

## 6. Needs from Rafa (one line, phone-doable)

| # | Need | Deadline |
|---|---|---|
| 1 | Reply `FETCH-OK` or `STRICT` (section 4) and approve the plan | Fri 14:30 |
| 2 | Create free Earthdata login at urs.earthdata.nasa.gov and approve "Alaska Satellite Facility Data Access" app; type credentials into `~/.netrc` on the PC yourself (never paste in chat) | Fri 14:40 |
| 2b | On the phone: confirm you can open your Space Apps team → Project page (team owner) | Fri 18:00 |
| 3 | Keep PC on and awake until fetch finishes | Fri 18:00 |
| 4 | Reply `PC-WEEKEND yes` or `no` | Fri 18:00 |
| 5 | Confirm team name and how your name should appear on slides | Fri 18:00 |
| 6 | In your own words, one line: what you want to show and why this place (for the "idea not AI" rule) | Fri 14:30 |
| 7 | Optional: one personal sentence about Santa Lucía / Montevideo water for slide 2 | Sat 13:00 |
| 8 | Check-ins: open URL, reply OK or one line | Sat 13:00, Sat 21:00, Sun 13:00 |
| 9 | Paste form text + submit MVS | Sat 21:30 |
| 10 | Paste final text, tick Terms + Original, "Submit for Judging", send screenshot | Sun 20:00 |

## 7. Top risks

| Risk | Mitigation |
|---|---|
| Earthdata login / ASF access fails today, or range reads too slow → no NISAR cache | Start login at 13:30; test one granule first; prioritise 1 track (82D, 21 dates) end-to-end before others; fallback = browse PNGs (georeferenced from metadata) as minimal NISAR evidence |
| No PC on weekend and cache incomplete | Everything needed goes to Release `data-v0` before 18:00, verified from cloud; nothing on Sat/Sun needs data servers |
| No real flood/anomaly in the NISAR window | Story = wetland pulse + monitor capability; don't fabricate; OPERA long record shows past variability; fallback B decided by Sat 11:00 |
| Mixed asc/desc geometries and incidence angles bias water fractions | Classify per track; report per-track series; combine only after normalisation check; state in limits |
| Rafa unreachable at a check-in / submission | MVS submitted Sat 21:00 already counts; `docs/submission.md` always current; any check-in silence = proceed with plan |
| Rule breach (pre-coding, AI, branding, minors, slide/video limits) | Section 4 disclosure; reviewer checklist in `scripts/check.sh` (≤7 slides, ≤30 s, no NASA logos, watermark AI images, no people) |
