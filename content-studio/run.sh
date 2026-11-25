#!/bin/zsh
set -eu
cd "${0:A:h}"
if [ ! -x .venv/bin/python ]; then
 python3 -m venv .venv
 .venv/bin/pip install -r requirements.txt
fi
exec .venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8876
