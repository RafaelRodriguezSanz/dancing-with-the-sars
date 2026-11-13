export class FallbackSceneRepository {
  constructor(fetchFn, url = 'data/fallback-scenes.json') {
    this.fetch = fetchFn;
    this.url = url;
  }

  async findScenes() {
    const res = await this.fetch(this.url);
    if (!res.ok) throw new Error(`Fallback HTTP ${res.status}`);
    const json = await res.json();
    return [...(json.scenes ?? [])].sort((a, b) => a.start.localeCompare(b.start));
  }
}
