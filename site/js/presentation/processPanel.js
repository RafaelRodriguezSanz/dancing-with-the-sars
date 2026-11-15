/**
 * "Analyze area" row. With the local server (scripts/serve.py) and a token, the button cuts and analyzes the NISAR
 * granules of the selected area; it never starts by itself. Changing area cancels a job still running for another one. While it runs there
 * is a progress bar, `onScan` animates the box on the map, and the button turns into "Cancel".
 * Without the server it explains how to get one. Talks to the API only through `api`.
 */
const POLL_MS = 2000;
const sameBox = (a, b) => Boolean(a && b) && a.every((v, i) => Math.abs(v - b[i]) < 1e-4);

export class ProcessPanel {
  constructor(doc, api, { onDone, onScan = () => {} }) {
    this.row = doc.getElementById('process-row');
    this.btn = doc.getElementById('process');
    this.bar = doc.getElementById('process-bar');
    this.info = doc.getElementById('process-info');
    this.api = api;
    this.onDone = onDone;
    this.onScan = onScan; // (bbox | null, progress 0..1) -> scanning animation on the map
    this.bbox = null;
    this.ready = false;
    this.status = null;
    this.running = false;
    this.timer = null;
    this.btn.addEventListener('click', () => (this.running ? this.cancel() : this.start()));
  }

  /** Called on every area change. `ready` = products already exist for this box. */
  async setArea(bbox, ready) {
    this.bbox = bbox;
    this.ready = ready;
    const status = await this.api.status();
    if (this.bbox !== bbox) return; // the user moved on meanwhile
    this.status = status;
    const job = status?.job;
    if (job?.state === 'running') {
      if (sameBox(job.bbox, bbox)) { this.follow(); return; }
      this.running = false; // only the selected area is ever processed: drop the other one
      clearTimeout(this.timer);
      await this.api.cancel().catch(() => {});
      if (this.bbox !== bbox) return;
    }
    this.idle();
  }

  /** Button and text for the current area when nothing is running. */
  idle(note = '') {
    const { status, ready } = this;
    this.running = false;
    this.bar.hidden = true;
    this.onScan(null);
    this.row.hidden = ready && !status;
    this.btn.hidden = !status;
    this.btn.disabled = !status?.token;
    this.btn.textContent = ready ? 'Re-analyze area' : 'Analyze area';
    const hint = ready ? ''
      : !status
        ? 'Calibrated NISAR data is not processed for this area. To process any area, run scripts/serve.py on your computer with an Earthdata token (see .env.example).'
        : status.token
          ? 'Not analyzed yet: press Analyze area to cut the real NISAR granules for this box (newest 12 dates, a few minutes).'
          : 'The local server has no Earthdata token: copy .env.example to .env, set EARTHDATA_TOKEN and restart it.';
    this.info.textContent = [note, hint].filter(Boolean).join(' ');
  }

  async start() {
    this.btn.disabled = true;
    try {
      await this.api.process(this.bbox);
      this.follow();
    } catch (e) {
      this.idle(`Could not start: ${e.message}.`);
    }
  }

  async cancel() {
    this.btn.disabled = true;
    clearTimeout(this.timer);
    try { await this.api.cancel(); } catch { /* the poll below shows the real state */ }
    this.status = await this.api.status();
    this.idle('Cancelled; dates already downloaded are kept and reused next time.');
  }

  follow() {
    clearTimeout(this.timer);
    this.running = true;
    this.row.hidden = false;
    this.btn.hidden = false;
    this.btn.disabled = false;
    this.btn.textContent = 'Cancel';
    this.bar.hidden = false;
    const tick = async () => {
      if (!this.running) return;
      const job = (await this.api.status())?.job;
      if (!this.running) return;
      if (!job) { this.status = null; this.idle('Lost the local server.'); return; }
      const last = job.log.at(-1) ?? 'starting...';
      if (job.state === 'running') {
        if (!sameBox(job.bbox, this.bbox)) { this.idle(); return; } // the area changed; setArea handles it
        this.bar.value = job.progress ?? 0;
        this.onScan(job.bbox, job.progress ?? 0);
        this.info.textContent = `Analyzing this area: ${Math.round((job.progress ?? 0) * 100)}% · ${last}`;
        this.timer = setTimeout(tick, POLL_MS);
        return;
      }
      this.status = { ...this.status, job };
      if (job.state === 'done') {
        if (!sameBox(job.bbox, this.bbox)) { this.idle(); return; }
        this.ready = true;
        this.idle(`Done in ${job.seconds} s.`);
        this.onDone(job);
      } else {
        this.idle(job.state === 'cancelled' ? 'Cancelled.' : `Failed: ${last}`);
      }
    };
    tick();
  }
}
