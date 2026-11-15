/**
 * Month calendar for the acquisition dates, opened from the date button. Each day shows what it has:
 *   best  radar products with high-resolution (~16 m) tiles: highlighted
 *   data  radar products (80 m) ready for this area
 *   none  NISAR passed but there are no products for it here (not processed, partial or a calibration outlier)
 *   off   no NISAR pass that day (not selectable)
 * Entries without a calendar date (the "latest mosaic") get their own button under the grid.
 */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const pad = (n) => String(n).padStart(2, '0');
const LEGEND = [['best', 'High-res 16 m'], ['data', 'Radar products'], ['none', 'Pass, no products']];

export class DatePicker {
  /** button: the toggle; pop: an empty element for the calendar; onPick(date). */
  constructor(doc, button, pop, onPick) {
    this.doc = doc;
    this.button = button;
    this.pop = pop;
    this.onPick = onPick;
    this.entries = [];
    this.quality = () => 'data';
    this.value = null;
    this.month = null; // [year, month 0-11] shown
    button.addEventListener('click', () => (this.pop.hidden ? this.open() : this.close()));
    pop.addEventListener('click', (ev) => this.onClick(ev));
    doc.addEventListener('pointerdown', (ev) => {
      if (!this.pop.hidden && !this.pop.contains(ev.target) && !this.button.contains(ev.target)) this.close();
    });
    doc.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !this.pop.hidden) { this.close(); this.button.focus(); } });
    window.addEventListener('resize', () => this.place());
  }

  /** quality(date) -> 'best' | 'data' | 'none'. */
  setEntries(entries, quality) {
    this.entries = entries;
    this.quality = quality ?? (() => 'data');
    if (!this.pop.hidden) this.render();
  }

  setValue(date, label) {
    this.value = date;
    this.button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg><span></span>';
    this.button.querySelector('span').textContent = label ?? 'No date';
    const q = date && isDay(date) ? this.quality(date) : null;
    this.button.dataset.quality = q ?? '';
  }

  open() {
    const days = this.entries.filter((e) => isDay(e.date)).map((e) => e.date);
    const at = isDay(this.value) ? this.value : days.at(-1);
    if (!at) return;
    this.month = [Number(at.slice(0, 4)), Number(at.slice(5, 7)) - 1];
    this.pop.hidden = false;
    this.button.setAttribute('aria-expanded', 'true');
    this.render();
    this.place();
  }

  close() {
    this.pop.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
  }

  /** Under the button, kept inside the window (the popover lives outside the scrolling card). */
  place() {
    if (this.pop.hidden) return;
    const r = this.button.getBoundingClientRect();
    const w = this.pop.offsetWidth;
    this.pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
    this.pop.style.top = `${r.bottom + 6}px`;
  }

  render() {
    const [y, m] = this.month;
    const days = new Map(this.entries.filter((e) => isDay(e.date)).map((e) => [e.date, e]));
    const keys = [...days.keys()].sort();
    const ym = (d) => d.slice(0, 7);
    const cur = `${y}-${pad(m + 1)}`;
    const first = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7; // Monday first
    const count = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const cells = Array.from({ length: first }, () => '<span></span>');
    for (let d = 1; d <= count; d++) {
      const date = `${cur}-${pad(d)}`;
      const e = days.get(date);
      const q = e ? this.quality(date) : 'off';
      const sel = date === this.value ? ' selected' : '';
      const tip = e ? `${date}: ${LEGEND.find(([k]) => k === q)?.[1] ?? ''}` : `${date}: no NISAR pass`;
      cells.push(`<button type="button" class="day ${q}${sel}" data-date="${date}" title="${tip}"${e ? '' : ' disabled'}>${d}</button>`);
    }
    const extra = this.entries.filter((e) => !isDay(e.date));
    this.pop.innerHTML = `
      <div class="cal-head">
        <button type="button" class="icon" data-month="-1" aria-label="Previous month"${keys.length && ym(keys[0]) < cur ? '' : ' disabled'}>&#8249;</button>
        <strong>${MONTHS[m]} ${y}</strong>
        <button type="button" class="icon" data-month="1" aria-label="Next month"${keys.length && ym(keys.at(-1)) > cur ? '' : ' disabled'}>&#8250;</button>
      </div>
      <div class="cal-grid">${WEEKDAYS.map((w) => `<span class="wd">${w}</span>`).join('')}${cells.join('')}</div>
      ${extra.map((e) => `<button type="button" class="cal-extra${e.date === this.value ? ' selected' : ''}" data-date="${e.date}">${e.label ?? e.date}</button>`).join('')}
      <div class="cal-legend">${LEGEND.map(([k, t]) => `<span><i class="dot ${k}"></i>${t}</span>`).join('')}</div>`;
  }

  onClick(ev) {
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.month) {
      const [y, m] = this.month;
      const d = new Date(Date.UTC(y, m + Number(b.dataset.month), 1));
      this.month = [d.getUTCFullYear(), d.getUTCMonth()];
      this.render();
      return;
    }
    if (b.dataset.date) { this.close(); this.onPick(b.dataset.date); }
  }
}
