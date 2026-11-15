/**
 * Floating panel over the map: plays the dates in order and draws one small line per series
 * (class shares and mean backscatter of the current view). Time runs at a real pace: a frame lasts
 * in proportion to the days until the next date, the map cross-fades over the whole frame and the
 * cursor glides over a time axis. No map library here.
 */
const W = 220; const H = 30;
const SVG = 'http://www.w3.org/2000/svg';
const MS_PER_DAY = 250; // ~4 days per second
const MIN_MS = 500; const MAX_MS = 3000; // close dates still show; long gaps do not stall
const JUMP_MS = 300; // clicks and the first frame
const DAY = 86400000;

export class EvolutionPanel {
  constructor(el, { onDate }) {
    this.el = el;
    this.onDate = onDate; // (date, fade ms)
    this.timer = null;
    this.rows = [];
    this.index = 0;
    el.querySelector('.evo-close').addEventListener('click', () => this.close());
    this.playBtn = el.querySelector('.evo-play');
    this.playBtn.addEventListener('click', () => (this.timer ? this.pause() : this.play()));
    this.body = el.querySelector('.evo-body');
    this.title = el.querySelector('.evo-date');
  }

  /** series: [{ label, color, unit: '%'|'dB', values: number|null per row }] */
  open(rows, series, note) {
    this.rows = rows;
    this.series = series;
    const t = rows.map((r) => Date.parse(r.date));
    const span = Math.max(t[t.length - 1] - t[0], 1);
    this.xs = t.map((v) => (rows.length < 2 ? W / 2 : (v - t[0]) / span * W)); // real time axis
    this.frames = t.map((v, i) => (i + 1 < t.length ? Math.min(MAX_MS, Math.max(MIN_MS, (t[i + 1] - v) / DAY * MS_PER_DAY)) : MIN_MS));
    this.el.hidden = false;
    this.body.replaceChildren(...series.map((s) => this.line(s)));
    if (note) { const p = document.createElement('p'); p.className = 'evo-note'; p.textContent = note; this.body.append(p); }
    this.goTo(0);
    this.play();
  }

  line(s) {
    const row = document.createElement('div');
    row.className = 'evo-row';
    const label = document.createElement('span');
    label.className = 'evo-label';
    const swatch = document.createElement('i');
    swatch.className = 'swatch';
    swatch.style.background = s.color;
    label.append(swatch, s.label);
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'evo-spark');
    svg.setAttribute('preserveAspectRatio', 'none'); // stretch to the row width; clicks map linearly to dates
    const vals = s.values.filter((v) => v != null);
    const lo = Math.min(...vals); const hi = Math.max(...vals);
    const x = (i) => this.xs[i];
    const y = (v) => (hi === lo ? H / 2 : H - 3 - (v - lo) / (hi - lo) * (H - 6));
    let d = ''; let pen = 'M';
    s.values.forEach((v, i) => { if (v == null) { pen = 'M'; return; } d += `${pen}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = 'L'; });
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', d); path.setAttribute('stroke', s.color); path.setAttribute('fill', 'none'); path.setAttribute('stroke-width', '1.5');
    const cursor = document.createElementNS(SVG, 'line');
    cursor.setAttribute('x1', '0'); cursor.setAttribute('x2', '0'); cursor.setAttribute('y1', '0'); cursor.setAttribute('y2', String(H));
    cursor.setAttribute('class', 'evo-cursor');
    svg.append(path, cursor);
    svg.addEventListener('click', (ev) => { // jump to the date nearest the click on the time axis
      const r = svg.getBoundingClientRect();
      const at = (ev.clientX - r.left) / r.width * W;
      this.pause();
      this.goTo(this.xs.reduce((best, v, i) => (Math.abs(v - at) < Math.abs(this.xs[best] - at) ? i : best), 0));
    });
    const value = document.createElement('span');
    value.className = 'evo-value';
    row.append(label, svg, value);
    row.update = (i, ms) => {
      cursor.style.transition = `transform ${ms}ms linear`;
      cursor.style.transform = `translateX(${x(i)}px)`; // user units of the viewBox
      const v = s.values[i];
      value.textContent = v == null ? 'no data' : s.unit === '%' ? `${(v * 100).toFixed(1)}%` : `${v.toFixed(1)} dB`;
    };
    return row;
  }

  /** Show date i; `ms` is how long the map fade and the cursor glide take to get there. */
  goTo(i, ms = JUMP_MS) {
    this.index = Math.max(0, Math.min(i, this.rows.length - 1));
    const date = this.rows[this.index]?.date;
    this.title.textContent = date ? `${date} (${this.index + 1}/${this.rows.length})` : '';
    for (const r of this.body.querySelectorAll('.evo-row')) r.update(this.index, ms);
    if (date) this.onDate(date, ms);
  }

  play() {
    this.pause();
    if (this.index >= this.rows.length - 1) this.goTo(0);
    this.playBtn.textContent = 'Pause';
    this.el.classList.add('playing');
    const step = () => { // the move to the next date takes as long as the days between them
      if (this.index >= this.rows.length - 1) { this.pause(); return; }
      const ms = this.frames[this.index];
      this.goTo(this.index + 1, ms);
      this.timer = setTimeout(step, ms);
    };
    this.timer = setTimeout(step, JUMP_MS);
  }

  pause() {
    clearTimeout(this.timer);
    this.timer = null;
    this.playBtn.textContent = 'Play';
    this.el.classList.remove('playing');
  }

  close() { this.pause(); this.el.hidden = true; }
}
