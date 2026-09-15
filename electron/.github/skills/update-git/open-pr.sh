#!/usr/bin/env bash
# Open the most recently created PR in a desktop/* repository in the browser.
#
# Usage:
#   open-pr.sh <repo> [search-term]
#
# Examples:
#   open-pr.sh dugite-native
#   open-pr.sh dugite-native "Update G4W"
#   open-pr.sh dugite

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: open-pr.sh <repo> [search-term]"
  exit 1
fi

REPO="$1"
FULL_REPO="desktop/${REPO}"
SEARCH="${2:-}"

if [ -n "${SEARCH}" ]; then
  PR_URL=$(gh pr list --repo "${FULL_REPO}" --state open --limit 1 --search "${SEARCH}" --json url --jq '.[0].url' 2>/dev/null)
else
  PR_URL=$(gh pr list --repo "${FULL_REPO}" --state open --limit 1 --sort created --json url --jq '.[0].url' 2>/dev/null)
fi

if [ -z "${PR_URL}" ] || [ "${PR_URL}" = "null" ]; then
  echo "❌ No open PR found in ${FULL_REPO}"
  exit 1
fi

echo "Opening ${PR_URL}"
open "${PR_URL}"
