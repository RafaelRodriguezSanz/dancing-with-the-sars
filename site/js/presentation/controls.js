import { stepDate } from '../application/selectDate.js';
import { DatePicker } from './datePicker.js';

/** DOM controls: date calendar, prev/next, opacity, status. No Leaflet here. */
export class Controls {
  constructor(doc, { onDate, onOpacity, onReset }) {
    this.el = {
      select: doc.getElementById('date-select'),
      prev: doc.getElementById('prev'),
      next: doc.getElementById('next'),
      info: doc.getElementById('scene-info'),
      opacity: doc.getElementById('opacity'),
      status: doc.getElementById('status'),
      reset: doc.getElementById('reset'),
    };
    this.doc = doc;
    this.entries = [];
    this.current = null;
    this.onDate = onDate;
    this.picker = new DatePicker(doc, this.el.select, doc.getElementById('date-cal'), (d) => this.select(d));
    this.quality = null; // date -> 'best' | 'data' | 'none', set by main for the calendar colours
    this.el.prev.addEventListener('click', () => this.step(-1));
    this.el.next.addEventListener('click', () => this.step(1));
    this.el.opacity.addEventListener('input', () => onOpacity(Number(this.el.opacity.value) / 100));
    this.el.reset.addEventListener('click', onReset);
  }

  setStatus(text) { this.el.status.textContent = text; }

  setEntries(entries, defaultDate) {
    this.entries = entries;
    this.picker.setEntries(entries, this.quality);
    this.select(defaultDate);
  }

  select(date) {
    this.current = date;
    const e = this.entries.find((x) => x.date === date);
    this.picker.setValue(date, e ? optionLabel(e) + (this.badge?.(e.date) ?? '') : null);
    const tracks = e && e.tracks.length ? e.tracks.join(', ') : '?';
    const dirs = e && e.directions.length ? e.directions.join(', ') : 'unknown direction';
    const share = e && e.aoiCoverage != null ? ` / ${Math.round(e.aoiCoverage * 100)}% of area imaged` : '';
    this.el.info.textContent = e?.info ?? (e
      ? `Track ${tracks} / ${dirs}${share}${e.covered ? '' : ' / outside GIBS coverage, no tiles'}`
      : 'No scene selected');
    this.el.prev.disabled = !date || stepDate(this.entries, date, -1) === null;
    this.el.next.disabled = !date || stepDate(this.entries, date, 1) === null;
    this.onDate(date ?? null, Boolean(e && e.covered)); // calibrated layers do not need GIBS coverage
  }

  step(direction) {
    const d = stepDate(this.entries, this.current, direction);
    if (d) this.select(d);
  }
}

function optionLabel(e) {
  if (e.label) return e.label;
  if (!e.covered) return `${e.date} (no GIBS tiles)`;
  if (!e.usable) return `${e.date} (partial, ${Math.round(e.aoiCoverage * 100)}%)`;
  return e.date;
}
