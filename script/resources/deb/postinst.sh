#!/bin/bash

set -e

PROFILE_D_FILE="/etc/profile.d/github-desktop.sh"
INSTALL_DIR="/usr/lib/github-desktop"
CLI_DIR="$INSTALL_DIR/resources/app/static"

case "$1" in
    configure)
      # add executable permissions for CLI interface
      chmod +x "$CLI_DIR"/github || :
      # check if this is a dev install or standard
      if [ -f "$INSTALL_DIR/github-desktop-dev" ]; then
	      BINARY_NAME="github-desktop-dev"
      else
	      BINARY_NAME="github-desktop"
      fi
      # create symbolic links to /usr/bin directory
      ln -f -s "$INSTALL_DIR"/$BINARY_NAME /usr/bin || :
      ln -f -s "$CLI_DIR"/github /usr/bin || :
    ;;

    abort-upgrade|abort-remove|abort-deconfigure)
    ;;

    *)
      echo "postinst called with unknown argument \`$1'" >&2
      exit 1
    ;;
esac

exit 0
