/**
 * Terrain for the flood scenario: Terrain Tiles on AWS Open Data (Terrarium PNG, elevation in metres =
 * R*256 + G + B/256 - 32768). Over Uruguay they come from NASA SRTM (~30 m). Fetched in the browser, CORS open.
 * https://registry.opendata.aws/terrain-tiles/
 */
const URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const TILE = 256;
export const TERRAIN_ATTRIBUTION = 'Terrain: NASA SRTM via Terrain Tiles (AWS Open Data, Mapzen)';

const lonToX = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const latToY = (lat, z) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z; };
const xToLon = (x, z) => (x / 2 ** z) * 360 - 180;
const yToLat = (y, z) => { const n = Math.PI - (2 * Math.PI * y) / 2 ** z; return (180 / Math.PI) * Math.atan(Math.sinh(n)); };

/** Deepest zoom (<= 13, about SRTM's 30 m at Uruguay's latitude) whose tiles over bbox are at most maxTiles. */
export function terrainZoom([w, s, e, n], maxTiles = 16) {
  for (let z = 13; z > 6; z--) {
    const nx = Math.floor(lonToX(e, z)) - Math.floor(lonToX(w, z)) + 1;
    const ny = Math.floor(latToY(s, z)) - Math.floor(latToY(n, z)) + 1;
    if (nx * ny <= maxTiles) return z;
  }
  return 6;
}

function loadImage(url) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  return img.decode().then(() => img);
}

/**
 * Elevation grid covering bbox, in Web Mercator pixels of one zoom level. Returns
 * {elev, width, height, index(lon, lat) -> cell or -1, toPixel(lon, lat), toLonLat(col, row), corners} (corners: for a map image source).
 */
export async function loadTerrain(bbox, z = terrainZoom(bbox)) {
  const [w, s, e, n] = bbox;
  const tx0 = Math.floor(lonToX(w, z));
  const tx1 = Math.floor(lonToX(e, z));
  const ty0 = Math.floor(latToY(n, z));
  const ty1 = Math.floor(latToY(s, z));
  const width = (tx1 - tx0 + 1) * TILE;
  const height = (ty1 - ty0 + 1) * TILE;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const jobs = [];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const url = URL.replace('{z}', z).replace('{x}', tx).replace('{y}', ty);
      jobs.push(loadImage(url).then((img) => ctx.drawImage(img, (tx - tx0) * TILE, (ty - ty0) * TILE)).catch(() => {}));
    }
  }
  await Promise.all(jobs);
  const px = ctx.getImageData(0, 0, width, height).data;
  const elev = new Float32Array(width * height);
  for (let i = 0; i < elev.length; i++) {
    elev[i] = px[i * 4 + 3] === 0 ? NaN : px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;
  }
  const ox = tx0 * TILE;
  const oy = ty0 * TILE;
  const toPixel = (lon, lat) => [lonToX(lon, z) * TILE - ox, latToY(lat, z) * TILE - oy];
  const index = (lon, lat) => {
    const [c, r] = toPixel(lon, lat).map(Math.floor);
    return c >= 0 && c < width && r >= 0 && r < height ? r * width + c : -1;
  };
  const toLonLat = (c, r) => [xToLon((c + ox) / TILE, z), yToLat((r + oy) / TILE, z)];
  const corners = [toLonLat(0, 0), toLonLat(width, 0), toLonLat(width, height), toLonLat(0, height)];
  return { elev, width, height, index, toPixel, toLonLat, corners, z };
}
