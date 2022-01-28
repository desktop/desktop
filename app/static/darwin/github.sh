#!/bin/sh

# The least terrible way to resolve a symlink to its real path.
function realpath() {
  /usr/bin/perl -e "use Cwd;print Cwd::abs_path(@ARGV[0])" "$0";
}

CONTENTS="$(dirname "$(dirname "$(dirname "$(dirname "$(realpath "$0")")")")")"
BINARY_NAME="$(ls "$CONTENTS/MacOS/")"
ELECTRON="$CONTENTS/MacOS/$BINARY_NAME"
CLI="$CONTENTS/Resources/app/cli.js"

ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "$CLI" "$@"

exit $?
