/**
 * Start-up screen for the country view: a radar sweep over the area (MapView.setScanning) and a card listing
 * what is being loaded. The NISAR analysis itself was computed beforehand (scripts/nisar_subset.py); this only
 * shows the page loading it, and says so. Stays at least MIN_MS so the sweep is seen.
 * Before the map is drawn a full-screen intro shows a spinning planet with NISAR on its orbit; it fades out once
 * the land cover starts drawing (progress >= SPLASH_UNTIL) and at least SPLASH_MIN_MS have passed.
 */
const MIN_MS = 2500;
const SPLASH_MIN_MS = 2200;
const SPLASH_UNTIL = 0.6;
const FLIGHT_MS = 4500; // MapView's first flight, from about 1000 km out; the radar sweep lasts until it lands
const SPLASH_HTML = `
  <div class="splash-stars" aria-hidden="true"></div>
  <div class="planet-wrap" aria-hidden="true">
    <div class="planet-glow"></div>
    <div class="planet"><div class="planet-land"></div><div class="planet-shade"></div></div>
    <div class="pulse"></div><div class="pulse p2"></div><div class="pulse p3"></div>
    <div class="orbit"><div class="sat"><i></i><b></b></div></div>
  </div>
  <h1 class="splash-title">Dancing with the SARs</h1>
  <p class="splash-sub">NISAR L-band radar &middot; land change you can watch</p>
  <div class="splash-bar"><i></i></div>
  <p class="splash-step"></p>`;

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
    this.splash = doc.createElement('div');
    this.splash.className = 'splash';
    this.splash.setAttribute('role', 'status');
    this.splash.innerHTML = SPLASH_HTML;
    doc.body.append(this.splash);
    this.gone = new Promise((r) => { this.splashGone = r; }); // resolves when the intro starts fading
    map.quiet = true; // the loading pill would repeat this card
    this.step(0.05, 'Starting...');
  }

  step(progress, text) {
    if (!this.active) return;
    this.el.querySelector('progress').value = progress;
    this.el.querySelector('.boot-step').textContent = text;
    this.map.setScanning(this.bbox, progress);
    this.splashStep(progress, text);
  }

  splashStep(progress, text) {
    if (!this.splash) return;
    this.splash.querySelector('.splash-bar i').style.width = `${Math.round(progress * 100)}%`;
    this.splash.querySelector('.splash-step').textContent = text;
    if (progress >= SPLASH_UNTIL) this.hideSplash();
  }

  hideSplash() {
    if (!this.splash || this.splashClosing) return;
    this.splashClosing = true;
    const s = this.splash;
    setTimeout(() => {
      this.splashGone();
      s.classList.add('splash-out');
      setTimeout(() => { s.remove(); if (this.splash === s) this.splash = null; }, 900);
    }, Math.max(0, SPLASH_MIN_MS - (Date.now() - this.started)));
  }

  async done(text = 'Ready') {
    if (!this.active || this.closing) return;
    this.closing = true;
    this.el.querySelector('progress').value = 1;
    this.el.querySelector('.boot-step').textContent = text;
    this.map.setScanning(this.bbox, 1);
    this.splashStep(1, text);
    await new Promise((r) => setTimeout(r, Math.max(0, MIN_MS - (Date.now() - this.started))));
    await this.gone;
    await new Promise((r) => setTimeout(r, FLIGHT_MS));
    this.active = false;
    this.map.setScanning(null);
    this.map.quiet = false;
    this.map.setBusy('boot', null); // shows the pill again if a layer is still loading
    this.el.classList.add('boot-out');
    setTimeout(() => this.el.remove(), 600);
  }
}
