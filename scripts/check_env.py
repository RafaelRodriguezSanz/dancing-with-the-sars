"""Checks that .env has the Earthdata token before starting the local server (make run).

Exit 0 if EARTHDATA_TOKEN is set in .env (or in the environment); otherwise prints how to get one and
exits 1. The token itself is never printed.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from nisar_access import ENV_FILE, _dotenv  # noqa: E402

HELP = """
  Missing Earthdata configuration: {what}

  The NISAR data needs a free NASA Earthdata Login token:
    1. Create an account (or sign in) at https://urs.earthdata.nasa.gov
    2. Open "Generate Token" (top menu), press "Generate Token" and copy it (valid 60 days)
    3. Copy .env.example to .env in the repo root and paste it after EARTHDATA_TOKEN=
         cp .env.example .env        (Windows: copy .env.example .env)
    4. Run make again

  .env is gitignored: never commit it or paste the token anywhere else.
"""


def main():
    if os.environ.get('EARTHDATA_TOKEN') or _dotenv().get('EARTHDATA_TOKEN'):
        print('Earthdata token: found in .env')
        return 0
    what = '.env has no EARTHDATA_TOKEN' if os.path.exists(ENV_FILE) else '.env file not found'
    print(HELP.format(what=what), file=sys.stderr)
    return 1


if __name__ == '__main__':
    sys.exit(main())
