/** Which layers (and which classes inside them) are switched on. Pure state, no DOM. Nothing is fetched for a layer that is off. */
export class LayerState {
  constructor(layers, initiallyActive = []) {
    this.layers = layers;
    this.active = new Set(initiallyActive.filter((id) => layers.some((l) => l.id === id)));
    // Layers with classes start with every class visible.
    this.classes = new Map(layers.filter((l) => l.classes).map((l) => [l.id, new Set(l.classes.map((c) => c.value))]));
  }

  isActive(id) { return this.active.has(id); }

  toggle(id, on = !this.isActive(id)) {
    if (!this.layers.some((l) => l.id === id)) throw new Error(`unknown layer ${id}`);
    if (on) this.active.add(id); else this.active.delete(id);
    return on;
  }

  activeLayers() { return this.layers.filter((l) => this.active.has(l.id)); }

  /** Set of visible class values, or null for a layer without classes. */
  enabledClasses(id) { return this.classes.get(id) ?? null; }

  toggleClass(id, value, on) {
    const set = this.classes.get(id);
    if (!set) throw new Error(`layer ${id} has no classes`);
    if (on) set.add(value); else set.delete(value);
  }
}
