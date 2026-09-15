#!/usr/bin/env bash
# Check the latest published version of a package on npm.
#
# Usage:
#   check-npm.sh <package-name>
#
# Examples:
#   check-npm.sh dugite

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: check-npm.sh <package-name>"
  exit 1
fi

PACKAGE="$1"

echo "=== npm package: ${PACKAGE} ==="
echo ""

echo "Latest version (latest tag):"
npm view "${PACKAGE}" dist-tags.latest 2>/dev/null || echo "  (could not fetch)"

echo ""
echo "All dist-tags:"
npm view "${PACKAGE}" dist-tags --json 2>/dev/null || echo "  (could not fetch)"

echo ""
echo "Recent versions:"
npm view "${PACKAGE}" versions --json 2>/dev/null | tail -10 || echo "  (could not fetch)"
