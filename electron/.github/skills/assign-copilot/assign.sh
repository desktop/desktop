#!/usr/bin/env bash
set -euo pipefail

ISSUE_NUMBER="${1:-}"
CUSTOM_AGENT="${2:-}"

if [ -z "$ISSUE_NUMBER" ]; then
  echo "Usage: assign.sh <issue-number> [custom-agent-name]"
  echo "Example: assign.sh 42 deskocat"
  exit 1
fi

# Detect repo owner/name from git remote
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null)
if [ -z "$REPO" ]; then
  echo "Error: Could not detect repository. Make sure you're in a git repo with a GitHub remote."
  exit 1
fi

OWNER="${REPO%%/*}"
NAME="${REPO##*/}"

echo "Assigning issue #${ISSUE_NUMBER} in ${REPO} to Copilot..."

if [ -n "$CUSTOM_AGENT" ]; then
  echo "Using custom agent: ${CUSTOM_AGENT}"
  gh api "repos/${OWNER}/${NAME}/issues/${ISSUE_NUMBER}" \
    -X PATCH \
    --silent \
    -f "assignees[]=copilot-swe-agent[bot]" \
    -f "agent_assignment[custom_agent]=${CUSTOM_AGENT}" 2>&1
else
  gh issue edit "$ISSUE_NUMBER" --add-assignee "@copilot" --repo "$REPO" 2>&1
fi

echo ""
echo "✅ Issue #${ISSUE_NUMBER} assigned to Copilot."
echo "   https://github.com/${REPO}/issues/${ISSUE_NUMBER}"
