#!/bin/sh
set -eu

repo_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo_dir"

if [ "${HAMIO_PREVIEW_SHELL:-}" != "1" ]; then
  if command -v nix >/dev/null 2>&1; then
    nix_bin=nix
  elif [ -x /nix/var/nix/profiles/default/bin/nix ]; then
    nix_bin=/nix/var/nix/profiles/default/bin/nix
  elif [ -x "$HOME/.nix-profile/bin/nix" ]; then
    nix_bin="$HOME/.nix-profile/bin/nix"
  else
    printf '%s\n' 'Nix is required. See docs/development.md.' >&2
    exit 1
  fi
  exec "$nix_bin" develop --no-write-lock-file "$repo_dir#preview" --command "$repo_dir/scripts/preview-env.sh" "$@"
fi

exec bun --no-env-file --no-install scripts/preview/generate.ts "$@"
