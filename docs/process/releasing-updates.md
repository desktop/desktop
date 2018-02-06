# Releasing Updates

## Channels

We have three channels to which we can release: `production`, `beta`, and `test`.

- `production` is the channel from which the general public downloads and receives updates. It should be stable and polished.

- `beta` is released more often than `production`. It may be buggy and unpolished.

- `test` is unlike the other two. It does not receive updates. Each test release is locked in time. It's used entirely for providing test releases.

## The Process

1. Ensure the release notes for `$version` in [`changelog.json`](../../changelog.json) are up-to-date.
1. Bump `version` in [`app/package.json`](../../app/package.json) to `$version`.
1. Commit & push the changes.
1. Run `.release! desktop/YOUR_BRANCH to {production|beta|test}`.
  * We're using `.release` with a bang so that we don't have to wait for any current CI on the branch to finish. This might feel a little wrong, but it's OK since making the release itself will also run CI.
1. If you're releasing a production update, release a beta update for the next version too, so that beta users are on the latest release.

## Error Reporting

If an error occurs during the release process, a needle will be reported to Central's [haystack](https://haystack.githubapp.com/central).
