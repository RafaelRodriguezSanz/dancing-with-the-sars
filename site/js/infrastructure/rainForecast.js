/** Rain forecast for the next days at a point: Open-Meteo forecast API (free, no key, CORS open). */
const URL = 'https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&daily=precipitation_sum&forecast_days={days}&timezone=auto';

/** {total, days: [{date, mm}]} or null when the service does not answer. */
export async function rainForecast(fetchFn, lon, lat, days = 7) {
  try {
    const r = await fetchFn(URL.replace('{lat}', lat.toFixed(3)).replace('{lon}', lon.toFixed(3)).replace('{days}', days));
    if (!r.ok) return null;
    const d = (await r.json()).daily;
    const list = d.time.map((date, i) => ({ date, mm: d.precipitation_sum[i] ?? 0 }));
    return { total: Math.round(list.reduce((a, x) => a + x.mm, 0)), days: list };
  } catch {
    return null;
  }
}
