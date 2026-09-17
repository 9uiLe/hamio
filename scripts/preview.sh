#!/bin/sh
set -eu

repo_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo_dir"

if [ "${HAMIO_DEV_SHELL:-}" = "1" ] || [ "${HAMIO_PREVIEW_SHELL:-}" = "1" ]; then
  exec bun --no-env-file --no-install scripts/preview/generate.ts "$@"
fi

exec "$repo_dir/scripts/preview-env.sh" "$@"
