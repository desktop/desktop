# Releasing Updates

## Iterations

As part of the beta process, the team will be publishing updates as frequently
as necessary. As things stabilize and we get feedback about the beta we'll
update this process.

## The Process

1. Ensure the release notes for `RELEASE_VERSION` in [`changelog.json`](../../changelog.json) are up-to-date.
1. Bump `version` in [`app/package.json`](../../app/package.json) to `RELEASE_VERSION`.
1. Create a new, empty entry in [`changelog.json`](../../changelog.json) for `RELEASE_VERSION + 1`.
1. Commit & push the changes.
1. Run `.release! desktop/YOUR_BRANCH to {production|test}`.
  * We're using `.release` with a bang so that we don't have to wait for any current CI on the branch to finish. This might feel a little wrong, but it's OK since making the release itself will also run CI.

## Error Reporting

If an error occurs during the release process, a needle will be reported to Central's [haystack](https://haystack.githubapp.com/central).
