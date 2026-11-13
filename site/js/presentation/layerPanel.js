/** Checkbox list that turns layers on/off. No Leaflet here. */
export class LayerPanel {
  constructor(container, layers, state, onChange) {
    container.replaceChildren(...layers.map((layer) => {
      const label = document.createElement('label');
      label.className = 'layer';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = state.isActive(layer.id);
      box.addEventListener('change', () => onChange(layer, box.checked));
      const text = document.createElement('span');
      text.textContent = layer.title;
      text.title = `${layer.description} ${layer.caveat}`;
      label.append(box, text);
      return label;
    }));
  }
}
