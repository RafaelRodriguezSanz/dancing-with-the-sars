/**
 * Pure helpers for the evolution view: which pixels of a whole-box raster (regular lon/lat grid)
 * fall inside the map view, and what they contain. No DOM.
 * Every date is measured over the same pixels (`mask`), so shares do not jump when a pass
 * covers only part of the view.
 */

/** Pixel window {x0, y0, x1, y1} (end exclusive) of `view` [w,s,e,n] inside a raster covering `box`; null if outside. */
export function pixelWindow(view, box, width, height) {
  const [w, s, e, n] = box;
  const x0 = Math.max(0, Math.floor((view[0] - w) / (e - w) * width));
  const x1 = Math.min(width, Math.ceil((view[2] - w) / (e - w) * width));
  const y0 = Math.max(0, Math.floor((n - view[3]) / (n - s) * height));
  const y1 = Math.min(height, Math.ceil((n - view[1]) / (n - s) * height));
  return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null;
}

/** Calls fn(rgbaIndex, maskIndex) for every pixel of the window. */
function eachPixel(width, win, fn) {
  let k = 0;
  for (let y = win.y0; y < win.y1; y += 1) {
    for (let x = win.x0; x < win.x1; x += 1) { fn((y * width + x) * 4, k); k += 1; }
  }
}

/** 1 where the class raster has data (value > 0) inside the window. */
export function coverage(data, width, win) {
  const m = new Uint8Array((win.x1 - win.x0) * (win.y1 - win.y0));
  eachPixel(width, win, (i, k) => { m[k] = data[i] > 0 ? 1 : 0; });
  return m;
}

/**
 * Pixels seen on every date that covers most of the view. Dates covering less than `minShare`
 * of the best-covered date are left out (returned in `dropped`), so one narrow pass cannot shrink the view.
 */
export function commonMask(masks, minShare = 0.5) {
  const sums = masks.map((m) => m.reduce((a, b) => a + b, 0));
  const best = Math.max(0, ...sums);
  const keep = masks.map((_, i) => best > 0 && sums[i] >= minShare * best);
  const mask = new Uint8Array(masks[0]?.length ?? 0).fill(1);
  masks.forEach((m, i) => { if (keep[i]) for (let k = 0; k < m.length; k += 1) mask[k] &= m[k]; });
  return { mask, keep };
}

/** Share of each class value over the masked pixels. `data` is RGBA, class value in R. */
export function classShares(data, width, win, values, mask) {
  const counts = new Map(values.map((v) => [v, 0]));
  let total = 0;
  eachPixel(width, win, (i, k) => {
    if (!mask[k]) return;
    total += 1;
    const v = data[i];
    if (counts.has(v)) counts.set(v, counts.get(v) + 1);
  });
  return new Map([...counts].map(([v, c]) => [v, total ? c / total : null]));
}

/** Mean of one RGBA channel over the masked pixels, turned back into dB with the fixed stretch [lo, hi]. */
export function meanDb(data, width, win, channel, [lo, hi], mask) {
  let sum = 0; let n = 0;
  eachPixel(width, win, (i, k) => {
    if (!mask[k] || data[i + 3] === 0) return;
    sum += lo + data[i + channel] / 255 * (hi - lo);
    n += 1;
  });
  return n ? sum / n : null;
}
