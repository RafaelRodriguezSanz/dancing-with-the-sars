/** "Read the README" button: shows the repository README.md (one folder above site/) rendered in a dialog. */
const MARKED = 'https://cdn.jsdelivr.net/npm/marked@12.0.2/lib/marked.esm.js';
const README = '../README.md';

const slug = (text) => text.trim().toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');

export class ReadmeViewer {
  constructor(doc, fetchFn) {
    this.dialog = doc.getElementById('readme');
    this.body = doc.getElementById('readme-body');
    this.fetch = fetchFn;
    this.loaded = false;
    doc.getElementById('readme-open').addEventListener('click', () => this.open());
    for (const b of doc.querySelectorAll('[data-readme]')) b.addEventListener('click', () => this.open(b.dataset.readme));
    doc.getElementById('readme-close').addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('click', (ev) => { if (ev.target === this.dialog) this.dialog.close(); }); // click outside
  }

  /** Opens the dialog; section = heading id to scroll to (GitHub-style slug of the heading text). */
  async open(section) {
    this.dialog.showModal();
    if (!this.loaded) await this.load();
    const target = section && this.body.querySelector(`#${CSS.escape(section)}`);
    if (target) target.scrollIntoView({ block: 'start' });
  }

  async load() {
    try {
      const [{ marked }, text] = await Promise.all([
        import(MARKED),
        this.fetch(README).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); }),
      ]);
      this.body.innerHTML = marked.parse(text); // our own file, not user input
      for (const h of this.body.querySelectorAll('h1, h2, h3')) h.id = slug(h.textContent);
      for (const a of this.body.querySelectorAll('a[href]')) {
        const href = a.getAttribute('href');
        if (!/^(https?:|mailto:|#)/.test(href)) a.setAttribute('href', `../${href}`); // repo-relative links
        if (!href.startsWith('#')) a.target = '_blank';
      }
      this.loaded = true;
    } catch (err) {
      this.body.textContent = `Could not load the README (${err.message}).`;
    }
  }
}
