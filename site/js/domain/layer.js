/**
 * A map layer = one type of surface change. Pure data + helpers (no DOM, no Leaflet, no fetch).
 *
 * spec: {
 *   id, title, description, caveat,
 *   usesDate: boolean,                 // true if the global date selector drives this layer
 *   region: { name, bbox:[w,s,e,n] },  // where the layer demonstrates the signal
 *   legend: [{ color, label }],
 *   tiers: [Tier]                      // ordered cheapest -> best
 * }
 * Tier: { id, label, kind:'tiles', url:(date|null)=>string with {z}/{x}/{y},
 *         minZoom?, maxNativeZoom?, attribution }
 */
export function defineLayer(spec) {
  for (const k of ['id', 'title', 'description', 'caveat', 'region', 'tiers']) {
    if (!spec[k]) throw new Error(`layer is missing "${k}"`);
  }
  if (!Array.isArray(spec.tiers) || spec.tiers.length === 0) throw new Error(`layer ${spec.id} needs at least one tier`);
  for (const t of spec.tiers) {
    if (!t.id || typeof t.url !== 'function') throw new Error(`layer ${spec.id} has an invalid tier`);
  }
  return Object.freeze({ usesDate: false, legend: [], ...spec });
}

/** Best tier available at this zoom (higher index = better); tier 0 is always the floor. */
export function tierForZoom(layer, zoom) {
  let chosen = layer.tiers[0];
  for (const t of layer.tiers) if ((t.minZoom ?? 0) <= zoom) chosen = t;
  return chosen;
}
