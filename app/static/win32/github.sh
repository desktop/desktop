#!/bin/sh

CONTENTS="$(dirname "$(dirname "$(dirname "$(dirname "$(realpath "$0")")")")")"
ELECTRON="$CONTENTS/GitHubDesktop.exe"

if grep -q Microsoft /proc/version; then
	if [ -x /bin/wslpath ]; then
		# On recent WSL builds, we just need to set WSLENV so that
		# ELECTRON_RUN_AS_NODE is visible to the win32 process
		export WSLENV=ELECTRON_RUN_AS_NODE/w:$WSLENV
		CLI=$(wslpath -m "$CONTENTS/resources/app/cli.js")
	else
		# If running under older WSL, don't pass cli.js to Electron as
		# environment vars cannot be transferred from WSL to Windows
		# See: https://github.com/Microsoft/BashOnWindows/issues/1363
		#      https://github.com/Microsoft/BashOnWindows/issues/1494
		"$ELECTRON" "$@"
		exit $?
	fi
elif [ "$(expr substr $(uname -s) 1 9)" = "CYGWIN_NT" ]; then
	CLI=$(cygpath -m "$CONTENTS/resources/app/cli.js")
else
	CLI="$CONTENTS/resources/app/cli.js"
fi

ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "$CLI" "$@"

exit $?
