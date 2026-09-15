#!/usr/bin/env bash
# Check if a specific release exists in a desktop/* repository.
#
# Usage:
#   check-release.sh <repo> <version-tag>
#
# Examples:
#   check-release.sh dugite-native v2.48.0
#   check-release.sh dugite v3.1.0

set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: check-release.sh <repo> <version-tag>"
  exit 1
fi

REPO="$1"
TAG="$2"
FULL_REPO="desktop/${REPO}"

echo "Checking for release ${TAG} in ${FULL_REPO}..."
echo ""

if gh release view "${TAG}" --repo "${FULL_REPO}" --json tagName,isDraft,isPrerelease,publishedAt,url 2>/dev/null; then
  echo ""
  echo "✅ Release ${TAG} exists!"
else
  echo "❌ Release ${TAG} not found in ${FULL_REPO}."
  echo ""
  echo "Latest release:"
  gh release view --repo "${FULL_REPO}" --json tagName,publishedAt,url --jq '"  \(.tagName) (published \(.publishedAt | split("T")[0]))\n  \(.url)"' 2>/dev/null || echo "  (no releases found)"
fi
