#!/bin/sh
# markdn installer.
#
#   curl -fsSL https://raw.githubusercontent.com/filipecabaco/markdn/main/install.sh | sh
#
# Environment overrides:
#   MARKDN_VERSION — install a specific release tag (e.g. "0.2.0")
#   MARKDN_PREFIX  — where the `markdn` command lands (default: ~/.local/bin)
#   MARKDN_LIB_DIR — where the Linux AppImage lands (default: ~/.local/lib/markdn)
#
# POSIX sh on purpose: this runs on whatever /bin/sh the machine has, before
# anything of ours is installed.
set -eu

REPO="filipecabaco/markdn"
OS="$(uname -s)"
ARCH="$(uname -m)"
BIN_DIR="${MARKDN_PREFIX:-${HOME}/.local/bin}"
LIB_DIR="${MARKDN_LIB_DIR:-${HOME}/.local/lib/markdn}"

die() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

command -v curl >/dev/null 2>&1 || die "curl is required"

# ── Resolve the release ──────────────────────────────────────────────────────

if [ -n "${MARKDN_VERSION:-}" ]; then
  API="https://api.github.com/repos/${REPO}/releases/tags/v${MARKDN_VERSION}"
else
  API="https://api.github.com/repos/${REPO}/releases/latest"
fi

printf 'Fetching release metadata...\n'
# Unauthenticated, the API allows 60 requests an hour per IP, which a shared
# network or CI runner can use up. A GITHUB_TOKEN in the environment lifts that.
if [ -n "${GITHUB_TOKEN:-}" ]; then
  RELEASE_JSON="$(curl -fsSL -H "Authorization: Bearer ${GITHUB_TOKEN}" "${API}")" \
    || die "could not reach the GitHub release API"
else
  RELEASE_JSON="$(curl -fsSL "${API}")" \
    || die "could not reach the GitHub release API (rate limited? set GITHUB_TOKEN)"
fi

TAG="$(printf '%s\n' "${RELEASE_JSON}" \
  | grep '"tag_name"' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/' | head -1)"
[ -n "${TAG}" ] || die "no release found at ${API}"

# Download URL for the first asset whose file name matches a pattern.
# $1 = extended-regex applied to the asset name.
asset_url() {
  printf '%s\n' "${RELEASE_JSON}" \
    | grep '"browser_download_url"' \
    | sed 's/.*"browser_download_url": *"\([^"]*\)".*/\1/' \
    | grep -iE "$1" \
    | grep -v '\.sha256$' \
    | head -1
}

# Verify a download against the `.sha256` published beside it by the release
# workflow. A missing checksum is fatal, not a warning: silently installing an
# unverified binary is the whole thing this guards against.
# $1 = asset URL, $2 = local path.
verify_sha() {
  expected="$(curl -fsSL "$1.sha256" 2>/dev/null | awk '{print $1}')"
  [ -n "${expected}" ] || die "no .sha256 checksum published for $1"

  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$2" | awk '{print $1}')"
  else
    actual="$(shasum -a 256 "$2" | awk '{print $1}')"
  fi

  if [ "${expected}" != "${actual}" ]; then
    printf 'error: checksum mismatch for %s\n  expected %s\n  got      %s\n' \
      "$2" "${expected}" "${actual}" >&2
    exit 1
  fi
  printf 'Checksum verified.\n'
}

printf 'Installing markdn %s\n' "${TAG}"

# ── Install ──────────────────────────────────────────────────────────────────

