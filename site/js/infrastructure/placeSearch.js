/**
 * Country or place name -> bounding box, from OpenStreetMap Nominatim (free, CORS open; light use only:
 * one request per search). https://operations.osmfoundation.org/policies/nominatim/
 */
const URL = 'https://nominatim.openstreetmap.org/search';

/** Resolves {name, bbox:[w,s,e,n]} of the best match, or null when nothing is found. */
export async function findPlace(fetchFn, query) {
  const q = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1', 'accept-language': 'en' });
  const r = await fetchFn(`${URL}?${q}`);
  if (!r.ok) throw new Error(`Nominatim HTTP ${r.status}`);
  const [hit] = await r.json();
  if (!hit?.boundingbox) return null;
  const [s, n, w, e] = hit.boundingbox.map(Number);
  return { name: hit.name || hit.display_name, bbox: [w, s, e, n] };
}
