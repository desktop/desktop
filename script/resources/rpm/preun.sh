#!/bin/bash

BASE_FILE="/usr/bin/github"

# remove symbolic links in /usr/bin directory
test -f ${BASE_FILE} && unlink ${BASE_FILE}

exit 0
