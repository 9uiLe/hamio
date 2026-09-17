#!/bin/sh
# Verify Actions artifacts. This does not substitute for immutable-release verification.
set -eu
umask 077
assets=$1
case "$assets" in /*) ;; *) assets="$PWD/$assets" ;; esac
case "$(uname -s)/$(uname -m)" in
Darwin/arm64) target=darwin-arm64 ;;
Linux/x86_64) target=linux-x64 ;;
Linux/aarch64 | Linux/arm64) target=linux-arm64 ;;
*) exit 1 ;;
esac
: "${RELEASE_TAG:?}" "${RELEASE_REF:?}" "${RELEASE_COMMIT:?}"
export GH_HOST=github.com GH_PROMPT_DISABLED=1
asset="hamio-$RELEASE_TAG-$target"
for file in "$assets"/*; do
  gh attestation verify "$file" --repo 9uiLe/hamio \
    --signer-workflow 9uiLe/hamio/.github/workflows/release.yml \
    --source-ref "$RELEASE_REF" --source-digest "$RELEASE_COMMIT" --deny-self-hosted-runners
done
workspace=$(mktemp -d)
trap 'rm -rf "$workspace"' 0
trap 'exit 1' 1 2 15
cp "$assets/$asset.gz" "$assets/$asset.sha256" "$workspace/"
(
  cd "$workspace"
  ulimit -f 262144
  gzip -dc "$asset.gz" >hamio
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c "$asset.sha256"
  else
    shasum -a 256 -c "$asset.sha256"
  fi
)
chmod 755 "$workspace/hamio"
sh scripts/smoke-consumer.sh "$workspace/hamio" "${RELEASE_TAG#v}"
