#!/bin/sh
# Install a verified, explicitly selected GitHub Release. Never invoked by hamio itself.
set -eu
umask 077

fail() {
  printf 'hamio install: %s\n' "$*" >&2
  exit 1
}
usage() {
  printf '%s\n' 'Usage: sh install.sh [--version vX.Y.Z] [--prefix DIRECTORY]' \
    'Defaults: version from .hamio-version, prefix .tools in the current directory.'
}

version=''
prefix="$PWD/.tools"
while [ "$#" -gt 0 ]; do
  case "$1" in
  --version | --prefix)
    [ "$#" -ge 2 ] || fail "Missing value for $1"
    case "$1" in --version) version=$2 ;; --prefix) prefix=$2 ;; esac
    shift 2
    ;;
  --help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    fail "Unknown argument: $1"
    ;;
  esac
done
if [ -z "$version" ]; then
  [ -f .hamio-version ] || fail 'Specify --version vX.Y.Z or create .hamio-version.'
  version=$(cat .hamio-version)
fi
case "$version" in *[!v0-9.]*) fail 'Expected an exact vX.Y.Z version.' ;; esac
printf '%s\n' "$version" | LC_ALL=C grep -Eq '^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' || fail 'Expected an exact vX.Y.Z version.'
[ "${#version}" -le 64 ] || fail 'Version is too long.'
[ -n "$prefix" ] || fail 'Prefix must not be empty.'
case "$prefix" in /*) ;; *) prefix="$PWD/$prefix" ;; esac
case "$(uname -s)/$(uname -m)" in
Darwin/arm64) platform=darwin-arm64 ;;
Linux/x86_64) platform=linux-x64 ;;
Linux/aarch64 | Linux/arm64) platform=linux-arm64 ;;
*) fail 'Supported platforms: macOS arm64, Linux x64/arm64 (glibc).' ;;
esac
command -v gh >/dev/null 2>&1 || fail 'Install GitHub CLI first (tested with 2.100.0).'
gh release verify --help >/dev/null 2>&1 || fail 'Upgrade GitHub CLI: release verify is required.'
gh release verify-asset --help >/dev/null 2>&1 || fail 'Upgrade GitHub CLI: release verify-asset is required.'
command -v gzip >/dev/null 2>&1 || fail 'gzip is required.'
if command -v sha256sum >/dev/null 2>&1; then
  digest() { sha256sum "$1" | awk '{print $1}'; }
elif command -v shasum >/dev/null 2>&1; then
  digest() { shasum -a 256 "$1" | awk '{print $1}'; }
else
  fail 'sha256sum or shasum is required.'
fi

# The prefix must be writable only by trusted users, like any executable on PATH.
mkdir -p "$prefix"
prefix=$(CDPATH='' cd -- "$prefix" && pwd -P)
lock="$prefix/.hamio-install.lock"
mkdir "$lock" 2>/dev/null || fail "Another installation owns $lock. Remove it only after confirming that installer has stopped."
stage=''
cleanup() {
  if [ -n "$stage" ]; then rm -rf -- "$stage"; fi
  rmdir "$lock"
}
trap cleanup 0
trap 'exit 1' 1 2 15
stage=$(mktemp -d "$prefix/.hamio-install.XXXXXX")
link="$prefix/bin/hamio"
if [ -L "$link" ]; then
  case "$(readlink "$link")" in ../lib/hamio/v*/hamio) ;; *) fail "Refusing unmanaged symlink: $link" ;; esac
elif [ -e "$link" ]; then
  fail "Refusing to replace an unmanaged file: $link"
fi

export GH_HOST=github.com GH_PROMPT_DISABLED=1 GH_NO_UPDATE_NOTIFIER=1
repository=9uiLe/hamio
asset="hamio-$version-$platform"
gh release verify "$version" --repo "$repository"
commit=$(gh api "repos/$repository/commits/$version" --jq .sha)
[ "${#commit}" -eq 40 ] || fail 'Invalid release commit.'
printf '%s\n' "$commit" | LC_ALL=C grep -Eq '^[0-9a-f]{40}$' || fail 'Invalid release commit.'
gh release download "$version" --repo "$repository" --dir "$stage" \
  --pattern "$asset.gz" --pattern "$asset.sha256" --pattern "$asset.spdx.json" --pattern "$asset.notices.txt"
for suffix in .gz .sha256 .spdx.json .notices.txt; do
  file="$stage/$asset$suffix"
  gh release verify-asset "$version" "$file" --repo "$repository"
  gh attestation verify "$file" --repo "$repository" \
    --signer-workflow "$repository/.github/workflows/release.yml" \
    --source-ref "refs/tags/$version" --source-digest "$commit" --deny-self-hosted-runners
done
check_digest() {
  expected=$(awk -v name="$2" 'NF == 2 && $2 == name {print $1}' "$stage/$asset.sha256")
  [ "${#expected}" -eq 64 ] || fail "Invalid checksum for $2"
  printf '%s\n' "$expected" | LC_ALL=C grep -Eq '^[0-9a-f]{64}$' || fail "Invalid checksum for $2"
  [ "$(digest "$1")" = "$expected" ] || fail "Checksum mismatch: $2"
}
check_digest "$stage/$asset.gz" "$asset.gz"
# Stream decompression, with a file-size ceiling (at most 256 MiB on supported hosts).
(
  ulimit -f 262144
  gzip -dc "$stage/$asset.gz" >"$stage/hamio"
)
check_digest "$stage/hamio" hamio
chmod 755 "$stage/hamio"
actual=$(
  unset BUN_OPTIONS BUN_BE_BUN
  "$stage/hamio" --version
)
[ "$actual" = "${version#v}" ] || fail 'Executable version does not match the selected release.'
rm "$stage/$asset.gz"
printf '%s\n' "$commit" >"$stage/source-commit"

# Keep old versions for explicit rollback. Only the final symlink swap changes PATH.
target="$prefix/lib/hamio/$version-$platform"
mkdir -p "$prefix/lib/hamio" "$prefix/bin"
if [ -e "$target" ] || [ -L "$target" ]; then
  [ ! -L "$target" ] && [ -f "$target/hamio" ] && [ ! -L "$target/hamio" ] || fail "Invalid existing installation: $target"
  [ "$(digest "$target/hamio")" = "$(digest "$stage/hamio")" ] || fail "Existing version has different bytes: $target"
else
  mv "$stage" "$target"
  stage=$(mktemp -d "$prefix/.hamio-install.XXXXXX")
fi
ln -s "../lib/hamio/$version-$platform/hamio" "$stage/hamio-link"
mv -f "$stage/hamio-link" "$link"
printf 'Installed %s (%s): %s\n' "$version" "$commit" "$link"
