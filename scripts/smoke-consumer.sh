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
env -i PATH=/nonexistent HOME="$workspace" "$binary" form --definition form.json --values values.json --interactive never >response.json
printf '%s\n' '{"apiVersion":1,"status":"ok","id":"consumer","values":{"approved":false}}' >expected.json
cmp expected.json response.json
cat >presentation.json <<'JSON'
{"protocolVersion":2,"state":{"run":{"kind":"present","value":{"id":"consumer","title":"Consumer smoke","state":{"kind":"succeeded","data":{"kind":"none"}}}},"items":[]}}
JSON
env -i PATH=/nonexistent HOME="$workspace" "$binary" presentation capabilities >capabilities.json
grep -q '"protocolVersion":2' capabilities.json
env -i PATH=/nonexistent HOME="$workspace" "$binary" presentation static --input presentation.json >static-response.json 2>static-screen.txt
printf '%s\n' '{"protocolVersion":2,"status":"ok","runId":"consumer","runState":"succeeded"}' >expected-static.json
cmp expected-static.json static-response.json
grep -q 'Consumer smoke' static-screen.txt
cat >events.ndjson <<'NDJSON'
{"protocolVersion":2,"runId":"consumer","seq":0,"type":"run.started","title":"Consumer smoke"}
{"protocolVersion":2,"runId":"consumer","seq":1,"type":"run.finished","result":{"kind":"succeeded","data":{"kind":"none"}}}
NDJSON
env -i PATH=/nonexistent HOME="$workspace" "$binary" presentation live --record recording.ndjson <events.ndjson >live-response.json 2>live-screen.txt
grep -q '"status":"complete"' live-response.json
grep -q '"kind":"trailer"' recording.ndjson
env -i PATH=/nonexistent HOME="$workspace" "$binary" presentation report --input recording.ndjson --output report.html >report-response.json
grep -q '"status":"complete"' report-response.json
grep -q 'Consumer smoke' report.html
grep -q 'Recording complete' report.html
printf 'Independent consumer passed: %s\n' "$version"
