# Setting Up Development Dependencies on Linux

You will need to install these tools on your machine:

 - Node.js (includes npm)
 - Python 3
 - Electron dependencies

## Node.js

The NodeJS project has instructions for installing across a variety of
distributions and package managers.

Find your distribution on [this list](https://nodejs.org/en/download/package-manager/)
and follow the instructions to install the version you require.

Ensure that you also choose the option for building native Node modules, as
those are used in some dependencies used in GitHub Desktop.

## npm

Use the npm version bundled with Node.js. Some distributions provide npm as a
separate package; verify both `node -v` and `npm -v` are available on your `PATH`.

Desktop uses `package-lock.json` files to pin dependencies across machines.
See [working with packages](./working-with-packages.md) for installation,
dependency updates, and script commands.

## Python 3

Refer to your distributions package manager to obtain the latest version of the
Python 3 series.

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

Once you've installed the necessary dependencies, head back to the [setup page](https://github.com/desktop/desktop/blob/development/docs/contributing/setup.md) to finish getting set up.
