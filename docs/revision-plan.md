# Independent review of plan.md + arquitectura.md

Reviewer: independent adversarial agent, Fri 2026-11-13 ~14:00 UTC-3. **Verdict: APPROVE WITH CHANGES.**
The direction (one AOI, NISAR GCOV water time series, static Pages app, early MVS) is sound. The plan is already
~1 h behind its own timeline (Rafa's 13:30/14:00 items not done), the two docs disagree on key points, and the
science claims go beyond what the method can support.

## 1. Today's data acquisition (ranked risks, ~4 h left)
1. **No Earthdata account = no data.** Without it, GCOV, DSWx-S1 and the watermask are all blocked; only CMR
   metadata and public browse PNGs work. This is the critical path, and nothing else matters until it is done.
2. **Range reads have never been tested.** The page size, the auth redirect through fsspec on Windows, and the
   throughput from Uruguay are all unknown. The assumptions "10 m posting", "frequencyB at 80 m" and "HH/HV
   present" are also unverified for these granules. The spike must print `listOfFrequencies`,
   `listOfPolarizations` and the posting, and the code must not hard-code 3x3/10 m.
3. **Windows setup costs time.** venv plus rasterio/h5py wheels takes 10-20 min if pins fail. The PC sleeping
   would kill the fetch: run `powercfg /change standby-timeout-ac 0` before starting.
4. **Process overhead.** PR plus reviewer plus hooks for every data commit will eat the window. Today: one branch
   `data/fetch`, push every ~5 dates, contract test only.

**Realistic minimum before 18:00:** track 82D only, at least 8 dates spread over Jun-Nov (not all 21), HH+HV+mask
→ 8-bit PNG stack committed, plus `manifest.json`, all browse PNGs, and the CMR inventory. DSWx-S1 and the
watermask are optional extras.

**Fallback ladder (hard time boxes):**
| By | Gate | If it fails |
|---|---|---|
| 14:15 | Claude (no auth needed): CMR inventory 82D + download all browse PNGs + venv install | browse PNGs are the floor; commit them now |
| 14:40 | Rafa: EDL account, email verified, ASF app approved, `.netrc` typed by Rafa; 1 KB authed range request OK | retry until 15:00; then go straight to step 5 |
| 15:15 | Spike: 1 AOI subset via `earthaccess.open()` + h5py; time measured | <3 min/scene → loop dates in time order, alternating ends of the window so coverage stays spread |
| 15:30 | if >5 min/scene: frequencyB (only if it exists in these granules) | else full-granule download in background for ~6 dates, subset, delete |
| 16:00 | Harmony subsetting: try at most once, 15 min | skip |
| 17:15 | Stop NISAR. If ≥6 dates are done: DSWx-S1 series, 30 min max; watermask tile | skip; use the NISAR running median only |
| 17:40 | Push, clone in a cloud session, run contract tests | fix only the manifest; no new fetches |

## 2. Contradictions between plan.md and arquitectura.md (one resolution each)
- **Data storage:** plan = float16 raw on GitHub Release `data-v0`; arch = 8-bit PNG stack committed to `develop`.
  → **Use arch.** Commit the PNG stack (~20 MB). Upload raw `.npz` to a Release only if time is left. Drop the
  "cloud verifies Release" milestone.
- **Tracks:** plan = 42 granules over 3 tracks (asc+desc); arch = 82D only. → **82D only.** Fix the "42/39"
  check in H1.
- **AOI B (Porto Alegre) fetched today:** → **Cut.** No time, and it adds the risk of implying NISAR saw 2024.
- **AOI size:** 30x30 km vs 25x25 km. → **25x25 km.**
- **DSWx-S1 period:** plan says from Jan 2024; arch says from Aug 2024 (verified in CMR). → **Aug 2024**, and the
  plan text must not say "long seasonal baseline".
- **Product code today:** plan says none today; arch says "first A1 run on PC today". → **No A1 today.** Viewing
  the stack PNG is the sanity check. Otherwise the FETCH-OK disclosure is false.
- **Releases:** plan = v0.1 Sat 12:30, MVS Sat 21:00, v1.0 Sun 18:00; arch = Sat 20:00, Sun 18:00, "final Sun
  20:00". → **Plan's times.** Nothing merges to master after 18:00 Sunday except text fixes.
- **CI script:** `scripts/check.sh` vs `scripts/ci.sh`. → **`ci.sh`**, with the plan's rule checks (slide count,
  branding) added.
- **Who merges:** arch says "Phone: review/merge PRs", but Rafa does not review code. → Agents merge via `gh`
  from cloud. Rafa only gives approvals and submits.
- **decisiones.md** still says "Pages source = GitHub Actions". Append a line marking it superseded.

