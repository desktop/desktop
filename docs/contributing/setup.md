#  Development Environment Setup

## Setup

You will need to install these tools on your machine:

### macOS

See [mac-deps-setup.md](./setup-macos.md).

### Windows

 - [Node.js v8.11.4](https://nodejs.org/dist/v8.11.4/)
    - *Make sure you allow the Node.js installer to add node to the PATH.*
 - [Python 2.7](https://www.python.org/downloads/windows/)
    - *Let Python install into the default suggested path (`c:\Python27`), otherwise you'll have
      to configure node-gyp manually with the path which is annoying.*
    - *Ensure the **Add python.exe to Path** option is selected.*
 - One of Visual Studio 2015, Visual C++ Build Tools or Visual Studio 2017
   - [Visual C++ Build Tools](http://go.microsoft.com/fwlink/?LinkId=691126)
     - *Run `npm config set msvs_version 2015` to tell node to use this toolchain.*
   - Visual Studio 2015
     - *Ensure you select the **Common Tools for Visual C++ 2015** feature as that is required by Node.js
        for installing native modules.*
     - *Run `npm config set msvs_version 2015` to tell node to use this toolchain.*
   - [Visual Studio 2017](https://www.visualstudio.com/vs/community/)
     - *Ensure you select the **Desktop development with C++** feature as that is required by Node.js for
        installing native modules.*
     - *Run `npm config set msvs_version 2017` to tell node to use this toolchain.*

### Fedora 26

First, add the NodeJS package repository for 8.x.

```shellsession
$ curl --silent --location https://rpm.nodesource.com/setup_8.x | sudo bash -
```

After that, install the dependencies to build and test the app:

```shellsession
$ sudo dnf install -y nodejs gcc-c++ make libsecret-devel libXScrnSaver
```

If you want to package Desktop for distribution, you will need these additional dependencies:

```shellsession
$ sudo dnf install fakeroot dpkg rpm rpm-build xz xorriso appstream bzip2-devel
```

If you have problems packaging for AppImage, you may need to force the linker to use the right
version of specific dependencies. More information [here](https://michaelheap.com/error-while-loading-shared-libraries-libbz2-so-1-0-cannot-open-shared-object-file-on-centos-7)
and [here](https://github.com/electron-userland/electron-builder/issues/993#issuecomment-291021974)

```shellsession
$ sudo ln -s `find /usr/lib64/ -type f -name "libbz2.so.1*"` /usr/lib64/libbz2.so.1.0
$ sudo ln -s `find /usr/lib64/ -type f -name "libreadline.so.7.0"` /usr/lib64/libreadline.so.6
```

### Ubuntu 16.04

First, install curl and a GPG program:

```shellsession
$ sudo apt install curl gnupg
```

Then add the NodeJS package repository for 8.x:

```shellsession
$ curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash -
```

After that, install the dependencies to build and test the app:

```shellsession
$ sudo apt update && sudo apt install -y nodejs gcc make libsecret-1-dev
```

If you want to package Desktop for distribution, install these packages:

```shellsession
$ sudo apt install -y fakeroot dpkg rpm xz-utils xorriso zsync
```

### arm64 builds

Desktop can be built and run on arm64 (aarch64) hardware such as a Raspberry Pi 3.
In order to build for arm64, you will need the following:

* A computer with a 64-bit ARMv8 processor.
* A 64-bit OS.  You can use [Ubuntu 16.04](#ubuntu-1604) and then follow the instructions
on setup there.
* Instead of running `yarn` to get all required dependencies on your machine, you will
instead need to run `script/install-arm64-deps.sh`.
* Before building with `yarn build:dev` or `yarn build:prod`, you will need to
set the environment variable `TARGET_ARCH` to `arm64` eg:
```shellsession
export TARGET_ARCH=arm64
```

## Install Yarn

After doing this setup, you also need to install `yarn` as Desktop uses
this for managing packages instead of NPM. **Do not install `yarn` through
NPM**. Refer to the [install instructions](https://yarnpkg.com/en/docs/install)
for your OS.

This is important because `yarn` uses lock files to pin dependencies. If you
find yourself changing packages, this will prevent mismatches in versions
between machines.

If you're not familiar with `yarn`, please read [this document](./working-with-packages.md)
to help familiarize yourself with how to do the common package tasks that are
relevant to Desktop.

## Verification

Then verify you have these commands available in your shell and that the found
versions look similar to the below output:

```shellsession
$ node -v
v8.11.4

$ yarn -v
1.9.4

$ python --version
Python 2.7.13
```

There are also [additional resources](tooling.md) to configure your favorite
editor to work nicely with the GitHub Desktop repository.

## Building Desktop

After cloning the repository, the typical workflow to get up running
is as follows:

* Run `yarn` to get all required dependencies on your machine.
* Run `yarn build:dev` to create a development build of the app.
* Run `yarn start` to launch the application. Changes will be compiled in the
  background. The app can then be reloaded to see the changes (<kbd>Ctrl/Command+Alt+R</kbd>).

**Optional Tip**: On macOS and Linux, you can use `screen` to avoid filling your terminal with logging output:

```shellsession
$ screen -S "desktop" yarn start # -S sets the name of the session; you can pick anything
$ # Your screen clears and shows logs. Press Ctrl+A then D to exit.
[detached]
$ screen -R "desktop" # to reopen the session, read the logs, and exit (Ctrl+C)
[screen is terminating]
```

If you've made changes in the `main-process` folder you need to run `yarn
build:dev` to rebuild the package, and then `yarn start` for these changes to be
reflected in the running app.

If you're still encountering issues with building, refer to our
[troubleshooting](troubleshooting.md) guide for more common
problems.

## Running tests

- `yarn test` - Runs all unit and integration tests
- `yarn test:unit` - Runs all unit tests (add `--debug` to open Chrome Dev Tools while running tests)
- `yarn test:integration` - Runs all integration tests

## Debugging

Electron ships with Chrome Dev Tools to assist with debugging, profiling and
other measurement tools.

1. Run the command `yarn start` to launch the app
2. Under the **View** menu, select **Toggle Developer Tools**

When running the app in development mode,
[React Dev Tools](https://chrome.google.com/webstore/detail/react-developer-tools/fmkadmapgofadopljbjfkapdkoienihi?hl=en)
should automatically install itself on first start when in development mode.

An additional extension, [Devtron](http://electron.atom.io/devtron/), is also
included but is disabled by default. To enable Devtron, select the Console
tab in Chrome Developer Tools and run this command:

```js
require('devtron').install()
```

## The Next Steps

You're almost there! Here's a couple of things we recommend you read next:

 - [Help Wanted](../../.github/CONTRIBUTING.md#help-wanted) - we've marked some
   tasks in the backlog that are ideal for external contributors
 - [Notes for Contributors](../process/notes-for-contributors.md) - some notes
   for new contributors getting started
