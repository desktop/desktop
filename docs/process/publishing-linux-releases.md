# Publishing Linux Releases

This document outlines the steps I take once a release has been published from
the main GitHub Desktop project.

This document assumes you have these remotes configured:

```
$ git remote -v
origin	https://github.com/shiftkey/desktop (fetch)
origin	https://github.com/shiftkey/desktop (push)
upstream	https://github.com/desktop/desktop (fetch)
upstream	https://github.com/desktop/desktop (push)
```

Ensure that `development` and `linux` are up-to-date:

```
$ git fetch --all
$ git checkout development
$ git reset upstream/development --hard
$ git push origin development
$ git checkout linux
$ git reset origin/linux --hard
$ git rebase development linux
```

We want to ensure our changes work against the current branch, so take some time
to rebase the changes and force push `linux` once you're done.

```
$ git push origin linux --force-with-lease
```

Wait for the continuous integration tests to pass. If `linux` is not passing the
continuous integration tests we need to investigate and identify why things are
no longer working.

### 1. Create a branch from the release tag

Each release tag from the upstream project matches the format `release-X.Y.Z`
where `X.Y.Z` are version numbers. We should create a corresponding branch in
this repository named `linux-release-X.Y.Z` as a starting point for the next
Linux release.

On the command line, this looks like this (using the `2.1.3` release as an
example):

```
$ git checkout -b linux-release-2.1.3 release-2.1.3
$ git push origin linux-release-2.1.3 -u
```

### 2. Open pull request to apply the necessary patches to the new branch

The first step to cutting a release is to backport the latest fixes to the
release branch:

```
$ git checkout -b apply-changes-2.1.3 linux
$ git submodule update
$ git rebase --onto linux-release-2.1.3 development apply-changes-2.1.3
```

Work through the conflicts reported until the branch is cleanly applied to the
previous release.

When the branch is ready to go, push the branch to the remote:

```
$ git push origin apply-changes-2.1.3 -u
```

Open a pull request that targets `linux-release-2.1.3`. Review the changes and
ensure the tests pass.

### 3. Approve and merge PR

If we're satisifed with the pull request, we can merge the pull request to
update the release branch.

Ensure **rebase and merge** is used here, as we want to preserve the commit
history as-is without introducing merge commits.

If there are additional changes that need to go into the release, make sure to
include them

### 4. Tag the release

Ensure you are on the latest version that passes all tests:

```
$ git checkout linux-release-2.1.3
$ git pull
```

We need to bump the version here to indicate this is not the exact same version
as the original release. The convention we follow is `release-X.Y.Z-linuxA`
where `A` is an auto-incrementing number (starting from 1).

Update the `version` field in `app/package.json` to this new version. For
example, updating to the first release of `2.1.3` would look like this:

```diff
diff --git a/app/package.json b/app/package.json
index fbbbb976f..3baaf9e33 100644
--- a/app/package.json
+++ b/app/package.json
@@ -3,7 +3,7 @@
   "productName": "GitHub Desktop",
   "bundleID": "com.github.GitHubClient",
   "companyName": "GitHub, Inc.",
-  "version": "2.1.0",
+  "version": "2.1.3-linux1",
   "main": "./main.js",
   "repository": {
     "type": "git",
```

Commit and push this change to ensure we still pass the CI suite:

```
$ git commit -am "bump version for release"
$ git push 
```

With this passing CI, we can tag this version to indicate this is what we are
releasing:

```
$ git tag release-2.1.3-linux1
```

With those things in place, push the changes to the branch as well as the new
tag:

```
$ git push --follow-tags
```

### 5. Publish to GitHub

After the tagged build completes, it will have the installers available as
artifacts. Over on Azure Pipelines - switch to the Releases tab and run "Publish
to Beta Channel" with the Snap release disabled
([**#204**](https://github.com/shiftkey/desktop/issues/202) is the tracking
issue for re-enabling that).

When that is done, there should be a draft release available assigned to the tag
from earlier. Edit the release to add the release notes and checksums.

**TODO:** it'd be great to have some sort of script to generate the release
notes from the changelog in this "markdown + sections" format, which would save
a lot of manual effort.
