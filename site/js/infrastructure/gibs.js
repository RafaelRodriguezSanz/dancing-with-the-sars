export const GIBS_LAYER = 'NISAR_L2_Geocoded_Polarimetric_Covariance';
export const GIBS_MAX_NATIVE_ZOOM = 13;

/** Leaflet template: {z}/{y}/{x} are filled by Leaflet (WMTS order is row=y, col=x). */
export function gibsTileUrl(date, layer = GIBS_LAYER) {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${date}/GoogleMapsCompatible_Level13/{z}/{y}/{x}.png`;
}
