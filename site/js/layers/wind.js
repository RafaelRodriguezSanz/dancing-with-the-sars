import { defineLayer } from '../domain/layer.js';
import { URUGUAY } from '../domain/scene.js';
import { DATA } from './nisarCalibrated.js';
import { WindRepository } from '../infrastructure/windRepository.js';
import { WindFlow } from '../presentation/windFlow.js';

const repo = new WindRepository((...a) => fetch(...a));

/** Date and UTC hour of the radar pass shown: from the area's manifest ("09:40 UTC" -> 10); 'latest' = newest mosaic date. */
async function passTime(date) {
  let day = date;
  let hour = 12;
  try {
    const m = await fetch(`${DATA.dir}/manifest.json`).then((r) => r.json());
    if (date === m.mosaic?.key) day = m.mosaic.last;
    const hm = /(\d{2}):(\d{2})/.exec(m.scenes?.[day]?.pass ?? '');
    if (hm) hour = Math.min(23, Math.round(Number(hm[1]) + Number(hm[2]) / 60));
  } catch { /* no manifest: noon */ }
  return { day, hour };
}

export default defineLayer({
  id: 'wind',
  title: 'Wind at the radar pass',
  description: 'Animated wind 10 m above the ground at the hour of the selected NISAR pass: lines drift with the wind, coloured by speed. Wind roughens open water, which then looks bright to the radar instead of dark, so strong wind can hide water and floods; a south-east wind (sudestada) also piles up water on the Río de la Plata coast.',
  caveat: 'Weather-model wind (Open-Meteo historical forecast, about 10-25 km grid), smoothed between grid points; not station measurements.',
  region: { name: 'Uruguay', bbox: URUGUAY.bbox },
  usesDate: true,
  tiers: [{
    id: 'wind', label: 'Open-Meteo wind 10 m', kind: 'custom',
    url: (date) => `wind:${date}`,
    async mount(mapView, date, bbox) {
      const { day, hour } = await passTime(date);
      const field = await repo.field(bbox, day, hour);
      return new WindFlow(mapView.map, field, 'Wind 10 m');
    },
    attribution: 'Wind: Open-Meteo (CC BY 4.0)',
  }],
});
