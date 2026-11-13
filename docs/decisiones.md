# Decision log

Format: date · decision · reason

- 2026-11-13 · Repo `RafaelRodriguezSanz/dancing-with-the-sars`, public; `master` = releases, `develop` = integration · requested by Rafa, gitflow.
- 2026-11-13 · GitHub Pages source = GitHub Actions; default workflow token = write; workflows may NOT approve PRs · Pages deploy from CI; keep human/agent review separate.
- 2026-11-13 · Remote over HTTPS with the `gh` credential helper · no SSH key on the local machine.
- 2026-11-13 · spaceappschallenge.org omits its intermediate certificate; fetched SSL.com's intermediate from the URL in the certificate and verified the full chain (never disabled TLS checks) · reading the official pages safely.
- 2026-11-13 · Phases 0–3 = preparation only · the submission guide does not say whether coding before Nov 14 is allowed.
