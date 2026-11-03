#!/usr/bin/env bash
#
# Boot the ampoule-packed sidecar exactly as the Tauri shell would, and assert it
# actually serves.
#
# Compiling proves nothing about the thing that breaks most often: static asset
# resolution. In dev the bundle is read from a cwd-relative "priv/static"; inside
# a release it has to resolve through `:code.priv_dir/1`. Get that wrong and the
# app compiles, boots, and shows a blank window with no error anywhere. Only a
# booted request catches it.
#
# No heartbeat is sent here. ShutdownManager does not enforce its timeout until
# the Rust shell has connected at least once, so a headless boot stays alive.
set -uo pipefail

PORT="${MARKDN_SMOKE_PORT:-43118}"
# The one binary ampoule packed for this platform (_build/prod/ampoule/desktop-<target>).
BIN="${MARKDN_SMOKE_BIN:-$(find _build/prod/ampoule -maxdepth 1 -name 'desktop-*' -type f 2>/dev/null | head -n1)}"
LOG="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/markdn-smoke.log"

[ -n "$BIN" ] && [ -x "$BIN" ] || { echo "::error::no ampoule-packed sidecar in _build/prod/ampoule"; exit 1; }

# The launch token, as the shell makes one: /api answers only requests carrying
# it (ExTauri.Token.Plug), and the window gets it as a cookie.
TOKEN="smoke-$(date +%s)-0123456789abcdef0123456789abcdef"
AUTH="Authorization: Bearer ${TOKEN}"

# As the shell starts it: `start` in the foreground of its own process, the port
# in PORT and the token in EX_TAURI_TOKEN, stopped with SIGTERM (a clean
# `init:stop/0`).
PORT="$PORT" EX_TAURI_TOKEN="$TOKEN" "$BIN" start >"$LOG" 2>&1 &
pid=$!

# Invoked by the trap below, which shellcheck cannot see. Both codes are listed
# because they are the same finding under different shellcheck versions: 0.9.x
# reports the body as unreachable (SC2317), 0.11.x reports the function as never
# invoked (SC2329). CI runners and developer machines do not agree on which.
# shellcheck disable=SC2317,SC2329
cleanup() {
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
}
trap cleanup EXIT

ready=0
for _ in $(seq 1 30); do
  if curl -sf -H "$AUTH" "http://localhost:${PORT}/api/health" >/dev/null; then ready=1; break; fi
  sleep 2
done

if [ "$ready" != "1" ]; then
  echo "::error::desktop sidecar did not serve :${PORT} within 60s"
  cat "$LOG"
  exit 1
fi

fail=0

# The API answers, and answers as itself.
curl -sf -H "$AUTH" "http://localhost:${PORT}/api/health" | grep -q '"status":"ok"' \
  || { echo "::error::/api/health did not report ok"; fail=1; }

# ...and to nobody without the token: any program on the machine can reach this
# port, and the document API reads and writes files.
code="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${PORT}/api/health")"
[ "$code" = "401" ] \
  || { echo "::error::/api/health answered ${code} without the window token, not 401"; fail=1; }

# The window opens with the token in the URL and gets it back as a cookie.
headers="$(curl -s -o /dev/null -D - "http://localhost:${PORT}/?ex_tauri_token=${TOKEN}")"
if ! grep -qi '^set-cookie: ex_tauri_' <<<"$headers" || ! grep -q '^HTTP/[0-9.]* 303' <<<"$headers"; then
  echo "::error::the window's token URL was not traded for a cookie"; fail=1
fi

# The SPA shell is served out of the release's own priv/static — the check that
# actually catches a :code.priv_dir regression.
curl -sf "http://localhost:${PORT}/" | grep -q 'id="root"' \
  || { echo "::error::SPA index.html not served from inside the release"; fail=1; }

# The hashed bundle referenced by that shell resolves through Plug.Static.
asset="$(curl -sf "http://localhost:${PORT}/" | sed -n 's/.*src="\(\/assets\/[^"]*\.js\)".*/\1/p' | head -n1)"
if [ -n "$asset" ]; then
  curl -sf "http://localhost:${PORT}${asset}" >/dev/null \
    || { echo "::error::bundle ${asset} referenced by index.html is not served"; fail=1; }
else
  echo "::error::index.html references no /assets/*.js bundle"; fail=1
fi

# MCP answers on the same port the desktop app exposes.
curl -sf -X POST "http://localhost:${PORT}/mcp" \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | grep -q 'read_document' \
  || { echo "::error::MCP tools/list did not list read_document"; fail=1; }

[ "$fail" -eq 0 ] && echo "Sidecar smoke test passed."
exit "$fail"
