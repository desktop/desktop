# Setting Up Development Dependencies on Linux

You will need to install these tools on your machine:

 - Node.js
 - Yarn
 - Python 3
 - Electron dependencies

## Node.js

The NodeJS project has instructions for installing across a variety of
distributions and package managers.

Find your distribution on [this list](https://nodejs.org/en/download/package-manager/)
and follow the instructions to install the version you require.

Ensure that you also choose the option for building native Node modules, as
those are used in some dependencies used in GitHub Desktop.

## Yarn

Follow [this guide](https://yarnpkg.com/en/docs/install) to install
a system-level `yarn` for your distribution. GitHub Desktop uses a local version
of `yarn`, but it needs a version on your `PATH` to bootstrap itself.

This is important because `yarn` uses lock files to pin dependencies. If you
find yourself changing packages, this will prevent mismatches in versions
between machines.

If you're not familiar with `yarn`, please read [this document](./working-with-packages.md)
to help familiarize yourself with how to do the common package tasks that are
relevant to Desktop.

## Python 3

Refer to your distributions package manager to obtain the latest version of the
Python 3 series.

## Electron dependencies

There are some additional dependencies which are required as part of building
and running GitHub Desktop locally:

 - `libsecret-1.so.0` (and a Secret Service provider such as GNOME Keyring) for
   reading and writing credentials using [`keytar`](https://github.com/atom/node-keytar)
 - `libXss.so.1` - the library for the X11 screen saver extension

Where to find these will vary based on your distribution, but below are some
examples of distributions we've tested.

### Fedora 26 and later

```shellsession
$ sudo dnf install -y libsecret-devel libXScrnSaver
```

### Ubuntu 26.04 LTS

```shellsession
$ sudo apt install libsecret-1-0 libsecret-1-dev gnome-keyring libxss1
$ corepack enable # provides yarn
```

Ubuntu 24.04 and later restrict unprivileged user namespaces with AppArmor,
which Electron's sandbox requires. When running a development build with
`yarn start` you can either add an AppArmor profile for
`dist/desktop-linux-x64/desktop` (see `script/linux/apparmor-profile`) or set
`ELECTRON_DISABLE_SANDBOX=1` in your environment. The `.deb` package installs
the app at `/usr/lib/github-desktop/github-desktop`, which Ubuntu's `apparmor`
package already has a profile for.

## Building a Debian package

`yarn build:prod && yarn package` produces
`dist/github-desktop_<version>_<arch>.deb`, which installs the app into
`/usr/lib/github-desktop` together with a desktop entry (including the
`x-github-desktop-auth` URL handler needed to sign in) and an icon:

```shellsession
$ sudo apt install ./dist/github-desktop_*.deb
```

## Back to setup

Once you've installed the necessary dependencies, head back to the [setup page](https://github.com/desktop/desktop/blob/development/docs/contributing/setup.md) to finish getting set up.
