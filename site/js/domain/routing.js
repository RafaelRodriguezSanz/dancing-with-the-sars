/**
 * Road routing for evacuation, pure functions. Roads come as ways: {id, highway, nodes: [id], coords: [[lon, lat]]}.
 * Roads are walked both ways (in an evacuation, one-way rules may be lifted; the panel says so).
 */
const R = 6371000;
export function metres([lon1, lat1], [lon2, lat2]) {
  const k = Math.PI / 180;
  const x = (lon2 - lon1) * k * Math.cos(((lat1 + lat2) / 2) * k);
  const y = (lat2 - lat1) * k;
  return Math.hypot(x, y) * R;
}

/** Graph {pos: Map(node -> [lon, lat]), adj: Map(node -> [{to, len, mid}])}; mid = edge midpoint. */
export function buildGraph(ways) {
  const pos = new Map();
  const adj = new Map();
  const link = (a, b, len, mid) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push({ to: b, len, mid }); };
  for (const w of ways) {
    for (let i = 0; i < w.nodes.length; i++) pos.set(w.nodes[i], w.coords[i]);
    for (let i = 1; i < w.nodes.length; i++) {
      const a = w.nodes[i - 1];
      const b = w.nodes[i];
      const pa = w.coords[i - 1];
      const pb = w.coords[i];
      const len = metres(pa, pb);
      const mid = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
      link(a, b, len, mid);
      link(b, a, len, mid);
    }
  }
  return { pos, adj };
}

/** Closest graph node to a point, or null if none within maxM metres. */
export function nearestNode(graph, point, maxM = 400) {
  let best = null;
  let bestD = maxM;
  for (const [id, p] of graph.pos) {
    const d = metres(point, p);
    if (d < bestD && graph.adj.has(id)) { best = id; bestD = d; }
  }
  return best;
}

/** Cost factor of a flooded stretch: avoided whenever any dry way exists, but a start inside the water still gets out. */
export const WET_PENALTY = 50;

/** Dijkstra from `source`; `blocked([lon, lat])` marks flooded road (tested at the far end and the middle of each edge),
 * which costs WET_PENALTY times its length. dist holds those costs; use pathMetres for real lengths. */
export function shortestPaths(graph, source, blocked = () => false) {
  const dist = new Map([[source, 0]]);
  const prev = new Map();
  const heap = [[0, source]];
  const push = (item) => {
    heap.push(item);
    for (let i = heap.length - 1; i > 0;) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  const closed = new Map(); // node -> blocked?, cached
  const isBlocked = (id) => { if (!closed.has(id)) closed.set(id, blocked(graph.pos.get(id))); return closed.get(id); };
  while (heap.length) {
    const [d, u] = pop();
    if (d > dist.get(u)) continue;
    for (const e of graph.adj.get(u) ?? []) {
      const nd = d + e.len * (isBlocked(e.to) || blocked(e.mid) ? WET_PENALTY : 1);
      if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, u); push([nd, e.to]); }
    }
  }
  return { dist, prev };
}

/** Node path source -> target from shortestPaths' prev map, as [lon, lat] coordinates ([] if unreachable). */
export function pathTo(graph, { prev, dist }, target) {
  if (!dist.has(target)) return [];
  const out = [];
  for (let n = target; n !== undefined; n = prev.get(n)) out.push(graph.pos.get(n));
  return out.reverse();
}

/** Total and flooded length of a path in metres (a step counts as flooded like in shortestPaths). */
export function pathMetres(path, blocked = () => false) {
  let total = 0;
  let wet = 0;
  for (let i = 1; i < path.length; i++) {
    const len = metres(path[i - 1], path[i]);
    total += len;
    if (blocked(path[i]) || blocked([(path[i][0] + path[i - 1][0]) / 2, (path[i][1] + path[i - 1][1]) / 2])) wet += len;
  }
  return { total, wet };
}

/**
 * Evacuation plan from an origin node: the safe site cheapest to reach avoiding flooded roads, the route
 * there, and the route people would normally take to it (shortest, ignoring the flood) to tell whether
 * the usual way is cut. sites: [{..., node}] already filtered to safe ones. Returns null if none is reachable.
 */
export function evacuationPlan(graph, origin, sites, blocked) {
  const dry = shortestPaths(graph, origin, blocked);
  const best = sites.filter((s) => dry.dist.has(s.node)).sort((a, b) => dry.dist.get(a.node) - dry.dist.get(b.node))[0];
  if (!best) return null;
  const route = pathTo(graph, dry, best.node);
  const usual = pathTo(graph, shortestPaths(graph, origin), best.node);
  return { site: best, route, length: pathMetres(route, blocked), usual, usualLength: pathMetres(usual, blocked) };
}

/**
 * Groups of nodes joined by roads that stay dry. A stretch is dry when both ends and its middle are not blocked.
 * Returns {comp: Map(node -> group id), size: Map(group id -> nodes)}; blocked nodes are in no group.
 */
export function dryComponents(graph, blocked = () => false) {
  const wet = new Map();
  const isWet = (id) => { if (!wet.has(id)) wet.set(id, Boolean(blocked(graph.pos.get(id)))); return wet.get(id); };
  const comp = new Map();
  const size = new Map();
  for (const start of graph.adj.keys()) {
    if (comp.has(start) || isWet(start)) continue;
    comp.set(start, start);
    let n = 0;
    for (const stack = [start]; stack.length;) {
      const u = stack.pop();
      n += 1;
      for (const e of graph.adj.get(u) ?? []) {
        if (comp.has(e.to) || isWet(e.to) || blocked(e.mid)) continue;
        comp.set(e.to, start);
        stack.push(e.to);
      }
    }
    size.set(start, n);
  }
  return { comp, size };
}

const largest = (size) => [...size].reduce((a, b) => (b[1] > a[1] ? b : a), [null, 0])[0];

/**
 * Which places a flood cuts off by road. places: [{..., node}] (node = nearest road node, or null).
 * Compared with the same road network without the flood, each place gets a status:
 *   'connected' - still joined by dry roads to the largest dry road network of the view;
 *   'cut-off'   - its roads stay dry but no dry road leads to that network any more;
 *   'flooded'   - the road at the place is under water;
 *   'no-road'   - no road nearby, or not joined to the main network even without a flood: not judged.
 * pocket = id of the dry group the place is in (null if flooded), to find what else is inside it.
 */
export function isolatedPlaces(graph, places, blocked) {
  const base = dryComponents(graph);
  const mainBase = largest(base.size);
  const dry = dryComponents(graph, blocked);
  const main = largest(dry.size);
  return places.map((p) => {
    const pocket = dry.comp.get(p.node) ?? null;
    const status = p.node === null || p.node === undefined || base.comp.get(p.node) !== mainBase ? 'no-road'
      : pocket === null ? 'flooded'
        : pocket === main ? 'connected' : 'cut-off';
    return { ...p, status, pocket: status === 'no-road' ? null : pocket };
  });
}
