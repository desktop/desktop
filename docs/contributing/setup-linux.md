# Setting Up Development Dependencies on Linux

You will need to install these tools on your machine:

 - Node.js
 - Yarn
 - Python
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

## Python 2

Refer to your distributions package manager to obtain the latest version of the
Python 2 series.

## Electron dependencies

There are some additional dependencies which are required as part of building
and running GitHub Desktop locally:

 - `libsecret-1.so.0` for reading and writing credentials using [`keytar`](https://github.com/atom/node-keytar)
 - `libXss.so.1` - the library for the X11 screen saver extension
 - `libgconf-2-4.so.4` - library for accessing GNOME configuration database

Where to find these will vary based on your distribution, but below are some
examples of distributions we've tested.

### Fedora 26 and later

```shellsession
$ sudo dnf install -y libsecret-devel libXScrnSaver
```

### Ubuntu 14.04 and later

```shellsession
$ sudo apt install libsecret-1-dev libgconf-2-4
```

## Back to setup

Once you've gotten all the necessary dependencies, head back to the [setup page](https://github.com/desktop/desktop/blob/development/docs/contributing/setup.md) to finish getting set up.
