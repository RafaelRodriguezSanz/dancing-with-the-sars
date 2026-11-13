# Surface-change types: sensors and how to recognise them (research, 2026-11-13)

Sources are mission/agency pages and papers found by web search (snippet level; verify before quoting numbers).

| Change | Sensors / products | SAR signature | Simple recognition | ML? |
|---|---|---|---|---|
| Open water / wetlands | NISAR L-band GCOV, Sentinel-1, OPERA DSWx-S1 | open water = very low backscatter; flooded vegetation = bright (double bounce), L-band best | threshold on HH, or DSWx product | no (open water) |
| Wildfire / burn scar | NISAR/ALOS-2 L-band, Sentinel-1 | L-band HV drops ~4 dB; C-band sign depends on moisture | log-ratio of HV before/after | no |
| Agriculture | Sentinel-1 VV/VH time series, NISAR | planting/growth/harvest curve over time | change = easy; crop type needs time series | yes for crop type |
| Deformation / earthquakes | NISAR GUNW, Sentinel-1 InSAR | interferometric fringes (mm) | needs image pairs + processing | no (physics) |
| Glaciers / ice | Sentinel-1 offset tracking (ITS_LIVE), NISAR | feature displacement between dates | ready-made velocity product | no |
| General disturbance | OPERA DIST-ALERT-S1 (announced 2026-10-27) | backscatter change: vegetation loss, fire, flood, crops | ready-made product | no |

Access facts: see `docs/plan.md` section 0b.
