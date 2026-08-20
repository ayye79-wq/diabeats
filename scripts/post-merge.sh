#!/usr/bin/env bash
set -euo pipefail

# Reconcile packages after task merges. npm ci is deterministic, non-interactive,
# and runs the project's postinstall patches when a lockfile is present.
if [[ -f package-lock.json ]]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi