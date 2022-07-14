# [GitHub Desktop](https://desktop.github.com)

[GitHub Desktop](https://desktop.github.com/) is an open source [Electron](https://www.electronjs.org/)-based
GitHub app. It is written in [TypeScript](https://www.typescriptlang.org) and
uses [React](https://reactjs.org/).

![GitHub Desktop screenshot - Windows](https://cloud.githubusercontent.com/assets/359239/26094502/a1f56d02-3a5d-11e7-8799-23c7ba5e5106.png)

## Where can I get it?

Download the official installer for your operating system:

 - [macOS](https://central.github.com/deployments/desktop/desktop/latest/darwin)
 - [macOS (Apple Silicon)](https://central.github.com/deployments/desktop/desktop/latest/darwin-arm64)
 - [Windows](https://central.github.com/deployments/desktop/desktop/latest/win32)
 - [Windows machine-wide install](https://central.github.com/deployments/desktop/desktop/latest/win32?format=msi)

You can install this alongside your existing GitHub Desktop for Mac or GitHub
Desktop for Windows application.

Linux is not officially supported; however, you can find installers created for Linux from a fork of GitHub Desktop in the [Community Releases](https://github.com/desktop/desktop#community-releases) section.

**NOTE**: There is no current migration path to import your existing
repositories into the new application - you can drag-and-drop your repositories
from disk onto the application to get started.


### Beta Channel

Want to test out new features and get fixes before everyone else? Install the
beta channel to get access to early builds of Desktop:

 - [macOS](https://central.github.com/deployments/desktop/desktop/latest/darwin?env=beta)
 - [macOS (Apple Silicon)](https://central.github.com/deployments/desktop/desktop/latest/darwin-arm64?env=beta)
 - [Windows](https://central.github.com/deployments/desktop/desktop/latest/win32?env=beta)
 - [Windows (ARM64)](https://central.github.com/deployments/desktop/desktop/latest/win32-arm64?env=beta)
 
The release notes for the latest beta versions are available [here](https://desktop.github.com/release-notes/?env=beta).

### Community Releases

There are several community-supported package managers that can be used to
install GitHub Desktop:
 - Windows users can install using [Chocolatey](https://chocolatey.org/) package manager:
      `c:\> choco install github-desktop`
 - macOS users can install using [Homebrew](https://brew.sh/) package manager:
      `$ brew install --cask github`

Installers for various Linux distributions can be found on the
[`shiftkey/desktop`](https://github.com/shiftkey/desktop) fork.

Arch Linux users can install the latest version from the
[AUR](https://aur.archlinux.org/packages/github-desktop-bin/).

## Is GitHub Desktop right for me? What are the primary areas of focus?

[This document](https://github.com/desktop/desktop/blob/development/docs/process/what-is-desktop.md) describes the focus of GitHub Desktop and who the product is most useful for.

And to see what the team is working on currently and in the near future, check out the [GitHub Desktop roadmap](https://github.com/desktop/desktop/blob/development/docs/process/roadmap.md).

## I have a problem with GitHub Desktop

Note: The [GitHub Desktop Code of Conduct](https://github.com/desktop/desktop/blob/development/CODE_OF_CONDUCT.md) applies in all interactions relating to the GitHub Desktop project.

First, please search the [open issues](https://github.com/desktop/desktop/issues?q=is%3Aopen)
and [closed issues](https://github.com/desktop/desktop/issues?q=is%3Aclosed)
to see if your issue hasn't already been reported (it may also be fixed).

There is also a list of [known issues](https://github.com/desktop/desktop/blob/development/docs/known-issues.md)
that are being tracked against Desktop, and some of these issues have workarounds.

If you can't find an issue that matches what you're seeing, open a [new issue](https://github.com/desktop/desktop/issues/new/choose),
choose the right template and provide us with enough information to investigate
further.

## The issue I reported isn't fixed yet. What can I do?

If nobody has responded to your issue in a few days, you're welcome to respond to it with a friendly ping in the issue. Please do not respond more than a second time if nobody has responded. The GitHub Desktop maintainers are constrained in time and resources, and diagnosing individual configurations can be difficult and time consuming. While we'll try to at least get you pointed in the right direction, we can't guarantee we'll be able to dig too deeply into any one person's issue.

## How can I contribute to GitHub Desktop?

The [CONTRIBUTING.md](./.github/CONTRIBUTING.md) document will help you get setup and
familiar with the source. The [documentation](docs/) folder also contains more
resources relevant to the project.

If you're looking for something to work on, check out the [help wanted](https://github.com/desktop/desktop/issues?q=is%3Aissue+is%3Aopen+label%3A%22help%20wanted%22) label.

## More Resources

See [desktop.github.com](https://desktop.github.com) for more product-oriented
information about GitHub Desktop.


See our [getting started documentation](https://docs.github.com/en/desktop/installing-and-configuring-github-desktop/overview/getting-started-with-github-desktop) for more information on how to set up, authenticate, and configure GitHub Desktop.

## License

**[MIT](LICENSE)**

The MIT license grant is not for GitHub's trademarks, which include the logo
designs. GitHub reserves all trademark and copyright rights in and to all
GitHub trademarks. GitHub's logos include, for instance, the stylized
Invertocat designs that include "logo" in the file title in the following
folder: [logos](app/static/logos).

GitHub® and its stylized versions and the Invertocat mark are GitHub's
Trademarks or registered Trademarks. When using GitHub's logos, be sure to
follow the GitHub [logo guidelines](https://github.com/logos).

name: CI

on:
  push:
    branches:
      - development
      - __release-*
  pull_request:

jobs:
  build:
    name: ${{ matrix.friendlyName }} ${{ matrix.arch }}
    runs-on: ${{ matrix.os }}
    permissions: read-all
    strategy:
      fail-fast: false
      matrix:
        node: [16.13.0]
        os: [macos-10.15, windows-2019]
        arch: [x64, arm64]
        include:
          - os: macos-10.15
            friendlyName: macOS
          - os: windows-2019
            friendlyName: Windows
    timeout-minutes: 60
    env:
      # Needed for macOS arm64 until hosted macos-11.0 runners become available
      SDKROOT: /Library/Developer/CommandLineTools/SDKs/MacOSX11.1.sdk
    steps:
      - uses: actions/checkout@v3
        with:
          submodules: recursive
      - name: Use Node.js ${{ matrix.node }}
        uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node }}

      - name: Get yarn cache directory path
        id: yarn-cache-dir-path
        run: echo "::set-output name=dir::$(yarn cache dir)"

      - uses: actions/cache@v3
        id: yarn-cache # use this to check for `cache-hit` (`steps.yarn-cache.outputs.cache-hit != 'true'`)
        with:
          path: ${{ steps.yarn-cache-dir-path.outputs.dir }}
          key: ${{ runner.os }}-yarn-${{ hashFiles('**/yarn.lock') }}
          restore-keys: |
            ${{ runner.os }}-yarn-${{ hashFiles('**/yarn.lock') }}
            ${{ runner.os }}-yarn-
      # This step can be removed as soon as official Windows arm64 builds are published:
      # https://github.com/nodejs/build/issues/2450#issuecomment-705853342
      - name: Get NodeJS node-gyp lib for Windows arm64
        if: ${{ matrix.os == 'windows-2019' && matrix.arch == 'arm64' }}
        run: .\script\download-nodejs-win-arm64.ps1 ${{ matrix.node }}

      - name: Install and build dependencies
        run: yarn
        env:
          npm_config_arch: ${{ matrix.arch }}
          TARGET_ARCH: ${{ matrix.arch }}
      - name: Lint
        run: yarn lint
      - name: Validate changelog
        run: yarn validate-changelog
      - name: Ensure a clean working directory
        run: git diff --name-status --exit-code
      - name: Build production app
        run: yarn build:prod
        env:
          DESKTOP_OAUTH_CLIENT_ID: ${{ secrets.DESKTOP_OAUTH_CLIENT_ID }}
          DESKTOP_OAUTH_CLIENT_SECRET:
            ${{ secrets.DESKTOP_OAUTH_CLIENT_SECRET }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_ID_PASSWORD: ${{ secrets.APPLE_ID_PASSWORD }}
          DESKTOPBOT_TOKEN: ${{ secrets.DESKTOPBOT_TOKEN }}
          KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}
          npm_config_arch: ${{ matrix.arch }}
          TARGET_ARCH: ${{ matrix.arch }}
      - name: Prepare testing environment
        if: matrix.arch == 'x64'
        run: yarn test:setup
      - name: Run unit tests
        if: matrix.arch == 'x64'
        run: yarn test:unit
      - name: Run script tests
        if: matrix.arch == 'x64'
        run: yarn test:script
      - name: Publish production app
        run: yarn run publish
        env:
          npm_config_arch: ${{ matrix.arch }}
          DESKTOPBOT_TOKEN: ${{ secrets.DESKTOPBOT_TOKEN }}
          WINDOWS_CERT_PASSWORD: ${{ secrets.WINDOWS_CERT_PASSWORD }}
          KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}
          DEPLOYMENT_SECRET: ${{ secrets.DEPLOYMENT_SECRET }}
          AZURE_STORAGE_ACCOUNT: ${{ secrets.AZURE_STORAGE_ACCOUNT }}
          AZURE_STORAGE_ACCESS_KEY: ${{ secrets.AZURE_STORAGE_ACCESS_KEY }}
          AZURE_BLOB_CONTAINER: ${{ secrets.AZURE_BLOB_CONTAINER }}
          AZURE_STORAGE_URL: ${{ secrets.AZURE_STORAGE_URL }}
