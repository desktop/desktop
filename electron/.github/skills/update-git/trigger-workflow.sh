#!/usr/bin/env bash
# Trigger a GitHub Actions workflow in a desktop/* repository.
#
# Usage:
#   trigger-workflow.sh <repo> <workflow> [key=value ...]
#
# Examples:
#   trigger-workflow.sh dugite-native update-dependencies git=v2.48.0 g4w=v2.48.0.windows.1 lfs=skip gcm=skip
#   trigger-workflow.sh dugite-native release version=v2.48.0 draft=false prerelease=false dry-run=true
#   trigger-workflow.sh dugite update-git
#   trigger-workflow.sh dugite publish version=minor tag=latest dry-run=true

set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: trigger-workflow.sh <repo> <workflow> [key=value ...]"
  echo ""
  echo "Repos: dugite-native, dugite"
  echo ""
  echo "Workflows:"
  echo "  dugite-native:"
  echo "    update-dependencies  - Update Git, G4W, LFS, GCM versions"
  echo "    release              - Publish a new release"
  echo "  dugite:"
  echo "    update-git           - Update embedded git (pulls latest dugite-native)"
  echo "    publish              - Publish to npm"
  exit 1
fi

REPO="$1"
WORKFLOW="$2"
shift 2

FULL_REPO="desktop/${REPO}"

# Map workflow short names to filenames
case "${REPO}/${WORKFLOW}" in
  dugite-native/update-dependencies)
    WORKFLOW_FILE="update-dependencies.yml"
    ;;
  dugite-native/release)
    WORKFLOW_FILE="release.yml"
    ;;
  dugite/update-git)
    WORKFLOW_FILE="update-git.yml"
    ;;
  dugite/publish)
    WORKFLOW_FILE="publish.yml"
    ;;
  *)
    echo "Error: Unknown workflow '${WORKFLOW}' for repo '${REPO}'"
    exit 1
    ;;
esac

# Build the -f flags for workflow inputs
FIELD_ARGS=()
for arg in "$@"; do
  FIELD_ARGS+=("-f" "$arg")
done

echo "Triggering workflow '${WORKFLOW_FILE}' in ${FULL_REPO}..."
if [ ${#FIELD_ARGS[@]} -gt 0 ]; then
  echo "  Inputs: $*"
fi
echo ""

gh workflow run "${WORKFLOW_FILE}" \
  --repo "${FULL_REPO}" \
  "${FIELD_ARGS[@]+"${FIELD_ARGS[@]}"}"

echo "✅ Workflow triggered successfully!"
echo ""
echo "View the run at:"
echo "  https://github.com/${FULL_REPO}/actions/workflows/${WORKFLOW_FILE}"
echo ""
echo "Or check status with:"
echo "  bash $(dirname "$0")/check-workflow.sh ${REPO}"

open "https://github.com/${FULL_REPO}/actions/workflows/${WORKFLOW_FILE}"
