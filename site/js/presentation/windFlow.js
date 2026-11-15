/**
 * Animated wind: short-lived particles drift with the wind field and leave fading trails, drawn on a canvas
 * laid over the map. Particles live in screen space; each frame asks the field for the wind under them.
 */
import { compass } from '../domain/wind.js';

// White trails, brighter with speed: every hue on the map already means something (land cover, alerts, towns).
const SPEED_BINS = [[10, 'rgba(255,255,255,.3)'], [20, 'rgba(255,255,255,.45)'], [30, 'rgba(255,255,255,.6)'], [40, 'rgba(255,255,255,.75)'], [55, 'rgba(255,255,255,.9)'], [Infinity, '#fff']];
const colorOf = (kmh) => SPEED_BINS.findIndex(([max]) => kmh < max);
const PX_PER_KMH = 0.12; // trail speed on screen, per frame, when the whole field box fills the view
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const FADE = 0.93; // share of the trail kept each frame

export class WindFlow {
  /** map: MapLibre map; field: windField(); label: legend text. */
  constructor(map, field, label) {
    this.map = map;
    this.field = field;
    const box = map.getContainer();
    this.canvas = Object.assign(document.createElement('canvas'), { className: 'wind-canvas' });
    box.insertBefore(this.canvas, box.querySelector('.maplibregl-control-container'));
    this.ctx = this.canvas.getContext('2d');
    this.legend = Object.assign(document.createElement('div'), { className: 'glass wind-legend' });
    const m = field.mean;
    this.legend.innerHTML = `<strong>${label}</strong>${m ? ` &middot; mean ${Math.round(m.speed)} km/h from ${compass(m.from)}` : ''}<span class="wind-scale">${
      SPEED_BINS.map(([max, c], i) => `<i style="background:${c}"></i>${i < SPEED_BINS.length - 1 ? max : ''}`).join('')} km/h</span>`;
    box.appendChild(this.legend);
    this.onMove = () => this.clear();
    this.onEnd = () => this.reset();
    this.onResize = () => this.resize();
    map.on('move', this.onMove);
    map.on('moveend', this.onEnd);
    map.on('resize', this.onResize);
    this.resize();
    this.frame = requestAnimationFrame(() => this.tick());
  }

  resize() {
    const box = this.map.getContainer();
    this.dpr = window.devicePixelRatio || 1;
    this.w = box.clientWidth;
    this.h = box.clientHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.reset();
  }

  clear() { this.ctx.clearRect(0, 0, this.w, this.h); this.moving = true; }

  /** Screen rectangle of the field box inside the viewport, where particles are born. */
  spawnRect() {
    const [w, s, e, n] = this.field.bbox;
    const pts = [[w, s], [e, s], [e, n], [w, n]].map((p) => this.map.project(p));
    const x0 = Math.max(0, Math.min(...pts.map((p) => p.x)));
    const x1 = Math.min(this.w, Math.max(...pts.map((p) => p.x)));
    const y0 = Math.max(0, Math.min(...pts.map((p) => p.y)));
    const y1 = Math.min(this.h, Math.max(...pts.map((p) => p.y)));
    return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : null;
  }

  reset() {
    this.moving = false;
    this.rect = this.spawnRect();
    // Trails follow the map zoom: zoomed in on a town they are longer, faster and thicker, as if drawn on the ground.
    const fit = this.map.cameraForBounds(this.field.bbox)?.zoom ?? this.map.getZoom();
    const zoom = 2 ** (this.map.getZoom() - fit);
    this.step = PX_PER_KMH * clamp(zoom, 0.3, 6);
    this.width = 1.4 * clamp(Math.sqrt(zoom), 0.7, 3);
    const n = this.rect ? Math.min(800, Math.round(((this.rect[2] - this.rect[0]) * (this.rect[3] - this.rect[1])) / 1100)) : 0;
    this.particles = Array.from({ length: n }, () => this.spawn({}, true));
    this.clear();
    this.moving = false;
  }

  spawn(p, anyAge = false) {
    const [x0, y0, x1, y1] = this.rect;
    p.x = x0 + Math.random() * (x1 - x0);
    p.y = y0 + Math.random() * (y1 - y0);
    p.life = 40 + Math.floor(Math.random() * 60);
    p.age = anyAge ? Math.floor(Math.random() * p.life) : 0;
    return p;
  }

  tick() {
    this.frame = requestAnimationFrame(() => this.tick());
    if (this.moving || !this.particles.length) return;
    const { ctx } = this;
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = `rgba(0,0,0,${FADE})`;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = this.width;
    const paths = SPEED_BINS.map(() => new Path2D());
    for (const p of this.particles) {
      const ll = ++p.age > p.life ? null : this.map.unproject([p.x, p.y]);
      const uv = ll && this.field.sample(ll.lng, ll.lat);
      if (!uv) { this.spawn(p); continue; }
      const nx = p.x + uv[0] * this.step;
      const ny = p.y - uv[1] * this.step;
      const path = paths[colorOf(Math.hypot(uv[0], uv[1]))];
      path.moveTo(p.x, p.y);
      path.lineTo(nx, ny);
      p.x = nx;
      p.y = ny;
    }
    paths.forEach((path, i) => { ctx.strokeStyle = SPEED_BINS[i][1]; ctx.stroke(path); });
  }

  remove() {
    cancelAnimationFrame(this.frame);
    this.map.off('move', this.onMove);
    this.map.off('moveend', this.onEnd);
    this.map.off('resize', this.onResize);
    this.canvas.remove();
    this.legend.remove();
  }
}
