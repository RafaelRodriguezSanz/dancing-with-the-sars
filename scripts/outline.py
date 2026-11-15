"""Smooth outline of a pixel patch, shared by the alert and built-up GeoJSON writers."""
import numpy as np
from scipy import ndimage


def outline(patch):
    """Outer boundary of one pixel patch as a closed ring of (x, y) pixel corners (holes filled).

    Walks the pixel edges that separate the patch from the outside, interior on the right; where two
    paths touch at a corner it turns right, so the ring stays on its own patch.
    """
    m = np.pad(ndimage.binary_fill_holes(patch), 1)
    nxt = {}
    for r, c in zip(*np.nonzero(m)):
        if not m[r - 1, c]: nxt.setdefault((c, r), []).append((c + 1, r))
        if not m[r, c + 1]: nxt.setdefault((c + 1, r), []).append((c + 1, r + 1))
        if not m[r + 1, c]: nxt.setdefault((c + 1, r + 1), []).append((c, r + 1))
        if not m[r, c - 1]: nxt.setdefault((c, r + 1), []).append((c, r))
    start = min(nxt)  # top-left corner: always on the outer boundary
    ring, prev, cur = [start], None, start
    while True:
        outs = nxt[cur]
        if len(outs) > 1 and prev:  # pinch: prefer the right turn (screen y points down)
            dx, dy = cur[0] - prev[0], cur[1] - prev[1]
            outs.sort(key=lambda o: -((o[0] - cur[0]) * -dy + (o[1] - cur[1]) * dx))
        prev, cur = cur, outs.pop(0)
        if cur == start:
            break
        ring.append(cur)
    keep = [p for i, p in enumerate(ring)  # drop corners in the middle of straight runs
            if (p[0] - ring[i - 1][0]) * (ring[(i + 1) % len(ring)][1] - p[1]) != (p[1] - ring[i - 1][1]) * (ring[(i + 1) % len(ring)][0] - p[0])]
    pts = np.array(keep, float) - 1  # undo the padding
    for _ in range(2):  # Chaikin corner cutting: pixel staircase -> soft outline
        q = np.roll(pts, -1, 0)
        pts = np.stack([0.75 * pts + 0.25 * q, 0.25 * pts + 0.75 * q], 1).reshape(-1, 2)
    return pts
