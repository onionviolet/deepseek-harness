#!/bin/sh
# Run from the target project. The dsh launcher owns Node and profile startup.
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec dsh --profile headless \
  --patch "$script_dir/headless.patch.yml" "$@"
