import { classShares, commonMask, coverage, meanDb, pixelWindow } from '../domain/evolution.js';

/**
 * Time series of what the view contains, one row per date, from the per-date products
 * already published (class PNG + colour composite). `loadPixels(url)` returns ImageData.
 * Rows: { date, shares: Map(class value -> share | null), hh, hv } (dB, null when the date is left out).
 */
export async function evolutionSeries({ dates, view, box, classes, stretch, urls, loadPixels }) {
  const values = classes.map((c) => c.value);
  const loaded = await Promise.all(dates.map(async (date) => {
    try {
      const [cls, rgb] = await Promise.all([loadPixels(urls.classes(date)), loadPixels(urls.image(date))]);
      return { date, cls, rgb };
    } catch {
      return { date, cls: null, rgb: null };
    }
  }));
  const first = loaded.find((x) => x.cls);
  const win = first && pixelWindow(view, box, first.cls.width, first.cls.height);
  const empty = (date) => ({ date, shares: new Map(values.map((v) => [v, null])), hh: null, hv: null });
  if (!win) return loaded.map((x) => empty(x.date));
  const size = (win.x1 - win.x0) * (win.y1 - win.y0);
  const masks = loaded.map((x) => (x.cls ? coverage(x.cls.data, x.cls.width, win) : new Uint8Array(size)));
  const { mask, keep } = commonMask(masks);
  return loaded.map((x, i) => (!keep[i] ? empty(x.date) : {
    date: x.date,
    shares: classShares(x.cls.data, x.cls.width, win, values, mask),
    hh: meanDb(x.rgb.data, x.rgb.width, win, 0, stretch.HH, mask),
    hv: meanDb(x.rgb.data, x.rgb.width, win, 1, stretch.HV, mask),
  }));
}
