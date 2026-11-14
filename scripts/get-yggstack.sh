#!/bin/sh
# Downloads yggstack release binaries into desktop/bin (for development)
# and vendor/yggstack (for packaging) for all supported platforms.
#
# Usage: ./scripts/get-yggstack.sh [version]
set -e

YGGSTACK_VERSION="${1:-1.0.6}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_URL="https://github.com/yggdrasil-network/yggstack/releases/download/${YGGSTACK_VERSION}"

fetch () {
  dest_dir="$1"
  name="$2"
  mkdir -p "$dest_dir"
  echo "downloading $name -> $dest_dir"
  curl -fSL --retry 3 -o "$dest_dir/$name" "$BASE_URL/$name"
}

# development binary for the host platform (desktop/bin/yggstack)
case "$(uname -s)/$(uname -m)" in
  Linux/x86_64)  host_bin="yggstack-linux-amd64-static" ;;
  Linux/aarch64) host_bin="yggstack-linux-arm64-static" ;;
  Darwin/x86_64) host_bin="yggstack-darwin-amd64" ;;
  Darwin/arm64)  host_bin="yggstack-darwin-arm64" ;;
  MINGW*/AMD64)  host_bin="yggstack-windows-amd64.exe" ;;
  *) echo "unsupported host platform, skipping dev binary"; host_bin="" ;;
esac

if [ -n "$host_bin" ]; then
  fetch "$ROOT/desktop/bin" "$host_bin"
  cp "$ROOT/desktop/bin/$host_bin" "$ROOT/desktop/bin/yggstack$(expr "$host_bin" : '.*windows' >/dev/null && echo .exe || true)"
  [ -f "$ROOT/desktop/bin/yggstack.exe" ] || chmod +x "$ROOT/desktop/bin/yggstack"
  chmod +x "$ROOT/desktop/bin/yggstack" 2>/dev/null || true
fi

# binaries packaged into installers / APK (vendor/yggstack)
fetch "$ROOT/vendor/yggstack" "yggstack-windows-amd64.exe"
fetch "$ROOT/vendor/yggstack" "yggstack-linux-amd64-static"
fetch "$ROOT/vendor/yggstack" "yggstack-linux-arm64-static"
fetch "$ROOT/vendor/yggstack" "yggstack-android-arm64"

echo "done"
