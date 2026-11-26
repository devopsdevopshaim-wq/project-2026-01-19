#!/usr/bin/env bash
# Weekly update: fresh data -> learning step (weights, calibration, track record, frozen weekly picks).
# Run from the repository root:  bash toto/tools/weekly_update.sh
set -euo pipefail
cd "$(dirname "$0")/.."
python3 tools/build_data.py
python3 tools/build_basketball.py
node tools/train.js
