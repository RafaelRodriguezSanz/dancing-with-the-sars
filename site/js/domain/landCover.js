/**
 * Land-cover classes read from NISAR L-band HH/HV with simple thresholds
 * (same rules as scripts/nisar_subset.py, CLASSES). Pure data + pixel helper; no DOM.
 */
export const LAND_COVER_CLASSES = Object.freeze([
  { value: 5, key: 'permanent-water', label: 'Permanent water', color: [28, 78, 168], alpha: 0.9,
    rule: 'Very low HH and HV on the median of all dates: rivers, lakes, reservoirs.',
    caveat: 'Rivers narrower than about two pixels (160 m from afar, 30 m zoomed in) can be missed.' },
  { value: 1, key: 'water', label: 'Water on this date only', color: [86, 196, 245], alpha: 0.95,
    rule: 'Very low HH and HV on this date, but not on most dates: flooding or high water.',
    caveat: 'Smooth bare or freshly tilled fields look the same.' },
  { value: 2, key: 'woody', label: 'Woody vegetation', color: [44, 122, 68], alpha: 0.8,
    rule: 'High HV: radar scatters inside branches and trunks.',
    caveat: 'Leafy towns read as woody here; turn on Built-up areas to cover them with the OpenStreetMap towns.' },
  { value: 3, key: 'double-bounce', label: 'Double bounce (flooded vegetation, structures)', color: [236, 84, 178], alpha: 0.95,
    rule: 'Very high HH, much higher than HV: double bounce (walls, or stems standing in water).',
    caveat: 'On a single date: flooded marsh or isolated buildings. Towns, bright on every date, are in the Built-up layer.' },
  { value: 4, key: 'herbaceous', label: 'Grassland and crops', color: [222, 200, 128], alpha: 0.4,
    rule: 'Everything else with data.',
    caveat: 'Pasture and crops are not separated here.' },
]);

/**
 * Colour a class raster. `src` is RGBA pixel data of the grayscale class PNG (class value in R).
 * Classes not in `enabled` (a Set of values) and no-data pixels become transparent. Each class has its own
 * opacity: the most common one (grassland) stays light so the terrain shows through and the rarer classes stand out.
 */
export function paintClasses(src, enabled, classes = LAND_COVER_CLASSES, alpha = 255) {
  const colors = new Map(classes.map((c) => [c.value, [...c.color, Math.round(alpha * (c.alpha ?? 1))]]));
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const v = src[i];
    if (!enabled.has(v)) continue;
    const c = colors.get(v);
    if (!c) continue;
    out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = c[3];
  }
  return out;
}
