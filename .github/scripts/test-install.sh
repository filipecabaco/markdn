#!/usr/bin/env bash
#
# Exercises install.sh end to end without a network or a published release.
#
# `curl` and `uname` are stubbed on PATH, so the script under test takes its real
# Linux code path against a canned GitHub release: resolve the tag, pick the
# asset, fetch it, verify the checksum, install it, write a desktop entry.
#
# The second case is the one that matters. A verifier that never rejects anything
# passes every happy-path test while protecting nobody, so this deliberately
# corrupts the payload and asserts the install FAILS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

pass=0
fail=0
check() {
  if [ "$2" = "true" ]; then printf '  ok   %s\n' "$1"; pass=$((pass + 1))
  else printf '  FAIL %s\n' "$1"; fail=$((fail + 1)); fi
}

# ── Fixture: a release carrying one AppImage and its checksum ────────────────
setup_fixture() {
  local corrupt="$1"
  rm -rf "${WORK:?}/stub" "${WORK:?}/serve" "${WORK:?}/prefix" "${WORK:?}/home"
  mkdir -p "${WORK}/stub" "${WORK}/serve" "${WORK}/prefix" "${WORK}/home"

  printf 'PAYLOAD-v1' > "${WORK}/serve/app.AppImage"
  # The checksum is computed from the true bytes; the corrupt case then swaps the
  # served payload underneath it, which is exactly the tampering being detected.
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${WORK}/serve/app.AppImage" | awk '{print $1}' > "${WORK}/serve/app.AppImage.sha256"
  else
    shasum -a 256 "${WORK}/serve/app.AppImage" | awk '{print $1}' > "${WORK}/serve/app.AppImage.sha256"
  fi
  [ "${corrupt}" = "true" ] && printf 'TAMPERED' > "${WORK}/serve/app.AppImage"

  cat > "${WORK}/serve/release.json" <<JSON
{
  "tag_name": "v9.9.9",
  "assets": [
    { "browser_download_url": "https://example.test/MarkDN_9.9.9_amd64.AppImage" },
    { "browser_download_url": "https://example.test/MarkDN_9.9.9_amd64.AppImage.sha256" },
    { "browser_download_url": "https://example.test/MarkDN_9.9.9_aarch64.dmg" }
  ]
}
JSON

  cat > "${WORK}/stub/curl" <<'STUB'
#!/usr/bin/env bash
# Serves the fixture for whichever URL is asked for. Flags are ignored; the URL
# is the last argument that looks like one.
url=""
out=""
prev=""
for a in "$@"; do
  case "$a" in
    https://*) url="$a" ;;
  esac
  [ "$prev" = "-o" ] && out="$a"
  prev="$a"
done
case "$url" in
  *api.github.com*)   body="$(cat "$SERVE/release.json")" ;;
  *.AppImage.sha256)  body="$(cat "$SERVE/app.AppImage.sha256")" ;;
  *.AppImage)         body="$(cat "$SERVE/app.AppImage")" ;;
  *)                  exit 22 ;;
esac
if [ -n "$out" ]; then printf '%s' "$body" > "$out"; else printf '%s' "$body"; fi
STUB

  cat > "${WORK}/stub/uname" <<'STUB'
#!/usr/bin/env bash
case "${1:-}" in
  -s) echo Linux ;;
  -m) echo x86_64 ;;
  *)  echo Linux ;;
esac
STUB

  chmod +x "${WORK}/stub/curl" "${WORK}/stub/uname"
}

run_installer() {
  env PATH="${WORK}/stub:${PATH}" \
      SERVE="${WORK}/serve" \
      HOME="${WORK}/home" \
      MARKDN_PREFIX="${WORK}/prefix" \
      sh "${ROOT}/install.sh"
}

printf 'install.sh: happy path\n'
setup_fixture false
if output="$(run_installer 2>&1)"; then
  check "installer exits 0" true
  check "binary installed"        "$([ -f "${WORK}/prefix/markdn" ] && echo true || echo false)"
  check "binary is executable"    "$([ -x "${WORK}/prefix/markdn" ] && echo true || echo false)"
  check "payload intact"          "$([ "$(cat "${WORK}/prefix/markdn")" = "PAYLOAD-v1" ] && echo true || echo false)"
  check "desktop entry written"   "$([ -f "${WORK}/home/.local/share/applications/markdn.desktop" ] && echo true || echo false)"
  check "reports the resolved tag" "$(grep -q 'v9.9.9' <<<"${output}" && echo true || echo false)"
  check "reports verification"     "$(grep -q 'Checksum verified' <<<"${output}" && echo true || echo false)"
  check "prints the MCP endpoint"  "$(grep -q 'localhost:43118/mcp' <<<"${output}" && echo true || echo false)"
else
  check "installer exits 0" false
  printf '%s\n' "${output}"
fi

printf 'install.sh: tampered payload must be refused\n'
setup_fixture true
if output="$(run_installer 2>&1)"; then
  check "installer rejects a checksum mismatch" false
  printf '%s\n' "${output}"
else
  check "installer rejects a checksum mismatch" true
  check "says why" "$(grep -q 'checksum mismatch' <<<"${output}" && echo true || echo false)"
  check "installs nothing" "$([ ! -f "${WORK}/prefix/markdn" ] && echo true || echo false)"
fi

printf '\n%d passed, %d failed\n' "${pass}" "${fail}"
[ "${fail}" -eq 0 ]
