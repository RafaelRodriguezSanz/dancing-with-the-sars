/**
 * Lets the user pick the area of interest: drag a rectangle (mouse or finger) or take the current view.
 * Library-free: coordinates and the preview come from MapView. While drawing, a transparent sheet covers
 * the map so the map's own pan/rotate gestures never see the drag.
 */
export class AreaSelector {
  constructor(mapView, doc, { onArea, onError }) {
    this.view = mapView;
    this.drawBtn = doc.getElementById('draw-area');
    this.viewBtn = doc.getElementById('use-view');
    this.onArea = onArea;
    this.onError = onError;
    this.drawing = false;
    this.drawBtn.addEventListener('click', () => this.setDrawing(!this.drawing));
    this.viewBtn.addEventListener('click', () => {
      const [w, s, e, n] = this.view.viewBox();
      this.emit([w, s], [e, n]);
    });
    const el = doc.createElement('div');
    el.className = 'draw-sheet';
    el.hidden = true;
    this.view.overlayParent().append(el);
    this.sheet = el;
    this.box = doc.createElement('div'); // preview drawn in screen pixels: shows at once, whatever the map does
    this.box.className = 'draw-box';
    this.box.hidden = true;
    el.append(this.box);
    el.addEventListener('pointerdown', (ev) => this.start(ev));
    el.addEventListener('pointermove', (ev) => this.move(ev));
    el.addEventListener('pointerup', (ev) => this.end(ev));
    el.addEventListener('pointercancel', () => this.cancel());
  }

  setDrawing(on) {
    this.drawing = on;
    this.drawBtn.textContent = on ? 'Cancel' : 'Draw area';
    this.drawBtn.classList.toggle('active', on);
    this.sheet.hidden = !on;
    if (!on) this.cancel();
  }

  start(ev) {
    if (!this.drawing) return;
    ev.preventDefault();
    this.sheet.setPointerCapture(ev.pointerId);
    this.origin = this.view.lngLatAt(ev.clientX, ev.clientY);
    this.startPx = [ev.clientX, ev.clientY];
    this.drawBox(ev);
    this.box.hidden = false;
    this.sheet.classList.add('dragging');
  }

  drawBox(ev) {
    const r = this.sheet.getBoundingClientRect();
    const [x0, y0] = this.startPx;
    Object.assign(this.box.style, {
      left: `${Math.min(x0, ev.clientX) - r.left}px`, top: `${Math.min(y0, ev.clientY) - r.top}px`,
      width: `${Math.abs(ev.clientX - x0)}px`, height: `${Math.abs(ev.clientY - y0)}px`,
    });
  }

  move(ev) {
    if (this.origin) this.drawBox(ev);
  }

  end(ev) {
    if (!this.origin) return;
    const a = this.origin;
    const b = this.view.lngLatAt(ev.clientX, ev.clientY);
    this.setDrawing(false);
    this.emit(a, b);
  }

  cancel() {
    this.box.hidden = true;
    this.sheet.classList.remove('dragging');
    this.origin = null;
  }

  emit(c1, c2) {
    try { this.onArea(c1, c2); } catch (e) { this.onError(e); }
  }
}
