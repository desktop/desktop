#!/usr/bin/env bash
# Check the status of the most recent workflow runs in a desktop/* repository.
#
# Usage:
#   check-workflow.sh <repo> [workflow-name]
#
# Examples:
#   check-workflow.sh dugite-native
#   check-workflow.sh dugite-native update-dependencies
#   check-workflow.sh dugite publish

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: check-workflow.sh <repo> [workflow-name]"
  exit 1
fi

REPO="$1"
FULL_REPO="desktop/${REPO}"
WORKFLOW="${2:-}"

echo "=== Recent Workflow Runs for ${FULL_REPO} ==="
echo ""

if [ -n "${WORKFLOW}" ]; then
  # Map short names to filenames
  case "${REPO}/${WORKFLOW}" in
    dugite-native/update-dependencies) WORKFLOW_FILE="update-dependencies.yml" ;;
    dugite-native/release)             WORKFLOW_FILE="release.yml" ;;
    dugite/update-git)                 WORKFLOW_FILE="update-git.yml" ;;
    dugite/publish)                    WORKFLOW_FILE="publish.yml" ;;
    *)                                 WORKFLOW_FILE="${WORKFLOW}" ;;
  esac

  gh run list --repo "${FULL_REPO}" --workflow "${WORKFLOW_FILE}" --limit 5
else
  gh run list --repo "${FULL_REPO}" --limit 10
fi

echo ""

# Also check for any open PRs that look related to dependency updates
echo "=== Open Pull Requests ==="
gh pr list --repo "${FULL_REPO}" --limit 5 --state open
