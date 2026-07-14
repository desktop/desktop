# Building and Packaging Desktop

This document outlines how Desktop is currently packaged for all platforms -
there are some parts in common but then each platform has it's own quirks.

## `webpack`

GitHub Desktop use webpack to transpile and bundle its application resources.
The configuration files that webpack uses are found under `app/`:

 - `app/webpack.common.ts` - base config and settings
 - `app/webpack.development.ts` - additional changes to base config for building
    and running Desktop in development mode
 - `app/webpack.production.ts` - additional changes to base config for building
    and running the app in production mode

The webpack configuration files organize the source files into these targets:

 - `main.js` - logic in the main process in Electron
 - `renderer.js` - logic in the renderer process in Electron
 - `crash.js` - specialised UI for displaying an error that crashed the app
 - `highlighter.js` - logic for syntax highlighting, which runs in a web worker
 - `cli.js` - logic for the `github` command line interface

Webpack also handles these steps:

 - placeholders in source for platform-specific values are now replaced, using
   `app/app-info.ts` and the values of the platform the build is being performed
   on
 - SCSS stylesheets under `app/styles/` are transpiled to CSS and emitted
 - source maps are generated to help with correlating runtime errors to the
   corresponding TypeScript source

The output from webpack is stored in the `out` directory, and this folder is
ignored in version control.

## `app/package.json`

The `version` attribute in `app/package.json` is the canonical reference for
the version number you see in the **About** view of GitHub Desktop.

## `changelog.json`

This file is used to track user-facing changes associated with each Desktop
release. This can include new features, bug fixes, improvements or even removed
features.

## `script/build.ts`

After webpack the next component in the pipeline is  `script/build.ts` which
handles moving app resources into place and launching `electron-packager`, which
merges the application resources and Electron runtime for the current
platform into an executable program.

This script is responsible for:

 - merging additional static resources into the output directory
 - generating a license bundle from the projects that Desktop uses, which are
   accessible from the **About GitHub Desktop** dialog
 - generating license metadata from the `choosealicense.com` source repository,
   so the user can add a suitable license to their new repository when creating
   a repository in Desktop

`electron-packager` is also responsible for code-signing on macOS at this stage,
and if you do not have this configured you will likely see an error like this:

```
Packaging app for platform darwin x64 using electron v2.0.9
WARNING: Code sign failed; please retry manually. Error: No identity found for signing.
```

This is fine for development purposes, but code-signing is highly recommended
when distributing Desktop to end users.

## `script/package.ts`

After the build is the final step is to package the application for distribution
to end users, and this is where much of the platform-specific variations occur.

### macOS

macOS does not need any additional work, as the previous step generated an
application bundle and performed the required code-signing.

The generated app is compressed into a `.zip` archive, reducing the download
size by ~60%.

### Windows

Desktop uses `electron-winstaller` to generate two installers:

 - a [Squirrel](https://github.com/Squirrel/Squirrel.Windows)-based `.exe` that
   does not require elevated permissions to install
 - an installer based on [Windows Installer](https://docs.microsoft.com/en-us/windows/desktop/msi/windows-installer-portal)
   that supports being installed by administrators. Please note that this is a
   partial solution and this still leverages `%LOCALAPPDATA%` when each users
   runs the app for the first time. See [#1086](https://github.com/desktop/desktop/issues/1086)
   for an ongoing discussion about alternatives.

Other things to note about the Windows packaging process:

 - `electron-winstaller` is responsible for signing these installers
 - Squirrel supports generating delta packages (representing the difference
   between this version and the previous version) to avoid downloading bytes
   that haven't changed. This has been enabled for Desktop, and requires
   downloading the previous version from Central to generate the delta package.

### Linux

Refer to the [`shiftkey/desktop`](https://github.com/shiftkey/desktop) fork
for packaging details about Linux.

## `script/publish.ts`

This script uploads the packaging artifacts to our S3 bucket, which is then
verified before the build is made available to users.
