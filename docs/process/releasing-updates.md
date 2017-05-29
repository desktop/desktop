# Releasing Updates

## Iterations

As part of the beta process, the team will be publishing updates as frequently
as necessary. As things stabilize and we get feedback about the beta we'll
update this process.

## The Process

1. Ensure the release notes for `RELEASE_VERSION` in [`changelog.json`](../changelog.json) are up-to-date.
1. Bump `version` in [`app/package.json`](../app/package.json) to `RELEASE_VERSION`.
1. Create a new, empty entry in [`changelog.json`](../changelog.json) for `RELEASE_VERSION + 1`.
1. Commit & push the changes.
1. Run `.release desktop/YOUR_BRANCH to {production|test}`.

## Error Reporting

If an error occurs during the release process, a needle will be reported to Central's [haystack](https://haystack.githubapp.com/central).
