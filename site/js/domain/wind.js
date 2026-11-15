/** Wind field on a regular lon/lat grid: vectors from speed + direction, bilinear sampling. Pure. */

/** Meteorological direction is where the wind comes FROM (0 = from the north). Returns [u east, v north]. */
export function windVector(speed, fromDeg) {
  const r = (fromDeg * Math.PI) / 180;
  return [-speed * Math.sin(r), -speed * Math.cos(r)];
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compass = (fromDeg) => COMPASS[Math.round((((fromDeg % 360) + 360) % 360) / 45) % 8];

/** Grid points of bbox, row by row from the north-west corner: [[lon, lat], ...]. */
export function gridPoints([w, s, e, n], nx, ny) {
  const pts = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) pts.push([w + (i * (e - w)) / (nx - 1), n - (j * (n - s)) / (ny - 1)]);
  return pts;
}

/**
 * speeds/dirs: one value per grid point (gridPoints order). sample(lon, lat) -> [u, v] or null outside the box
 * or where a corner is missing. mean: vector-mean direction and mean speed, for the legend.
 */
export function windField(bbox, nx, ny, speeds, dirs) {
  const [w, s, e, n] = bbox;
  const u = new Float32Array(nx * ny);
  const v = new Float32Array(nx * ny);
  speeds.forEach((sp, k) => { [u[k], v[k]] = Number.isFinite(sp) && Number.isFinite(dirs[k]) ? windVector(sp, dirs[k]) : [NaN, NaN]; });
  const sample = (lon, lat) => {
    const x = ((lon - w) / (e - w)) * (nx - 1);
    const y = ((n - lat) / (n - s)) * (ny - 1);
    if (!(x >= 0 && y >= 0 && x <= nx - 1 && y <= ny - 1)) return null;
    const i = Math.min(Math.floor(x), nx - 2);
    const j = Math.min(Math.floor(y), ny - 2);
    const fx = x - i;
    const fy = y - j;
    const at = (a, di, dj) => a[(j + dj) * nx + i + di];
    const mix = (a) => (at(a, 0, 0) * (1 - fx) + at(a, 1, 0) * fx) * (1 - fy) + (at(a, 0, 1) * (1 - fx) + at(a, 1, 1) * fx) * fy;
    const r = [mix(u), mix(v)];
    return Number.isFinite(r[0]) && Number.isFinite(r[1]) ? r : null;
  };
  const ok = speeds.filter(Number.isFinite);
  const mu = u.reduce((a, x) => a + (Number.isFinite(x) ? x : 0), 0);
  const mv = v.reduce((a, x) => a + (Number.isFinite(x) ? x : 0), 0);
  const mean = ok.length
    ? { speed: ok.reduce((a, x) => a + x, 0) / ok.length, from: ((Math.atan2(-mu, -mv) * 180) / Math.PI + 360) % 360 }
    : null;
  return { bbox, nx, ny, u, v, sample, mean };
}
