/** Floating side panel over the map: layer checkboxes, and class checkboxes for layers that have classes. No Leaflet here. */
export class LayerPanel {
  constructor(panel, layers, state, { onLayer, onClass }) {
    const list = panel.querySelector('.panel-body');
    const toggle = panel.querySelector('.panel-toggle');
    toggle.addEventListener('click', () => {
      const open = panel.classList.toggle('collapsed') === false;
      toggle.setAttribute('aria-expanded', String(open));
    });
    list.replaceChildren(...layers.map((layer) => {
      const group = document.createElement('div');
      group.className = 'layer-group';
      const sub = layer.classes ? this.classList(layer, state, onClass) : null;
      group.append(this.checkbox(layer.title, `${layer.description} ${layer.caveat}`, state.isActive(layer.id), (on) => {
        if (sub) sub.hidden = !on;
        onLayer(layer, on);
      }, 'layer'));
      if (sub) { sub.hidden = !state.isActive(layer.id); group.append(sub); }
      return group;
    }));
  }

  classList(layer, state, onClass) {
    const ul = document.createElement('div');
    ul.className = 'class-list';
    const enabled = state.enabledClasses(layer.id);
    ul.append(...layer.classes.map((c) => {
      const row = this.checkbox(c.label, `${c.rule} ${c.caveat}`, enabled.has(c.value), (on) => onClass(layer, c.value, on), 'class');
      const swatch = document.createElement('i');
      swatch.className = 'swatch';
      swatch.style.background = `rgb(${c.color.join(',')})`;
      row.insertBefore(swatch, row.lastChild);
      return row;
    }));
    return ul;
  }

  checkbox(text, tip, checked, onChange, cls) {
    const label = document.createElement('label');
    label.className = cls;
    label.title = tip;
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = checked;
    box.addEventListener('change', () => onChange(box.checked));
    const span = document.createElement('span');
    span.textContent = text;
    label.append(box, span);
    return label;
  }
}
