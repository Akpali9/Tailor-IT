#!/usr/bin/env bash
# Applies the migrations to a scratch Postgres (with minimal stand-ins for Supabase's auth/storage schemas)
# and runs the behavioural + RLS test suite. Usage: PGHOST=... PGPORT=... PGUSER=postgres ./run.sh
set -euo pipefail
cd "$(dirname "$0")"
DB="tailorit_test_$$"
P="psql -v ON_ERROR_STOP=1 -q"
$P -d postgres -c "create database $DB"
trap '$P -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
$P -d "$DB" -f supabase_stubs.sql 2>&1 | grep -v -E "WARNING|HINT" || true
for f in ../migrations/*.sql; do echo "applying $f"; $P -d "$DB" -f "$f"; done
OUT=$(psql -d "$DB" -q -f behaviour.sql 2>&1) || true
echo "$OUT" | grep -E "NOTICE:  ok" | sed 's/.*NOTICE:  //'
if echo "$OUT" | grep -qE "ERROR|ASSERT|EXPECTED|FAILED"; then echo "$OUT" | grep -E "ERROR|ASSERT|EXPECTED|FAILED"; echo "TESTS FAILED"; exit 1; fi
echo "ALL $(echo "$OUT" | grep -c 'NOTICE:  ok') ASSERTIONS PASSED"
