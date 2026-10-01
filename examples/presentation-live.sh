#!/bin/sh
set -eu

hamio_bin=${1:?Provide the hamio executable path}
outcome=${2:?Choose succeeded or failed}
if [ "$outcome" != succeeded ] && [ "$outcome" != failed ]; then
  printf '%s\n' 'Usage: presentation-live.sh [HAMIO_BINARY] [succeeded|failed]' >&2
  exit 2
fi
shift 2

{
  seq=0
  emit() {
    printf '{"protocolVersion":2,"runId":"build","seq":%s,%s}\n' "$seq" "$1"
    seq=$((seq + 1))
  }
  emit '"type":"run.started","title":"Build project"'
  emit '"type":"task.declared","taskId":"compile","label":"Compile sources","placement":{"kind":"root"}'
  emit '"type":"task.started","taskId":"compile"'
  emit '"type":"task.progressed","taskId":"compile","progress":{"kind":"determinate","current":1,"total":2}'
  sleep 0.3
  if [ "$outcome" = succeeded ]; then
    emit '"type":"task.finished","taskId":"compile","result":{"kind":"succeeded","data":{"kind":"none"}}'
    emit '"type":"content.published","item":{"kind":"message","level":"success","text":"Artifacts are ready."}'
    emit '"type":"run.finished","result":{"kind":"succeeded","data":{"kind":"none"}}'
  else
    emit '"type":"task.finished","taskId":"compile","result":{"kind":"failed","failure":{"code":"COMPILE_FAILED","message":"Compiler reported an error.","details":{"kind":"none"}}}'
    emit '"type":"content.published","item":{"kind":"message","level":"warning","text":"Review compiler output."}'
    emit '"type":"run.finished","result":{"kind":"failed","failure":{"code":"BUILD_FAILED","message":"Build did not complete.","details":{"kind":"none"}}}'
  fi
} | "$hamio_bin" presentation live "$@"
