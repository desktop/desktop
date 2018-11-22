# Setting Up Development Dependencies on Linux

You will need to install these tools on your machine:

 - Node.js v8.12.0 (also ensure you can build native modules)
 - Python 2.7
 - Electron dependencies

## Node.js

The GitHub Desktop toolchain currently requires Node 8.x currently, and the
NodeJS project has instructions for installing across a variety of
distributions and package managers.

Find your distribution on [this list](https://nodejs.org/en/download/package-manager/)
and follow the instructions to install the version you require.

## Python 2

Refer to your distributions package manager to obtain the latest version of the
Python 2 series.

## Electron dependencies

There are some additional dependencies which are required as part of building
and running GitHub Desktop locally:

 - `libsecret-1.so.0` for reading and writing credentials using [`keytar`](https://github.com/atom/node-keytar)
 - `libXss.so.1` - the library for the X11 screen saver extension

Where to find these will vary based on your distribution, but below are some
examples of distributions we've tested.

### Fedora 26 and later

```shellsession
$ sudo dnf install -y libsecret-devel libXScrnSaver
```

### Ubuntu 14.04 and later

```shellsession
$ sudo apt install libsecret-1-dev
```

