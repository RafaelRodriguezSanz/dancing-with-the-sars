/**
 * Pure domain rule: is a GIBS tile real imagery? Where GIBS has no data it can answer with random
 * bytes (different on every request). Real SAR tiles are opaque and colourful; noise is
 * semi-transparent or grey. Keep in sync with scripts/probe_gibs_quality.py.
 */
export const MIN_CHROMA = 25;
export const MAX_PARTIAL_ALPHA = 0.05;
export const MIN_VISIBLE = 0.02;

/** @param {Uint8ClampedArray|number[]} rgba flat RGBA pixels. @returns {'empty'|'valid'|'corrupt'} */
export function classifyTile(rgba) {
  const n = Math.floor(rgba.length / 4);
  if (n === 0) return 'empty';
  let opaque = 0;
  let partial = 0;
  const chroma = [];
  for (let i = 0; i < n; i += 1) {
    const a = rgba[i * 4 + 3];
    if (a >= 250) {
      opaque += 1;
      const r = rgba[i * 4];
      const g = rgba[i * 4 + 1];
      const b = rgba[i * 4 + 2];
      chroma.push(Math.max(r, g, b) - Math.min(r, g, b));
    } else if (a > 0) {
      partial += 1;
    }
  }
  if (opaque / n < MIN_VISIBLE && partial / n < MIN_VISIBLE) return 'empty';
  chroma.sort((x, y) => x - y);
  const median = chroma.length ? chroma[Math.floor(chroma.length / 2)] : 0;
  return partial / n < MAX_PARTIAL_ALPHA && median >= MIN_CHROMA ? 'valid' : 'corrupt';
}
