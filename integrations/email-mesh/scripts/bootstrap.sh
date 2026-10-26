#!/bin/sh
# Development environment only: no credentials, network collection or scheduler.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PYTHON=${PYTHON:-python3}
cd "$ROOT"
if command -v uv >/dev/null 2>&1; then
  if [ ! -x .venv/bin/python ]; then uv venv --python "$PYTHON" .venv; fi
  uv pip sync --python .venv/bin/python requirements.lock
else
  if [ ! -x .venv/bin/python ]; then
    "$PYTHON" -m venv .venv || {
      printf '%s\n' 'Install python3-venv or uv, or set PYTHON to a Python with ensurepip.' >&2
      exit 1
    }
  fi
  .venv/bin/python -m pip install --disable-pip-version-check -r requirements.lock
fi
.venv/bin/python -B scripts/manage.py check
printf '%s\n' 'Development environment ready. No config, scheduler or publication activated.'
