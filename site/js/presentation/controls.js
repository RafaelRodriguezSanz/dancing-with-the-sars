import { stepDate } from '../application/selectDate.js';

/** DOM controls: date select, prev/next, opacity, status. No Leaflet here. */
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
    this.el.select.addEventListener('change', () => this.select(this.el.select.value));
    this.el.prev.addEventListener('click', () => this.step(-1));
    this.el.next.addEventListener('click', () => this.step(1));
    this.el.opacity.addEventListener('input', () => onOpacity(Number(this.el.opacity.value) / 100));
    this.el.reset.addEventListener('click', onReset);
  }

  setStatus(text) { this.el.status.textContent = text; }

  setEntries(entries, defaultDate) {
    this.entries = entries;
    this.el.select.replaceChildren(...entries.map((e) => {
      const o = this.doc.createElement('option');
      o.value = e.date;
      o.textContent = e.covered ? e.date : `${e.date} (no GIBS tiles)`;
      return o;
    }));
    this.select(defaultDate);
  }

  select(date) {
    this.current = date;
    this.el.select.value = date ?? '';
    const e = this.entries.find((x) => x.date === date);
    const tracks = e && e.tracks.length ? e.tracks.join(', ') : '?';
    const dirs = e && e.directions.length ? e.directions.join(', ') : 'unknown direction';
    this.el.info.textContent = e
      ? `Track ${tracks} / ${dirs}${e.covered ? '' : ' / outside GIBS coverage, no tiles'}`
      : 'No scene selected';
    this.el.prev.disabled = !date || stepDate(this.entries, date, -1) === null;
    this.el.next.disabled = !date || stepDate(this.entries, date, 1) === null;
    this.onDate(e && e.covered ? date : null);
  }

  step(direction) {
    const d = stepDate(this.entries, this.current, direction);
    if (d) this.select(d);
  }
}
