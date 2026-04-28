---
name: update-git
description: Walk through updating the version of Git shipped in GitHub Desktop. This is a multi-repo process spanning dugite-native, dugite, and desktop. Use this when asked to update Git, update Git for Windows, or bump the Git version.
---

# Update Git Version in GitHub Desktop

This skill guides the user through updating the version of Git that GitHub
Desktop ships. This is a multi-repo cascade:

1. **desktop/dugite-native** — bundles Git binaries for each platform
2. **desktop/dugite** — Node.js wrapper that consumes dugite-native releases
3. **desktop/desktop** — the app itself, consumes dugite as an npm dependency

Each step must complete (PR merged + release published) before the next can
begin.

## Information to Gather

Before starting, use `<skill-directory>/check-versions.sh` to show the user
what's currently shipped and what's available. Then ask the user which
components they want to update.

Even if the user only asks about one component (e.g., Git for Windows),
**proactively check all components** and recommend bundling any other available
updates. This avoids having to reship dugite-native if a test fails due to a
version mismatch in a component the user didn't update.

Gather the following:

- **Git version** (e.g., `v2.48.0`) — or `latest`
- **Git for Windows version** (e.g., `v2.48.0.windows.1`) — or `latest`
- **Git LFS version** — or `skip` if not updating (default: `skip`)
- **Git Credential Manager version** — or `skip` if not updating (default:
  `skip`)

## Step 1: Update Dependencies in dugite-native

Use the helper script to trigger the workflow:

```bash
bash <skill-directory>/trigger-workflow.sh dugite-native update-dependencies \
  git=<GIT_VERSION> g4w=<G4W_VERSION> lfs=<LFS_VERSION> gcm=<GCM_VERSION>
```

This triggers the **Update dependencies** workflow in `desktop/dugite-native`
which will:

- Update `dependencies.json` with new URLs and checksums
- Update the git submodule
- Automatically create a PR

**Important**: The Git and Git for Windows updates are handled by the same
workflow step. If you only want to update Git for Windows, you must still pass
the current Git version (not `skip`) for the `git` input, otherwise the step
will be skipped entirely. Use `<skill-directory>/check-versions.sh` to find the
current Git version and pass it as the `git` input. For example, if Git is
currently at `v2.53.0` and you only want to update GfW:

```bash
bash <skill-directory>/trigger-workflow.sh dugite-native update-dependencies \
  git=v2.53.0 g4w=v2.53.0.windows.2 lfs=skip gcm=skip
```

Tell the user to:

1. Wait for the workflow to complete — use the script to check status:
   ```bash
   bash <skill-directory>/check-workflow.sh dugite-native
   ```
2. When the PR is created, open it in the browser and enable auto-merge:
   ```bash
   bash <skill-directory>/open-pr.sh dugite-native
   gh pr merge --auto --squash <PR_NUMBER> --repo desktop/dugite-native
   ```
   Tell the user: "I've enabled auto-merge — please review the PR before CI
   finishes so it can merge automatically."

**Do not proceed to Step 2 until the PR is merged.**

## Step 2: Publish a dugite-native Release

Use the helper script to trigger the release workflow:

```bash
bash <skill-directory>/trigger-workflow.sh dugite-native release \
  version=<VERSION_TAG> draft=false prerelease=false dry-run=true
```

Suggest running with `dry-run=true` first. If it succeeds, re-run with
`dry-run=false`.

The version tag should follow Git's versioning scheme:

- `v2.48.0` for a new Git version
- `v2.48.0-1` if only packaging or other dependencies changed

Tell the user to:

1. Wait for the build to complete across all platforms
2. Review the draft release notes — remove infrastructure-only changes
3. Click **Publish** on the GitHub release page

Use this to check if the release exists:

```bash
bash <skill-directory>/check-release.sh dugite-native <VERSION_TAG>
```

**Do not proceed to Step 3 until the release is published.**

## Step 3: Update dugite-native Version in dugite

Trigger the **Update Git** workflow:

```bash
bash <skill-directory>/trigger-workflow.sh dugite update-git
```

No inputs are needed — it automatically fetches the latest dugite-native release.

The workflow creates a PR that updates `script/embedded-git.json`. Tell the user
to:

1. Wait for the workflow to complete
2. When the PR is created, open it in the browser and enable auto-merge:
   ```bash
   bash <skill-directory>/open-pr.sh dugite
   gh pr merge --auto --squash <PR_NUMBER> --repo desktop/dugite
   ```
   Tell the user: "I've enabled auto-merge — please review the PR before CI
   finishes so it can merge automatically."

**Do not proceed to Step 4 until the PR is merged.**

## Step 4: Publish dugite to npm

Trigger the **Publish** workflow:

```bash
bash <skill-directory>/trigger-workflow.sh dugite publish \
  version=<SEMVER_BUMP> tag=latest dry-run=true
```

- **version**: `minor` for a new Git version, `patch` for bugfix-only
- **tag**: `latest` for stable, `next` for pre-releases

Suggest running with `dry-run=true` first, then `dry-run=false`.

Verify the package was published:

```bash
bash <skill-directory>/check-npm.sh dugite
```

**Do not proceed to Step 5 until the npm package is published.**

