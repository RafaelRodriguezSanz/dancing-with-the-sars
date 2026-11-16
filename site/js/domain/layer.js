/**
 * A map layer = one type of surface change. Pure data + helpers (no DOM, no Leaflet, no fetch).
 *
 * spec: {
 *   id, title, description, caveat,
 *   usesDate: boolean,                 // true if the global date selector drives this layer
 *   startsOff: boolean,                // true if the layer is unchecked when the page opens
 *   region: { name, bbox:[w,s,e,n] },  // where the layer demonstrates the signal
 *   legend: [{ color, label }],
 *   tiers: [Tier]                      // ordered cheapest -> best
 * }
 * Tier: { id, label, kind:'tiles'|'image'|'classes'|'classTiles'|'geojson', url:(date|null)=>string, minZoom? (map zoom, MapLibre scale), available?(date), attribution }
 *   tiles: url has {z}/{x}/{y}; optional maxNativeZoom
 *   geojson: features with properties.kind, drawn as outlines, filtered by the layer's classes
 *   image: one pre-cut picture per date covering bbox:[w,s,e,n] (lon/lat grid), or bbox:'area' = the selected area
 */
export function defineLayer(spec) {
  for (const k of ['id', 'title', 'description', 'caveat', 'region', 'tiers']) {
    if (!spec[k]) throw new Error(`layer is missing "${k}"`);
  }
  if (!Array.isArray(spec.tiers) || spec.tiers.length === 0) throw new Error(`layer ${spec.id} needs at least one tier`);
  for (const t of spec.tiers) {
    if (!t.id || typeof t.url !== 'function') throw new Error(`layer ${spec.id} has an invalid tier`);
    if (t.kind === 'image' && t.bbox !== 'area' && !(Array.isArray(t.bbox) && t.bbox.length === 4)) throw new Error(`layer ${spec.id}: image tier needs bbox`);
  }
  return Object.freeze({ usesDate: false, legend: [], ...spec });
}

/**
 * Zoom range [minzoom, maxzoom) of each tier usable on this date, so the map can hold them all at once and
 * switch smoothly while zooming. Tier 0 is the floor; a tier with available(date) is skipped for dates
 * it has no data for; each tier ends where the next usable one starts.
 */
export function tierZoomRanges(layer, date = null) {
  const usable = layer.tiers.filter((t, i) => i === 0 || !t.available || t.available(date));
  return usable.map((tier, i) => ({ tier, minzoom: i === 0 ? 0 : tier.minZoom ?? 0, maxzoom: usable[i + 1]?.minZoom ?? 24 }));
}
