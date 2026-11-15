"""Local server: the site plus a small API that processes any area with real NISAR data.

GitHub Pages only serves files, and the NISAR GCOV granules need an Earthdata Login token, so the
browser cannot read them. Run this on your machine instead:

    copy .env.example .env        (then put your token in EARTHDATA_TOKEN)
    .venv/Scripts/python scripts/serve.py
    open http://127.0.0.1:8000/site/

Draw any area on the map and press "Analyze area": the server runs nisar_subset.py --bbox and
nisar_alerts.py --bbox for it, writing to site/data/nisar/<area_slug>/ (gitignored). Only the HDF5
chunks covering the box are downloaded. The token stays in this process; the API never returns it.

API (localhost only):
  GET  /api/status                      {"token": bool, "job": {...} | null}; job.progress is 0..1
  POST /api/process?bbox=w,s,e,n&limit=N start a job (409 if one is running)
  POST /api/cancel                      stop the running job (dates already downloaded stay cached)
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.dirname(__file__))
from nisar_access import _dotenv, has_token  # noqa: E402
from nisar_subset import ROOT, resolve_area  # noqa: E402

CACHE_DAYS = float(os.environ.get('NISAR_CACHE_DAYS') or _dotenv().get('NISAR_CACHE_DAYS') or 7)  # areas not opened for this long are deleted
AREA_DIRS = [os.path.join(ROOT, 'site', 'data', 'nisar'), os.path.join(ROOT, 'data', 'raw', 'nisar')]  # products, raw cuts
MAX_SPAN_DEG = 10  # same limit as MAX_AREA_SPAN_DEG in site/js/domain/area.js: a mid-size country
DEFAULT_LIMIT = 12  # newest dates; enough for permanent water (5 dates) without waiting too long
STEPS = [(0.0, 0.85), (0.85, 0.92), (0.92, 1.0)]  # share of the progress bar: nisar_subset.py, nisar_alerts.py, flood_precompute.py
HIDE = ('bearer', 'signature', 'token=')  # never echo anything that looks like a credential


def touch_area(slug):
    """Marks an area as used now (its folders' mtime is what the TTL looks at)."""
    for d in AREA_DIRS:
        path = os.path.join(d, slug)
        if os.path.isdir(path):
            os.utime(path)


def prune_cache(keep=()):
    """Deletes processed boxes (aoi_*) not used for CACHE_DAYS; named areas such as santa-lucia are kept."""
    limit = time.time() - CACHE_DAYS * 86400
    for d in AREA_DIRS:
        for slug in os.listdir(d) if os.path.isdir(d) else []:
            path = os.path.join(d, slug)
            if slug.startswith('aoi_') and slug not in keep and os.path.getmtime(path) < limit:
                shutil.rmtree(path, ignore_errors=True)
                print(f'cache: removed {slug} from {os.path.relpath(d, ROOT)} (unused for {CACHE_DAYS:g} days)', flush=True)


class Jobs:
    """One processing job at a time; its log lines are kept for the page to show. Cancelling the running
    job frees the slot at once, so the page can start another area right away; each run thread only ever
    touches its own job dict, so a cancelled one finishing late cannot overwrite the new one."""

    def __init__(self):
        self.lock = threading.Lock()
        self.job = None
        self.procs = {}  # id(job) -> running subprocess

    def snapshot(self):
        with self.lock:
            return None if self.job is None else {**self.job, 'log': self.job['log'][-8:]}

    def start(self, bbox_arg, limit):
        if not bbox_arg:
            raise ValueError('bbox=w,s,e,n is required')
        slug, name, bbox = resolve_area('santa-lucia', bbox_arg)
        if bbox[2] - bbox[0] > MAX_SPAN_DEG or bbox[3] - bbox[1] > MAX_SPAN_DEG:
            raise ValueError(f'area too large: keep each side under {MAX_SPAN_DEG} degrees')
        with self.lock:
            if self.job and self.job['state'] == 'running':
                return False
            prune_cache(keep={slug})
            self.job = job = {'slug': slug, 'bbox': bbox, 'state': 'running', 'started': time.time(), 'log': [], 'progress': 0.0}
        threading.Thread(target=self.run, args=(job, bbox, limit), daemon=True).start()
        return True

    def cancel(self):
        with self.lock:
            job = self.job
            if not job or job['state'] != 'running':
                return False
            job['state'] = 'cancelled'
            job['seconds'] = round(time.time() - job['started'])
            proc = self.procs.get(id(job))
        if proc and proc.poll() is None:
            proc.terminate()
        return True

    def log(self, job, line, step=0):
        line = line.rstrip()
        if line.startswith('@progress '):  # "@progress <0..1> <text>" from the scripts: bar, not log
            frac, _, text = line[10:].partition(' ')
            lo, hi = STEPS[step]
            with self.lock:
                job['progress'] = round(lo + (hi - lo) * min(max(float(frac), 0), 1), 3)
            line = text
        if line and not any(h in line.lower() for h in HIDE):
            with self.lock:
                job['log'].append(line[:200])

    def run(self, job, bbox, limit):
        box = ','.join(map(str, bbox))
        steps = [['nisar_subset.py', f'--bbox={box}', f'--limit={limit}'], ['nisar_alerts.py', f'--bbox={box}'],
                 ['flood_precompute.py', f'--bbox={box}']]
        ok = True
        for step, (script, *args) in enumerate(steps):
            with self.lock:
                if job['state'] != 'running':
                    break
                self.procs[id(job)] = p = subprocess.Popen(
                    [sys.executable, '-u', os.path.join(ROOT, 'scripts', script), *args], cwd=ROOT,
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace')
            for line in p.stdout:
                self.log(job, line, step)
            if p.wait() != 0:
                ok = False
                if job['state'] == 'running':
                    self.log(job, f'{script} failed (exit {p.returncode})')
                break
        with self.lock:
            self.procs.pop(id(job), None)
            if job['state'] == 'running':
                job['state'] = 'done' if ok else 'failed'
                job['progress'] = 1.0 if ok else job['progress']
                job['seconds'] = round(time.time() - job['started'])


JOBS = Jobs()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def send_json(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def end_headers(self):
        if not self.path.startswith('/api/'):
            self.send_header('Cache-Control', 'no-cache')  # freshly processed products must show at once
        super().end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/api/status':
            return self.send_json(200, {'token': has_token(), 'job': JOBS.snapshot()})
        m = re.fullmatch(r'/site/data/nisar/([\w.-]+)/manifest\.json', path)
        if m:
            touch_area(m.group(1))  # opened in the page: keep it for another CACHE_DAYS
        return super().do_GET()

    def do_POST(self):
        u = urlparse(self.path)
        if u.path == '/api/cancel':
            return self.send_json(200 if JOBS.cancel() else 409, {'job': JOBS.snapshot()})
        if u.path != '/api/process':
            return self.send_json(404, {'error': 'not found'})
        if not has_token():
            return self.send_json(400, {'error': 'no Earthdata token: copy .env.example to .env and set EARTHDATA_TOKEN'})
        q = parse_qs(u.query)
        try:
            limit = int(q.get('limit', [DEFAULT_LIMIT])[0])
            started = JOBS.start(q.get('bbox', [''])[0], max(1, min(limit, 60)))
        except (ValueError, SystemExit) as e:
            return self.send_json(400, {'error': str(e)})
        if not started:
            return self.send_json(409, {'error': 'another area is being processed', 'job': JOBS.snapshot()})
        return self.send_json(202, {'job': JOBS.snapshot()})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8000)
    a = ap.parse_args()
    prune_cache()
    print(f'Serving http://127.0.0.1:{a.port}/site/  (Earthdata token: {"found" if has_token() else "MISSING, see .env.example"})')
    ThreadingHTTPServer(('127.0.0.1', a.port), Handler).serve_forever()


if __name__ == '__main__':
    main()
