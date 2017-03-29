# Releasing Updates

1. Ensure the release notes for this version in [`changelog.json`](../changelog.json) are up-to-date.
1. Bump `version` in [`app/package.json`](../app/package.json).
1. Create a new, empty entry in [`changelog.json`](../changelog.json) for the next version.
1. Commit & push the changes.
1. Run `.release desktop/YOUR_BRANCH to {production|test}`.

## Error Reporting

If an error occurs during the release process, a needle will be reported to Central's [haystack](https://haystack.githubapp.com/central).
