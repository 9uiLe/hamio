#!/bin/sh
# Exercise the public binary from an independent Git project, without development runtimes.
set -eu
binary=$1
version=$2
case "$binary" in /*) ;; *) binary="$PWD/$binary" ;; esac
workspace=$(mktemp -d)
trap 'rm -rf "$workspace"' 0
trap 'exit 1' 1 2 15
git init -q "$workspace"
cd "$workspace"
cat >form.json <<'JSON'
{"apiVersion":1,"id":"consumer","fields":[{"id":"approved","kind":"confirm","label":"Continue?"}]}
JSON
printf '%s\n' '{"approved":false}' >values.json
test "$(env -i PATH=/nonexistent HOME="$workspace" "$binary" --version)" = "$version"
env -i PATH=/nonexistent HOME="$workspace" "$binary" capabilities >capabilities.json
env -i PATH=/nonexistent HOME="$workspace" "$binary" form --definition form.json --values values.json --interactive never >response.json
printf '%s\n' '{"apiVersion":1,"status":"ok","id":"consumer","values":{"approved":false}}' >expected.json
cmp expected.json response.json
printf 'Independent consumer passed: %s\n' "$version"
