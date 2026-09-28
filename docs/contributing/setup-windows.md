# Setting Up Development Dependencies on Windows

You will need to install these tools on your machine:

 - Node.js
 - Yarn
 - Python 3
 - Visual C++ Build Tools

## Node.js

Let's see if you have the right version of `node` installed. Open a shell and
run this command:

```shellsession
$ node -v
```

If you see an error about being unable to find `node`, that probably means you don't have any Node tools installed.
You can download Node from the [Node.js website](https://nodejs.org/), install the package, and restart your shell.

You can verify that your installed version matches the one currently used by GitHub Desktop by looking at [our .node-version file](https://github.com/desktop/desktop/blob/development/.node-version). Usually the same major version is enough but if you're running into problems building Desktop please try installing that exact version.

**Node.js installation notes:**
 - make sure you allow the Node.js installer to add `node` to the `PATH`.

### I need to use different versions of Node.js in different projects!

We currently support `nvm`.

#### Configuring `nvm`

1. Install `nvm` using the instructions [here](https://github.com/coreybutler/nvm-windows).

2. Within the Desktop source directory, install the version of Node.js it requires:

```shellsession
$ nvm install
```

3. Ensure you are running the right version:

```shellsession
$ nvm use
```

4. Verify you have the right version by running `node -v` again:

```shellsession
$ node -v
```

If you see any version number, you're good to go.

## Yarn

Follow [this guide](https://yarnpkg.com/en/docs/install#windows-stable) to install
a system-level `yarn`. GitHub Desktop uses a local version of `yarn`, but it
needs a version on your `PATH` to bootstrap itself.

This is important because `yarn` uses lock files to pin dependencies. If you
find yourself changing packages, this will prevent mismatches in versions
between machines.

If you're not familiar with `yarn`, please read [this document](./working-with-packages.md)
to help familiarize yourself with how to do the common package tasks that are
relevant to Desktop.

## Python

Open a shell and run this command:

```shellsession
$ python --version
```

If you see the output `Python 3.9.x`, you're good to go!

If you see an error about being unable to find `python`, that probably means you
don't have Python installed. You can install Python 3.9 from the
[Python website](https://www.python.org/downloads/windows/).

**Python installation notes:**

 - Let Python install into the default suggested path (`c:\Python39`), otherwise
   you'll have to configure `node-gyp` manually to look at a different path.
 - In case you already have or need to have Python on a different path, set the `PYTHON` environment variable or npm's `python` config key to your Python's executable path:

         npm config set python "c:\path\to\python3\python.exe"
 - Ensure the **Add python.exe to Path** option is selected.

## Visual C++ Build Tools

To build native Node modules, you will need a recent version of Visual C++ which
can be obtained in several ways:

### Visual Studio 2019

If you have an existing installation of VS2019, run the **Visual Studio
Installer** (Tools > Get Tools and Features...) and check that you have the **Desktop development with C++**
workload included.

<img width="1265" src="https://user-images.githubusercontent.com/7467062/76693187-0fa21d00-662f-11ea-91ba-38326263d4b6.png">

Once you've confirmed that, open a shell and run this command to update the
configuration of NPM:

```shellsession
$ npm config set msvs_version 2019
```

```shellsession
$ npm config set msbuild_path "C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\[VERSION]\\MSBuild\\Current\\Bin\\MSBuild.exe"
```

*Note:* VERSION will be Community, Professional or Enterprise depending on your install.

### Visual Studio 2017

If you have an existing installation of VS2017, run the **Visual Studio
Installer** (Tools > Get Tools and Features...) and check that you have the **Desktop development with C++**
workload included.

<img width="1265" src="https://user-images.githubusercontent.com/359239/48849855-a2091800-ed7d-11e8-950b-93465eba7cd1.png">

Once you've confirmed that, open a shell and run this command to update the
configuration of NPM:

```shellsession
$ npm config set msvs_version 2017
```

### Visual C++ Build Tools

If you do not have an existing Visual Studio installation, there is a
standalone [Visual C++ Build Tools](https://visualstudio.microsoft.com/thank-you-downloading-visual-studio/?sku=BuildTools)
installer available.

After installation open a shell and run this command to update the configuration
of NPM:

```shellsession
$ npm config set msvs_version 2019
```

## Per-repository GitHub accounts in Custom builds

In **File > Options > Accounts**, choose **Add GitHub.com account** to sign in
without removing accounts already signed in. Choose the intended account in the
browser; if the browser reuses an existing session, switch its GitHub account
before authorizing. Signing in again as the same user refreshes that account
rather than creating a duplicate.

Select a repository, then open **Repository > Repository settings > Remote**.
Choose its **GitHub account for this repository** and **Save**. GitHub API
requests and HTTPS fetch, pull, push, and LFS authentication use that selection.
The GitHub clone dialog also remembers the account chosen for the clone.
Selections are local to the Custom profile and shared by all local checkouts of
the same host/owner/repository. They do not change Git's commit name or email.

**Default account for this host** restores the first signed-in account for that
host. Signing out of an explicitly selected account preserves the selection:
sign in again or select another account; Desktop will not silently substitute
another account. Account tokens remain in the operating system credential vault,
not the repository or the saved selection.

SSH remotes still authenticate using SSH keys. Use an HTTPS remote if fetch and
push should follow the selected GitHub account. Azure DevOps and other non-GitHub
hosts continue using their existing credentials. Official builds retain their
existing single-account-per-host behavior.

## Local custom commands

The **Custom commands** button beside **Fetch origin** opens a menu of commands
in two groups: **Repository commands**, visible only for the selected checkout,
and **Global commands**, shared across all repositories on this computer.
Choose **Configure repository commands...** or **Configure global commands...**
to add, edit or remove entries in that group. Each entry has a unique name within
its group and a Windows PowerShell
command, such as `npm run build`. Choose **Save** to save the list without
executing it. Then select a command by name from the toolbar menu to run it
directly in an in-app execution panel, without opening an external console.

The working directory is the selected checkout. The panel streams output and
errors and reports
success, a nonzero exit code, or a stopped command. It retains the latest 2,000
terminal scrollback lines until you close it.

The first run shows an indeterminate progress animation. After a successful run,
its duration is remembered locally for that command and checkout. Later runs
show a clearly labeled **estimated** percentage based on that duration. The
estimate stops at 95% until the process actually succeeds, then shows 100%.
Longer runs show a waiting message, rather than being marked complete early.
This is a time estimate, not measured build/task progress. Editing the command
text or changing checkout requires learning a new duration. Failed or stopped
runs do not replace the last successful duration.

Choose **Stop command** to stop the command and its child processes. Stop it
before closing the panel or the app. Windows PowerShell runs hidden, without a
profile and in non-interactive mode; commands requiring terminal input are not
supported. PowerShell errors stop execution, and native command exit codes are
propagated to the panel.

Both groups run in the currently selected checkout. Switching repositories
changes the repository group but leaves the global group available. Names may
be reused between the two groups; changing or removing one never changes the
other. The toolbar button uses the same normal width as the adjacent buttons.

Commands are saved locally, not in repository files, and are
never run automatically. Remove entries and choose **Save** to forget them.
Previously saved lists remain in the repository group, and single commands
appear there as **Custom command**.
Only run commands you trust: they have your Windows permissions. Do not save
passwords or other secrets in commands. Use `cmd /c` for commands requiring CMD
syntax instead of PowerShell syntax.

### Sharing commands

In either command configuration dialog, **Export selected...** saves the selected
command and **Export all...** saves every command in that group. Exports include
the current editor contents, even if you have not chosen **Save** yet.
Choose **Import...** to load a shared `custom-commands.json` file into the
current repository or global group.

Imports are appended to the editor draft. Existing commands are never replaced;
name conflicts (ignoring surrounding whitespace and case) get numbered suffixes
such as `Build (2)`. Each imported command receives a new local identity.
Review the scripts and choose **Save** to keep them, or **Cancel** to discard the
draft. Neither importing nor exporting executes commands.

The versioned JSON file contains only command names and full PowerShell script
text, not local command IDs, repository paths, group assignments or execution
history. Hard-coded paths and secrets inside the scripts are **not** removed.
Review files before sharing or running them. Scripts referencing other local
files still require those files on the recipient's machine. The recipient needs
a Custom build with this import/export feature; official GitHub Desktop cannot
import these files. Unsupported formats and invalid entries are rejected without
changing the draft.

## Local Custom Windows installer

To package this modified checkout, including uncommitted source changes, add a
**Repository command** named **Package Windows installer** with this command:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\script\package-custom.ps1
```

The same script can be run from a terminal, or with `yarn package:custom`.
It uses the repository's vendored Yarn and the Node version in `.nvmrc`. It
checks the sibling `.tools\node-<version>-win-x64` directory first, then `PATH`.
Use `-NodePath C:\path\to\node.exe` to select another matching installation.
The development dependencies and submodules must already be set up as described
above. The script does not upgrade dependencies, pull, commit, push, install
the resulting app, or change the system execution policy.

This Windows x64 script performs a production compilation and invokes the
repository's existing app packager and Squirrel.Windows installer generator.
It streams both phases into the command panel and stops at the first failure.
Concurrent packaging of the same checkout is rejected.

Outputs are isolated in the ignored `.custom-build` directory:

- `.custom-build\dist\GitHubDesktopCustomSetup-x64.exe`
- `.custom-build\dist\GitHubDesktopCustomSetup-x64.msi`
- `.custom-build\dist\GitHubDesktopCustom-win32-x64\GitHubDesktopCustom.exe`
  (standalone app; keep the entire directory together)

The app is named **GitHub Desktop Custom**, uses a yellow Windows application,
installer and About-dialog logo (official icons are unchanged), and has its own Squirrel installation
identity and Electron user-data directory, and does not require the development
server. Official app updates and scheduled usage reporting are disabled for
this build. For an installed-app upgrade, increase the version in
`app/package.json` before rebuilding and running the new installer: Squirrel
uses package versions to identify updates. Installer files
are unsigned, so Windows may show an unknown-publisher/SmartScreen warning.
No signing credentials are used.

The official app's clone protocols and global `github` CLI are left alone.
Browser sign-in uses the public development OAuth client and its
`x-github-desktop-dev-auth` callback; the most recently launched Custom or
development app owns that callback. Do not use both for browser sign-in at
the same time. Accounts and custom commands are not automatically migrated
from another installation.

The existing development app can remain open while packaging. Close any
standalone Custom app running directly from `.custom-build\dist` before
rebuilding, since that directory is replaced. Installed copies are unaffected.
Custom commands that invoke Node, npm or a compiler still require those tools
on the destination computer.

## Publishing Custom builds on GitHub

The fork-specific workflow `.github/workflows/custom-release.yml` builds unsigned
Windows x64 installers in `jim-jiang-github/desktop`. It uses the Node version in
`.nvmrc`, Python 3.11, the Windows 2022 runner's native build tools, and the existing
`package-custom.ps1` script. It does not use GitHub's official signing credentials
or deployment infrastructure.

Commit and push the workflow and all Custom source changes to your fork. Enable
Actions in the fork if GitHub asks you to do so. To use **Actions > Build and
release Custom (Windows) > Run workflow**, the workflow must also exist on the
fork's default branch (`development`); select the branch containing your Custom
changes when running it. Manual runs only build: download `custom-windows-x64`
from the run's artifacts within 14 days.

To create a release, push a tag matching **exactly** `custom-v` followed by the
version in `app/package.json`, on the commit you want to ship. For example, for
version `3.6.7-beta2`, from the Custom source branch:

```powershell
git tag custom-v3.6.7-beta2
git push origin custom-v3.6.7-beta2
```

The tagged commit must contain the workflow, packaging script, and Custom
features. Creating a local tag with `git tag` does not trigger the workflow;
you must push the tag with `git push origin <tag>`. A tag push builds that exact
source and, only after a successful build and checksum verification,
**automatically publishes a public Release** containing the EXE, MSI, and
`SHA256SUMS.txt`. Versions with a prerelease identifier (such as `-alpha1`,
`-beta2`, or `-rc1`) are published as public prereleases; stable versions are
published as normal releases. No draft or manual publish step is required.
Review the source and version before pushing the tag. The job uses the
automatically supplied `GITHUB_TOKEN` with `contents: write` only for the release
job; no personal access token or custom secret is needed. Repository or
organization policies must allow that permission.

Before each subsequent release, increase `app/package.json`'s version (including
the corresponding package metadata if required), commit it, and use a new
matching tag. Do not reuse or move published tags: the workflow deliberately
refuses to overwrite an existing Release. If a release upload fails partway
through, inspect the release and its assets before retrying; do not automatically
delete or replace a public release. The existing tag must continue pointing to
the same source commit.

Install either EXE or MSI, not both. These are unofficial, unsigned Custom builds;
SmartScreen may show a warning. Verify the downloaded installer with
`Get-FileHash -Algorithm SHA256` against `SHA256SUMS.txt`. This workflow does not
enable automatic updates, change the Custom profile location, or package your
local accounts, repository list, or custom-command settings.

## Troubleshooting

If your local copy gets "stuck" try deleting the folder `C:\Users\[Your_User]\AppData\Roaming\GitHub Desktop-dev`.

## Back to setup

Once you've installed the necessary dependencies, head back to the [setup page](https://github.com/desktop/desktop/blob/development/docs/contributing/setup.md) to finish getting set up.
