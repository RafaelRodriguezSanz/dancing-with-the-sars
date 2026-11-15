/** "Read the README" button: shows the repository README.md (one folder above site/) rendered in a dialog. */
const MARKED = 'https://cdn.jsdelivr.net/npm/marked@12.0.2/lib/marked.esm.js';
const README = '../README.md';

export class ReadmeViewer {
  constructor(doc, fetchFn) {
    this.dialog = doc.getElementById('readme');
    this.body = doc.getElementById('readme-body');
    this.fetch = fetchFn;
    this.loaded = false;
    doc.getElementById('readme-open').addEventListener('click', () => this.open());
    doc.getElementById('readme-close').addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('click', (ev) => { if (ev.target === this.dialog) this.dialog.close(); }); // click outside
  }

  async open() {
    this.dialog.showModal();
    if (this.loaded) return;
    try {
      const [{ marked }, text] = await Promise.all([
        import(MARKED),
        this.fetch(README).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); }),
      ]);
      this.body.innerHTML = marked.parse(text); // our own file, not user input
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
