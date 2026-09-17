#!/bin/sh
set -eu

repo_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
hamio_bin=${1:-"$repo_dir/dist/hamio"}
# A consumer captures the JSON response. Business decisions remain in this script.
response=$(
  printf '%s\n' '{"environment":"local","approved":false}' |
    "$hamio_bin" form --definition "$repo_dir/examples/form.json" --values - --interactive never
)
printf '%s\n' "$response"
