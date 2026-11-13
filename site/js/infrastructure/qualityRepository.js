/** Reads data/gibs-quality.json (made by scripts/probe_gibs_quality.py). Optional: returns {} on any failure. */
export class QualityRepository {
  constructor(fetchFn, url = 'data/gibs-quality.json') {
    this.fetch = fetchFn;
    this.url = url;
  }

  async load() {
    try {
      const res = await this.fetch(this.url);
      if (!res.ok) return {};
      return (await res.json()).dates ?? {};
    } catch {
      return {};
    }
  }
}
