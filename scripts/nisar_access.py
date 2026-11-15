"""Earthdata access helpers for NISAR GCOV.

The Earthdata Login token is looked up, in order, in: the EARTHDATA_TOKEN environment variable,
the .env file at the repo root (copy .env.example), and ~/.earthdata_token. It is never printed or written.
"""
import json
import os
import urllib.error
import urllib.request

TOKEN_FILE = os.path.expanduser('~/.earthdata_token')
ENV_FILE = os.path.join(os.path.dirname(__file__), '..', '.env')
CMR = 'https://cmr.earthdata.nasa.gov/search/granules.umm_json'


def _dotenv(path=ENV_FILE):
    """KEY=value lines of a .env file (no shell expansion); {} if there is none."""
    if not os.path.exists(path):
        return {}
    out = {}
    for line in open(path, encoding='utf-8-sig'):
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            out[k.strip()] = v.strip().strip('"\'')
    return out


def _token():
    tok = os.environ.get('EARTHDATA_TOKEN') or _dotenv().get('EARTHDATA_TOKEN')
    if tok:
        return tok
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, encoding='utf-8-sig') as f:
            return f.read().strip()
    raise RuntimeError('No Earthdata token: copy .env.example to .env and set EARTHDATA_TOKEN')


def has_token():
    try:
        return bool(_token())
    except RuntimeError:
        return False


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def signed_url(url):
    """Trades the token for a short-lived pre-signed S3 URL (no credentials inside our later range reads)."""
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {_token()}', 'Range': 'bytes=0-0'})  # HEAD gets a HEAD-only signature
    try:
        urllib.request.build_opener(_NoRedirect).open(req, timeout=60)
        return url
    except urllib.error.HTTPError as e:
        loc = e.headers.get('Location', '')
        if e.code not in (301, 302, 303, 307) or 'urs.earthdata' in loc:
            raise RuntimeError(f'Earthdata did not accept the token (HTTP {e.code})') from None
        return loc


def find_granules(short_name, bbox, page_size=200):
    """CMR search (public). Returns [{title, start, h5}] sorted by start time."""
    q = f'{CMR}?short_name={short_name}&bounding_box={",".join(map(str, bbox))}&page_size={page_size}&sort_key=start_date'
    items = json.load(urllib.request.urlopen(q, timeout=120))['items']
    out = []
    for it in items:
        u = it['umm']
        h5 = next((r['URL'] for r in u.get('RelatedUrls', []) if r['Type'] == 'GET DATA' and r['URL'].endswith('.h5')), None)
        if h5:
            out.append({'title': u['GranuleUR'], 'start': u['TemporalExtent']['RangeDateTime']['BeginningDateTime'], 'h5': h5})
    return out
