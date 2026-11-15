/** Reads <area dir>/validation.json (written by the validation script). Resolves to null when missing or invalid. */
export class ValidationRepository {
  constructor(fetchFn) { this.fetch = fetchFn; }

  async load(dir) {
    try {
      const r = await this.fetch(`${dir}/validation.json`, { cache: 'no-store' });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }
}
