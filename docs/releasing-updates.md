# Releasing Updates

1. Bump `version` in [`app/package.json`](../app/package.json).
2. Push the version bump.
3. Create a tag for the version (e.g., `git tag release-1.1.1`).
4. Push the tag.
5. Run `.release desktop/YOUR_BRANCH to {prod|testing|beta}`.
