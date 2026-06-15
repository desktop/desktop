# Maintaining GitHub Desktop Multi

This fork is based on the official `desktop/desktop` repository. The multi-window behavior was brought over by cherry-picking only the targeted commits from `hewigovens/github-desktop`:

- `164b69032` — add repo-list actions to open repositories in new windows
- `00d9074770` — sync account state across windows via IPC

The app identity has been changed so local builds can coexist with the official app:

- product name: `GitHub Desktop Multi`
- macOS bundle ID: `com.yorkemartin.GitHubDesktopMulti`
- company name: `Yorkemartin`

## Syncing from upstream

```bash
git checkout multi-window-self-maintained
git fetch upstream
git rebase upstream/development
```

If upstream changes conflict with the multi-window patch, resolve the conflict, run the checks below, and push your branch.

## Building locally

```bash
yarn
yarn build:prod
yarn package
```

macOS ZIP output is written under `dist/`, usually named like:

```text
dist/GitHub Desktop Multi-arm64.zip
```

## Local install without Homebrew

After building, unzip the macOS artifact and drag `GitHub Desktop Multi.app` to `/Applications`.

## Homebrew cask notes

If you publish your own GitHub Release, create a cask in your own tap that points to your release artifact and pinned SHA256. Do not reuse the third-party tap. The app stanza should target the renamed app:

```ruby
app "GitHub Desktop Multi.app"
```

Do not include `conflicts_with cask: "github-desktop"` unless you intentionally want to prevent side-by-side installation.

## Known coexistence caveat

The app bundle ID and support directory are separate from official GitHub Desktop, but OAuth/protocol handlers may still overlap with the official app. If sign-in behaves oddly, quit the official app, launch this fork, and retry sign-in.
