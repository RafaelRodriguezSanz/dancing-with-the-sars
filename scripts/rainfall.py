"""Rainfall before a radar date, to tell flood candidates from dry bare soil (both look dark to radar).

Source: Open-Meteo historical weather API (ERA5 reanalysis, ~25 km, free, no key):
https://open-meteo.com/en/docs/historical-weather-api . Values are modelled, not gauge readings.
One request per ~0.25 degree cell covering all dates; offline or failing requests give None.
"""
import datetime as dt
import json
import ssl
import urllib.request

URL = ('https://archive-api.open-meteo.com/v1/archive?latitude={lat}&longitude={lon}'
       '&start_date={start}&end_date={end}&daily=precipitation_sum&timezone=UTC')
WET_MM = 20  # 7-day total that makes flooding plausible
DRY_MM = 5   # below this, a dark patch is more likely dry, smooth soil
_cells = {}


def _ctx():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return None


def _daily(lat, lon, start, end):
    key = (round(lat * 4) / 4, round(lon * 4) / 4, start, end)
    if key not in _cells:
        try:
            url = URL.format(lat=key[0], lon=key[1], start=start, end=end)
            with urllib.request.urlopen(url, context=_ctx(), timeout=60) as r:
                d = json.load(r)['daily']
            _cells[key] = dict(zip(d['time'], d['precipitation_sum']))
        except Exception as e:  # noqa: BLE001  rainfall is context only: never break the alerts
            print('rainfall unavailable:', type(e).__name__, flush=True)
            _cells[key] = {}
    return _cells[key]


def rain_before(lat, lon, date, first, last, days=7):
    """Total rain (mm) of the `days` days up to `date` (inclusive); first/last bound the shared request."""
    start = (dt.date.fromisoformat(first) - dt.timedelta(days=days)).isoformat()
    daily = _daily(lat, lon, start, last)
    d0 = dt.date.fromisoformat(date)
    vals = [daily.get((d0 - dt.timedelta(days=i)).isoformat()) for i in range(days)]
    if not daily or any(v is None for v in vals):
        return None
    return round(sum(vals), 1)


def verdict(mm):
    if mm is None:
        return None
    if mm >= WET_MM:
        return f'{mm} mm of rain in the 7 days before (ERA5): flooding is plausible.'
    if mm < DRY_MM:
        return f'Only {mm} mm of rain in the 7 days before (ERA5): more likely dry, smooth soil.'
    return f'{mm} mm of rain in the 7 days before (ERA5): some rain, check on the ground.'
