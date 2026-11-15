/**
 * Start-up screen for the country view: a radar sweep over the area (MapView.setScanning) and a card listing
 * what is being loaded. The NISAR analysis itself was computed beforehand (scripts/nisar_subset.py); this only
 * shows the page loading it, and says so. Stays at least MIN_MS so the sweep is seen.
 */
const MIN_MS = 2500;

export class BootScreen {
  constructor(doc, map, bbox, title) {
    this.map = map;
    this.bbox = bbox;
    this.started = Date.now();
    this.active = true;
    this.el = doc.createElement('div');
    this.el.className = 'glass boot';
    this.el.setAttribute('role', 'status');
    this.el.innerHTML = '<strong></strong><progress max="1" value="0" class="process-bar"></progress><span class="boot-step"></span>';
    this.el.querySelector('strong').textContent = title;
    map.overlayParent().append(this.el);
    map.quiet = true; // the loading pill would repeat this card
    this.step(0.05, 'Starting...');
  }

  step(progress, text) {
    if (!this.active) return;
    this.el.querySelector('progress').value = progress;
    this.el.querySelector('.boot-step').textContent = text;
    this.map.setScanning(this.bbox, progress);
  }

  async done(text = 'Ready') {
    if (!this.active || this.closing) return;
    this.closing = true;
    this.el.querySelector('progress').value = 1;
    this.el.querySelector('.boot-step').textContent = text;
    this.map.setScanning(this.bbox, 1);
    await new Promise((r) => setTimeout(r, Math.max(0, MIN_MS - (Date.now() - this.started))));
    this.active = false;
    this.map.setScanning(null);
    this.map.quiet = false;
    this.map.setBusy('boot', null); // shows the pill again if a layer is still loading
    this.el.classList.add('boot-out');
    setTimeout(() => this.el.remove(), 600);
  }
}
