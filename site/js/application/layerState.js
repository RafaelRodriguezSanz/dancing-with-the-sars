/** Which layers are switched on. Pure state, no DOM. Nothing is fetched for a layer that is off. */
export class LayerState {
  constructor(layers, initiallyActive = []) {
    this.layers = layers;
    this.active = new Set(initiallyActive.filter((id) => layers.some((l) => l.id === id)));
  }

  isActive(id) { return this.active.has(id); }

  toggle(id, on = !this.isActive(id)) {
    if (!this.layers.some((l) => l.id === id)) throw new Error(`unknown layer ${id}`);
    if (on) this.active.add(id); else this.active.delete(id);
    return on;
  }

  activeLayers() { return this.layers.filter((l) => this.active.has(l.id)); }
}
