# Releasing Updates

0. Add the release notes for this version in [`changelog.json`](../changelog.json) through a PR.
0. Bump `version` in [`app/package.json`](../app/package.json).
0. Push the version bump.
0. Run `.release desktop/YOUR_BRANCH to {production|test}`.

## Error Reporting

If an error occurs during the release process, a needle will be reported to Central's [haystack](https://haystack.githubapp.com/central).
