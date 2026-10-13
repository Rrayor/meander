#!/usr/bin/env bash
# Migrations must never copy data positionally (`SELECT *`) — column order
# drift silently scrambles values. Use explicit column lists on both sides.
set -euo pipefail

if grep -rniE 'select[[:space:]]+\*' src-tauri/migrations/; then
  echo "error: SELECT * found in a migration; use explicit column lists" >&2
  exit 1
fi