## Step 5: Update dugite in desktop

Before proceeding, ask the user what they want to do with the dugite update:

1. **Just bump dugite** — create a PR with the version update on its own
2. **Prepare a production release** — include the dugite bump in a new
   production release (e.g., building on an existing beta tag)
3. **Prepare a beta release** — include the dugite bump in a new beta release
   off the development branch

### Option A: Just bump dugite (standalone PR)

**Important**: Desktop has a nested package structure. The dugite dependency
lives in `app/package.json`, not the root `package.json`. Do NOT run
`yarn upgrade dugite` from the repo root — it will add dugite to the wrong
package.json.

```bash
cd <desktop-repo-path>
git checkout development && git pull
git checkout -b update-dugite-<NEW_VERSION>
# Edit app/package.json to set dugite to "^<NEW_VERSION>"
cd app && yarn install && cd ..
yarn why dugite
git add app/package.json app/yarn.lock
git commit -m "Update dugite to <NEW_VERSION>"
git push origin HEAD
gh pr create --title "Update dugite to <NEW_VERSION> (Git <GIT_VERSION>)" \
  --base development --draft
```

### Option B: Prepare a production release with the dugite bump

If the user wants to cut a production release (e.g., from an existing beta tag
like `release-3.5.6-beta1`):

1. **Check out the latest beta tag** — production releases are based on the
   beta, not on `development`:
   ```bash
   cd <desktop-repo-path>
   git fetch --tags
   git tag --sort=-v:refname | grep "release-.*-beta" | head -1
   git checkout <latest-beta-tag>
   ```
2. Draft the production release:
   ```bash
   yarn draft-release production
   ```
   This will:
   - Determine the next production version
   - Create a `releases/<version>` branch from the beta tag
   - Bump `app/package.json`
   - Generate changelog entries from commits since the last release
3. On the release branch, bump dugite by editing `app/package.json` directly
   (see note below about the nested package structure):
   ```bash
   # Edit app/package.json to set dugite to "^<NEW_VERSION>"
   cd app && yarn install && cd ..
   ```
4. Review the generated changelog — ensure the dugite/Git update is mentioned
   (e.g., `[Improved] Update Git for Windows to <GFW_VERSION>`) and that
   version numbers reflect what's actually in this release, not what was in the
   beta
5. Commit all changes:
   ```bash
   git add app/package.json app/yarn.lock changelog.json
   git commit -m "Bump version and add changelog"
   ```
6. Push the branch — GitHub Actions will automatically create a release PR
7. Review the release PR — check the changelog and version bump look correct
8. Get the PR reviewed and merge it
9. Verify CI builds pass on the merge commit

If building from a specific tag, ask the user which tag or branch they're basing
the release on.

### Option C: Prepare a beta release with the dugite bump

1. Bump dugite on the development branch and merge it:
   ```bash
   git checkout development && git pull
   git checkout -b update-dugite-<NEW_VERSION>
   # Edit app/package.json to set dugite to "^<NEW_VERSION>"
   cd app && yarn install && cd ..
   git add app/package.json app/yarn.lock
   git commit -m "Update dugite to <NEW_VERSION>"
   git push origin HEAD
   gh pr create --title "Update dugite to <NEW_VERSION> (Git <GIT_VERSION>)" \
     --base development
   ```
   Merge the PR once CI passes.
2. Then draft the beta release:
   ```bash
   yarn draft-release beta
   ```
   This will:
   - Determine the next beta version (incrementing beta number or starting a
     new beta series)
   - Create a `releases/<version>` branch
   - Bump `app/package.json`
   - Generate changelog entries
3. Push the branch — GitHub Actions will create a release PR
4. Review the release PR — check the changelog and version bump look correct
5. Get the PR reviewed and merge it
6. Verify CI builds pass on the merge commit

### Combining production + beta releases

A common pattern is to release production first, then immediately cut a beta
that includes the same changes on the development branch. If the user mentions
this, walk them through both in sequence:

1. Draft and release production with the dugite bump on the release branch
   (Option B) — when the release PR merges, development gets the dugite bump
2. Draft and release beta off development (Option C, skipping the dugite bump
   since it's already on development from the production merge)

## Guidance Style

- Walk through **one step at a time** — don't dump all steps at once
- After explaining each step, ask the user to confirm when it's done before
  moving on
- When a workflow creates a PR, open it in the user's browser immediately:
  ```bash
  bash <skill-directory>/open-pr.sh <repo>
  ```
- **After triggering any workflow**, automatically poll for completion every
  15–20 seconds using `check-workflow.sh` and give the user a brief status
  update each time (e.g., "Still running — 45s elapsed, Linux arm64 building").
  Do not wait for the user to ask — keep polling until the workflow completes
  or fails. When checking individual job status, use:
  ```bash
  gh run view <RUN_ID> --repo desktop/<REPO> --json status,jobs \
    --jq '.jobs[] | select(.status != "completed") | "\(.name): \(.status)"'
  ```
- When a workflow creates a PR, immediately open it in the browser and check
  for CI status
- If something goes wrong, help troubleshoot before continuing
- Use the helper scripts to check status and trigger workflows rather than
  asking the user to navigate to GitHub manually
- Provide direct links to workflow runs and PRs when available
