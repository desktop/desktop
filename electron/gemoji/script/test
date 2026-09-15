#!/bin/bash
# Usage: script/test [file]
set -e

case "$1" in
-h | --help )
  sed -ne '/^#/!q;s/.\{1,2\}//;1d;p' < "$0"
  exit 0
  ;;
esac

export RUBYOPT="$RUBYOPT -w"

exec bundle exec rake ${1:+TEST="$1"}
