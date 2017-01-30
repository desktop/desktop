#!/bin/sh

# We set HOME to an empty string in lib/git/core.ts to avoid picking up the
# user's git config, but our AskPass script needs it in order to find the user's
# keychain.
env -u HOME ELECTRON_RUN_AS_NODE=1 "$DESKTOP_PATH" "$DESKTOP_ASKPASS_SCRIPT" "$@"
