#!/bin/sh
# Explicitly configured runtime wrapper. Installation/activation is a separate action.
set -eu
umask 077
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
: "${BUDGETX_MESH_CONFIG:?Set BUDGETX_MESH_CONFIG to the absolute private config path}"
[ "${BUDGETX_MESH_CONFIG#/}" != "$BUDGETX_MESH_CONFIG" ] || exit 2
[ -r "$BUDGETX_MESH_CONFIG" ] || exit 2
[ -x "$ROOT/.venv/bin/python" ] || exit 2
cd "$ROOT"
exec "$ROOT/.venv/bin/python" "$ROOT/ops.py" --config "$BUDGETX_MESH_CONFIG" run
