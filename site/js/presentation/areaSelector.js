/**
 * Lets the user pick the area of interest: drag a rectangle (mouse or finger) or take the current view.
 * Uses Leaflet only for coordinate conversion and the preview rectangle.
 */
export class AreaSelector {
  constructor(mapView, doc, { onArea, onError }) {
    this.map = mapView.map;
    this.drawBtn = doc.getElementById('draw-area');
    this.viewBtn = doc.getElementById('use-view');
    this.onArea = onArea;
    this.onError = onError;
    this.drawing = false;
    this.drawBtn.addEventListener('click', () => this.setDrawing(!this.drawing));
    this.viewBtn.addEventListener('click', () => {
      const b = this.map.getBounds();
      this.emit([b.getWest(), b.getSouth()], [b.getEast(), b.getNorth()]);
    });
    const el = this.map.getContainer();
    el.addEventListener('pointerdown', (ev) => this.start(ev));
    el.addEventListener('pointermove', (ev) => this.move(ev));
    el.addEventListener('pointerup', (ev) => this.end(ev));
    el.addEventListener('pointercancel', () => this.cancel());
  }

  setDrawing(on) {
    this.drawing = on;
    this.drawBtn.textContent = on ? 'Cancel' : 'Draw area';
    this.drawBtn.classList.toggle('active', on);
    this.map.getContainer().classList.toggle('drawing', on);
    if (on) this.map.dragging.disable();
    else { this.map.dragging.enable(); this.cancel(); }
  }

  latLng(ev) {
    const r = this.map.getContainer().getBoundingClientRect();
    return this.map.containerPointToLatLng([ev.clientX - r.left, ev.clientY - r.top]);
  }

  start(ev) {
    if (!this.drawing || ev.target.closest('.leaflet-control')) return;
    ev.preventDefault();
    this.map.getContainer().setPointerCapture(ev.pointerId);
    this.origin = this.latLng(ev);
    this.preview = L.rectangle([this.origin, this.origin], {
      color: '#ffd400', weight: 2, dashArray: '6 4', fillOpacity: 0.1, interactive: false,
    }).addTo(this.map);
  }

  move(ev) {
    if (this.origin) this.preview.setBounds([this.origin, this.latLng(ev)]);
  }

  end(ev) {
    if (!this.origin) return;
    const a = this.origin;
    const b = this.latLng(ev);
    this.setDrawing(false);
    this.emit([a.lng, a.lat], [b.lng, b.lat]);
  }

  cancel() {
    if (this.preview) this.map.removeLayer(this.preview);
    this.preview = null;
    this.origin = null;
  }

  emit(c1, c2) {
    try { this.onArea(c1, c2); } catch (e) { this.onError(e); }
  }
}
