#!/usr/bin/env bash
# Check the latest available versions of Git, Git for Windows, Git LFS, and
# Git Credential Manager from their GitHub repositories.

set -euo pipefail

echo "=== Latest Available Versions ==="
echo ""

echo "Git (git/git):"
gh api repos/git/git/tags --jq '.[0].name' 2>/dev/null | xargs -I{} echo "  {}" || echo "  (could not fetch)"

echo ""
echo "Git for Windows (git-for-windows/git):"
gh release view --repo git-for-windows/git --json tagName,publishedAt --jq '"  \(.tagName) (released \(.publishedAt | split("T")[0]))"' 2>/dev/null || echo "  (could not fetch)"

echo ""
echo "Git LFS (git-lfs/git-lfs):"
gh release view --repo git-lfs/git-lfs --json tagName,publishedAt --jq '"  \(.tagName) (released \(.publishedAt | split("T")[0]))"' 2>/dev/null || echo "  (could not fetch)"

echo ""
echo "Git Credential Manager (git-ecosystem/git-credential-manager):"
gh release view --repo git-ecosystem/git-credential-manager --json tagName,publishedAt --jq '"  \(.tagName) (released \(.publishedAt | split("T")[0]))"' 2>/dev/null || echo "  (could not fetch)"

echo ""
echo "=== Currently Shipped in dugite-native ==="
gh release view --repo desktop/dugite-native --json tagName,publishedAt,body --jq '"  Release: \(.tagName) (published \(.publishedAt | split("T")[0]))"' 2>/dev/null || echo "  (could not fetch)"
