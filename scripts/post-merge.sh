#!/usr/bin/env bash
set -euo pipefail

# Reconcile packages after task merges. A clean npm ci is deterministic, but it
# deletes a healthy native dependency tree and can exceed the merge timeout.
# npm's hidden lockfile records the exact installed tree, so reuse it only when
# it matches the checked-in lockfile package-for-package.
lockfile_matches_installed_tree() {
  [[ -f package-lock.json && -f node_modules/.package-lock.json ]] || return 1

  node <<'NODE'
const fs = require("fs");

try {
  const expected = JSON.parse(fs.readFileSync("package-lock.json", "utf8")).packages ?? {};
  const installed = JSON.parse(fs.readFileSync("node_modules/.package-lock.json", "utf8")).packages ?? {};
  delete expected[""];
  const expectedKeys = Object.keys(expected).sort();
  const installedKeys = Object.keys(installed).sort();

  if (expectedKeys.length !== installedKeys.length) process.exit(1);
  for (let index = 0; index < expectedKeys.length; index += 1) {
    const key = expectedKeys[index];
    if (key !== installedKeys[index] || JSON.stringify(expected[key]) !== JSON.stringify(installed[key])) {
      process.exit(1);
    }
  }
} catch {
  process.exit(1);
}
NODE
}

if lockfile_matches_installed_tree; then
  echo "Dependencies already match package-lock.json; skipping npm ci."
elif [[ -f package-lock.json ]]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi