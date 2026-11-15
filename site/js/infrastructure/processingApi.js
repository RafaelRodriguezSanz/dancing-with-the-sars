/**
 * Client for the optional local processing API (scripts/serve.py). On GitHub Pages there is no API:
 * status() then resolves to null and the page stays read-only.
 */
export class ProcessingApi {
  constructor(fetchFn, base = '../api') {
    this.fetch = fetchFn;
    this.base = base;
  }

  /** {token, job} or null when no local server answers. */
  async status() {
    try {
      const r = await this.fetch(`${this.base}/status`, { cache: 'no-store' });
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return null;
      return await r.json();
    } catch { return null; }
  }

  /** Stops the running job. */
  async cancel() {
    const r = await this.fetch(`${this.base}/cancel`, { method: 'POST' });
    return (await r.json().catch(() => ({}))).job;
  }

  /** Starts processing a box; resolves to the job or throws with the server's message. */
  async process(bbox, limit) {
    const q = new URLSearchParams({ bbox: bbox.join(',') });
    if (limit) q.set('limit', String(limit));
    const r = await this.fetch(`${this.base}/process?${q}`, { method: 'POST' });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
    return body.job;
  }
}
