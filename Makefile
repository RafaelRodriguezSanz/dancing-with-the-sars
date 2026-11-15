# Dancing with the SARs: local tasks. `make` = install if needed, check .env, start the server.
PORT ?= 8000

ifeq ($(OS),Windows_NT)
  PY := .venv/Scripts/python
else
  PY := .venv/bin/python
endif
VENV := .venv/.installed

.PHONY: run install check test

run: check  ## start the site + processing API on http://127.0.0.1:$(PORT)/site/
	$(PY) scripts/serve.py --port $(PORT)

check: $(VENV)  ## stop with instructions if .env has no Earthdata token
	@$(PY) scripts/check_env.py

install: $(VENV)  ## create .venv and install the Python dependencies

$(VENV): requirements.txt
	python -m venv .venv
	$(PY) -m pip install -q -r requirements.txt
	@echo ok > $(VENV)

test:  ## unit tests of the site
	node --test site/js/*/*.test.js
