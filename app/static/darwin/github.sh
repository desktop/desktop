#!/bin/sh

# The least terrible way to resolve a symlink to its real path.
function realpath() {
  /usr/bin/python -c "import os,sys; print(os.path.realpath(sys.argv[1]))" "$0";
}

CONTENTS="$(dirname "$(dirname "$(dirname "$(dirname "$(realpath "$0")")")")")"
BINARY_NAME="$(ls "$CONTENTS/MacOS/")"
ELECTRON="$CONTENTS/MacOS/$BINARY_NAME"
CLI="$CONTENTS/Resources/app/cli.js"

ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "$CLI" "$@"

exit $?
