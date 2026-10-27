#!/usr/bin/env bash
#
# Install a pinned ampoule release for this runner and put it on PATH.
#
# ampoule packs the desktop sidecar (`config :ex_tauri, :packager, :ampoule`):
# `mix ex_tauri.build` runs `ampoule release` for the runner's own platform. The
# archive holds the packer and, next to it, the lean runtime packed apps start
# from. Verified against the release's SHA256SUMS before anything runs.
#
# The version is pinned with OTP in mise.toml and the workflows: ampoule runs a
# release only from the OTP its runtime embeds (`ampoule version` prints it).
set -euo pipefail

VERSION="${1:?usage: install-ampoule.sh VERSION}"

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) target=aarch64-darwin ;;
  Darwin-x86_64) target=x86_64-darwin ;;
  Linux-x86_64) target=x86_64-linux ;;
  Linux-aarch64) target=aarch64-linux ;;
  *) echo "::error::no ampoule build for $(uname -s)-$(uname -m)"; exit 1 ;;
esac

archive="ampoule-${VERSION}-${target}.tar.gz"
dir="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/ampoule-${VERSION}"
base="https://github.com/filipecabaco/ampoule/releases/download/v${VERSION}"

mkdir -p "$dir"
cd "$dir"
curl -fsSL --retry 3 -o "$archive" "${base}/${archive}"
curl -fsSL --retry 3 -o SHA256SUMS "${base}/SHA256SUMS"
grep " ${archive}\$" SHA256SUMS | shasum -a 256 -c -
tar xzf "$archive"

# The archive unpacks into a directory named after itself.
bin="${dir}/${archive%.tar.gz}"
"${bin}/ampoule" version
if [ -n "${GITHUB_PATH:-}" ]; then
  echo "$bin" >> "$GITHUB_PATH"
fi
