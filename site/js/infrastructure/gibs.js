export const GIBS_LAYER = 'NISAR_L2_Geocoded_Polarimetric_Covariance';
export const GIBS_MAX_NATIVE_ZOOM = 13;

/** Tile template: {z}/{y}/{x} are filled by the map (WMTS order is row=y, col=x). */
export function gibsTileUrl(date, layer = GIBS_LAYER) {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${date}/GoogleMapsCompatible_Level13/{z}/{y}/{x}.png`;
}

export const GIBS_OPTICAL_LAYER = 'VIIRS_SNPP_CorrectedReflectance_TrueColor';
export const GIBS_OPTICAL_MAX_NATIVE_ZOOM = 9;

/** Optical true-colour tiles of the same day, to compare with the radar. Anything that is not a YYYY-MM-DD date (the country mosaic key) gets the newest image. */
export function gibsOpticalTileUrl(date, layer = GIBS_OPTICAL_LAYER) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ? date : 'default';
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${day}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;
}