case "${OS}" in
  Darwin)
    case "${ARCH}" in
      arm64)  URL="$(asset_url 'aarch64.*\.dmg$|arm64.*\.dmg$')" ;;
      x86_64) URL="$(asset_url 'x64.*\.dmg$|x86_64.*\.dmg$')" ;;
      *)      URL="" ;;
    esac
    [ -n "${URL}" ] || URL="$(asset_url '\.dmg$')"
    [ -n "${URL}" ] || die "no macOS .dmg in ${TAG}"

    TMP="$(mktemp -d)"
    trap 'hdiutil detach "${TMP}/mnt" -quiet 2>/dev/null || true; rm -rf "${TMP}"' EXIT INT TERM

    printf 'Downloading %s\n' "$(basename "${URL}")"
    curl -fsSL --progress-bar "${URL}" -o "${TMP}/markdn.dmg"
    verify_sha "${URL}" "${TMP}/markdn.dmg"

    MNT="${TMP}/mnt"
    mkdir -p "${MNT}"
    hdiutil attach "${TMP}/markdn.dmg" -nobrowse -quiet -mountpoint "${MNT}"

    APP="$(find "${MNT}" -maxdepth 1 -name '*.app' | head -1)"
    [ -n "${APP}" ] || die "no .app inside the disk image"

    NAME="$(basename "${APP}")"
    printf 'Installing %s to /Applications\n' "${NAME}"
    rm -rf "/Applications/${NAME}"
    cp -R "${APP}" /Applications/
    hdiutil detach "${MNT}" -quiet || true

    # markdn ships unsigned (no Apple Developer ID yet). Without stripping the
    # quarantine flag Gatekeeper refuses to open it at all, with the misleading
    # "markdn is damaged and can't be opened". The Homebrew cask does the same in
    # its postflight. Remove both once the DMG is signed and notarised.
    xattr -dr com.apple.quarantine "/Applications/${NAME}" 2>/dev/null || true

    # The `markdn` command ships inside the bundle; link it onto the PATH.
    CLI="/Applications/${NAME}/Contents/Resources/cli/markdn"
    if [ -f "${CLI}" ]; then
      chmod +x "${CLI}"
      mkdir -p "${BIN_DIR}"
      ln -sf "${CLI}" "${BIN_DIR}/markdn"
    fi

    printf '\n%s installed to /Applications.\n' "${NAME}"
    if [ -f "${CLI}" ]; then
      printf 'Open a document from a terminal with: markdn notes.md\n'
    else
      printf 'Launch it from Spotlight, or: open -a "%s"\n' "${NAME%.app}"
    fi
    ;;

  Linux)
    [ "${ARCH}" = "x86_64" ] || die "no Linux build for ${ARCH} (x86_64 only for now)"

    URL="$(asset_url '\.AppImage$')"
    [ -n "${URL}" ] || die "no Linux .AppImage in ${TAG}"

    TMP="$(mktemp -d)"
    trap 'rm -rf "${TMP}"' EXIT INT TERM

    printf 'Downloading %s\n' "$(basename "${URL}")"
    curl -fsSL --progress-bar "${URL}" -o "${TMP}/markdn.AppImage"
    verify_sha "${URL}" "${TMP}/markdn.AppImage"

    APPIMAGE="${LIB_DIR}/markdn.AppImage"
    mkdir -p "${LIB_DIR}" "${BIN_DIR}"
    mv "${TMP}/markdn.AppImage" "${APPIMAGE}"
    chmod +x "${APPIMAGE}"

    # The `markdn` command. The AppImage takes paths itself (a running markdn
    # gets them through its single-instance handoff), but started from a
    # terminal it would hold that terminal for as long as the app runs, so the
    # command starts it detached. This replaces the AppImage that older
    # installers put at this path.
    cat > "${BIN_DIR}/markdn" <<WRAPPER
#!/bin/sh
# markdn: open documents and folders in the markdn app from a terminal.
#
#   markdn                 bring markdn forward (starting it if needed)
#   markdn notes.md        open a document
#   markdn ~/notes         make a folder the root
#
# Written by install.sh; the app itself is ${APPIMAGE}.
set -eu
for arg in "\$@"; do
  case "\${arg}" in
    -h | --help) sed -n '2,7s/^# \\{0,1\\}//p' "\$0"; exit 0 ;;
    -*) printf 'markdn: unknown option %s\\n' "\${arg}" >&2; exit 2 ;;
  esac
  [ -e "\${arg}" ] || { printf 'markdn: %s: no such file or directory\\n' "\${arg}" >&2; exit 1; }
done
nohup "${APPIMAGE}" "\$@" >/dev/null 2>&1 &
WRAPPER
    chmod +x "${BIN_DIR}/markdn"
    printf '\nmarkdn installed to %s, with the markdn command in %s\n' "${LIB_DIR}" "${BIN_DIR}"

    # An AppImage sitting in a lib directory is invisible to the desktop
    # launcher, so give it an entry. Best-effort: a headless box has no
    # applications dir.
    DESKTOP_DIR="${HOME}/.local/share/applications"
    if mkdir -p "${DESKTOP_DIR}" 2>/dev/null; then
      cat > "${DESKTOP_DIR}/markdn.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=markdn
Comment=Markdown and MDX viewer and editor
Exec=${APPIMAGE} %F
Terminal=false
Categories=Development;TextEditor;
MimeType=text/markdown;
DESKTOP
      printf 'Desktop entry written to %s/markdn.desktop\n' "${DESKTOP_DIR}"
    fi
    ;;

  *)
    printf 'error: unsupported platform: %s\n' "${OS}" >&2
    printf '  Download a bundle from https://github.com/%s/releases\n' "${REPO}" >&2
    exit 1
    ;;
esac

if [ -e "${BIN_DIR}/markdn" ]; then
  case ":${PATH}:" in
    *":${BIN_DIR}:"*) ;;
    *) printf '\nAdd %s to your PATH to use the markdn command.\n' "${BIN_DIR}" ;;
  esac
fi

printf '\nWhile markdn is running it serves its UI and an MCP server on\n'
printf '127.0.0.1:43118. To let an agent read and write the documents you have\n'
printf 'open, point an MCP client at:\n'
printf '\n    http://localhost:43118/mcp\n'
printf '\nBy default it can only touch markdown under your home directory. Narrow\n'
printf 'that by launching with MARKDN_ROOT set to the directory you want it\n'
printf 'confined to.\n'