## 3. Scientific validity (claims to remove or soften)
- **"L-band sees water under vegetation that C-band misses" is the headline, but the classifier does the
  opposite.** `HH < t` maps *open* water. Flooded marsh is HH-*bright* (double bounce) and will be classed
  as land. Validating against DSWx-S1 (open water only) cannot test this either.
  → Headline becomes: "open-water extent from NISAR L-band; flooded vegetation is an experimental layer,
  unvalidated". Or drop it.
- **The "% flooded" label overstates.** The series measures dark-pixel area, which includes wind-roughening,
  tidal and estuarine effects (Río de la Plata influence) and wet-soil confusion. Call it "open-water extent
  (%)" and list these confounders.
- **Fixed dB clamps [-22,-14] / [-28,-20] are borrowed, not NISAR-calibrated.** Report the per-date threshold
  in the UI and in the limits section.
- **DSWx monthly percentile from about 2 years means n≈2-6 per month.** "p90" is not meaningful. Show the DSWx
  series as context only, and **remove the percentile-based alert rule**.
- **Robust z uses an expanding window with a minimum of 5 dates, so only ~3-16 z values exist and the 0.1 pp
  floor is arbitrary.** Rename "warning/watch" to "unusual vs. this season so far (demo flag, not an
  operational alert)".
- **The forecast backtests on C-band DSWx and is then applied to NISAR,** which is a cross-sensor transfer with
  a bias the docs admit exists. With about 20 points it will almost certainly not beat persistence.
  → **Cut it to a future-work slide.** At most, show the persistence line labelled "naive, not a forecast".
- **2023 water crisis:** that was a *drought*, before NISAR data existed. Use it only as motivation; never
  imply NISAR observed it.
- **Rainfall/river-level cross-check:** the source must be fetched today from the PC, because cloud cannot
  reach it. Otherwise phrase drivers as hypotheses with cited links, without numbers.

## 4. Scope: cut now
- **Cut today:** AOI B, tracks 154D/60A, A1 run on PC, Harmony beyond one try, DSWx per-date masks
  (keep the series only).
- **Cut from the product:** forecast (future-work slide), DSWx percentile alerts, land cover/forest loss,
  video, and IoU validation unless ≥3 near-coincident pairs exist.
- **OPERA comparison:** worth it only as a cheap context line on the chart, as a second NASA dataset. It is
  not worth a comparison panel or the claims that come with one.
- **Never cut:** per-date NISAR map + slider, before/after swipe, open-water % chart, limits text, slides, references.

## 5. Rules compliance gaps and Rafa dependencies
- **"Idea not from AI" is the biggest risk.** The study area, angle and storyline were *proposed by the
  planner agent*, and a one-word `YES` is weak evidence. Rafa should write, in his own words, one line on
  what he wants to show and why Santa Lucía. Log it in `decisiones.md` and use it in the SI disclosure.
- **Pre-event code:** disclose the fetch tooling *and* the PC preprocessing (speckle filter, quantization) in
  the form, with commit timestamps.
- **NISAR mission identifiers/logos:** no mission or NASA logos on slides, favicon or generated images. Text
  mention of the dataset name is fine. Any AI image needs a watermark. No people.
- **References:** OSM tiles, Leaflet, Chart.js, Copernicus DEM (if used), DSWx-S1 DOI, GCOV DOI/spec,
  Claude (SI section).
- **Form fields:** "demo link" and "final project link" must be distinct public URLs (Pages + repo or
  slides.pdf). Test both in a private window.
- **Rafa items that are not phone-doable or not time-boxed:** EDL + `.netrc` (needs the PC, by 14:40); PC
  awake (needs the PC); Space Apps login and team-owner status (check **today**, on the phone, that he can
  open the submission form); long form text (provide `docs/submission.md` as plain sections, each <1 screen,
  to copy one by one). The deadlines for items 1-2 have already been missed, so re-time them now.

## 6. Top 5 required changes
1. Re-time Friday to the fallback ladder in section 1. EDL + `.netrc` first (by 14:40), go/no-go at 15:15, NISAR
   stop at 17:15. Track 82D only, ≥8 spread dates, browse PNGs secured in the first 15 min.
2. Resolve storage as arch: commit the 8-bit PNG stack + manifest to the repo. Drop the Release/float16 path,
   AOI B, other tracks and the PC A1 run.
3. Soften the science. "Open-water extent" not "% flooded". Flooded vegetation is experimental, or removed from
   the headline. Alerts become a "demo flag". Remove the DSWx percentile rule. State the confounders.
4. Cut the forecast to a future-work slide. Reduce OPERA to a context line plus a second-dataset reference.
5. Close the rules gaps. Rafa writes the idea in his own words, the pre-event tooling and preprocessing are
   disclosed, Space Apps form access is checked on the phone today, and the final merge is by Sun 18:00 with a
   private-window test.
