/** Collapsible "How good is it?" block. Hidden unless the selected area has a validation summary. */
export class ValidationPanel {
  constructor(doc) {
    this.root = doc.getElementById('validation');
    this.body = doc.getElementById('validation-body');
    this.doc = doc;
  }

  /** `summary` from summarizeValidation, or null to hide. */
  show(summary) {
    this.root.hidden = !summary;
    this.body.replaceChildren();
    if (!summary) return;
    const line = (text, cls) => {
      const p = this.doc.createElement('p');
      p.textContent = text;
      if (cls) p.className = cls;
      this.body.append(p);
    };
    line(summary.headline, 'info');
    summary.groups.forEach((g) => line(g, 'info'));
    if (summary.water) line(summary.water, 'info');
    line(summary.limits, 'caveat');
  }
}
