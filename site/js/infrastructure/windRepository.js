/**
 * Wind at 10 m for one hour over a grid of points: Open-Meteo Historical Forecast API (free, no key, CORS open;
 * archived weather-model runs, 2022 to today). One request for the whole grid.
 */
import { gridPoints, windField } from '../domain/wind.js';

const URL = 'https://historical-forecast-api.open-meteo.com/v1/forecast';

/** Grid size for a box: about one point every 0.5 degrees, between 3 and 10 per side. */
export const gridSize = (span) => Math.max(3, Math.min(10, Math.round(span / 0.5) + 2));

export class WindRepository {
  constructor(fetchFn) {
    this.fetch = fetchFn;
    this.cache = new Map();
  }

  /** Wind field for bbox on date (YYYY-MM-DD) at hourUtc. Rejects when the service does not answer. */
  field(bbox, date, hourUtc) {
    const key = `${bbox.join(',')}|${date}|${hourUtc}`;
    if (!this.cache.has(key)) {
      const p = this.load(bbox, date, hourUtc);
      p.catch(() => this.cache.delete(key));
      this.cache.set(key, p);
    }
    return this.cache.get(key);
  }

  async load(bbox, date, hourUtc) {
    const nx = gridSize(bbox[2] - bbox[0]);
    const ny = gridSize(bbox[3] - bbox[1]);
    const pts = gridPoints(bbox, nx, ny);
    const q = new URLSearchParams({
      latitude: pts.map((p) => p[1].toFixed(3)).join(','), longitude: pts.map((p) => p[0].toFixed(3)).join(','),
      start_date: date, end_date: date, hourly: 'wind_speed_10m,wind_direction_10m', wind_speed_unit: 'kmh', timezone: 'GMT',
    });
    const r = await this.fetch(`${URL}?${q}`);
    if (!r.ok) throw new Error(`Open-Meteo HTTP ${r.status}`);
    const json = await r.json();
    const list = Array.isArray(json) ? json : [json];
    const speeds = list.map((x) => x.hourly?.wind_speed_10m?.[hourUtc] ?? NaN);
    const dirs = list.map((x) => x.hourly?.wind_direction_10m?.[hourUtc] ?? NaN);
    return windField(bbox, nx, ny, speeds, dirs);
  }
}
