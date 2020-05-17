#!/bin/bash

INSTALL_DIR="/usr/lib/github-desktop"
CLI_DIR="$INSTALL_DIR/resources/app/static"

# add executable permissions for CLI interface
chmod +x "$CLI_DIR"/github || :

# create symbolic links to /usr/bin directory
ln -f -s "$CLI_DIR"/github /usr/bin || :

exit 0
