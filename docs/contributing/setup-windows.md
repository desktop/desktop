# Setting Up Development Dependencies on Windows

You will need to install these tools on your machine:

 - Node.js
 - Yarn
 - Python 2
 - Visual C++ Build Tools

## Node.js

Let's see if you have the right version of `node` installed. Open a shell and
run this command:

```shellsession
$ node -v
```

If you see an error about being unable to find `node`, that probably means you don't have any Node tools installed.
You can download Node from the [Node.js website](https://nodejs.org/), install the package, and restart your shell.

If you see the output `v10.x.y` or later, you're good to go.

**Node.js installation notes:**
 - make sure you allow the Node.js installer to add `node` to the PATH.

### I need to use different versions of Node.js in different projects!

We currently support `nvm`.

#### Configuring `nvm`

1. Install `nvm` using the instructions [here](https://github.com/coreybutler/nvm-windows).

2. Within the Desktop source directory, install version of Node.js it requires:

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

If you see the output `Python 2.7.x`, you're good to go!

If you see an error about being unable to find `python`, that probably means you
don't have any Node tools installed. You can install Python 2.7 from the
[Python website](https://www.python.org/downloads/windows/).

**Python installation notes:**

 - Let Python install into the default suggested path (`c:\Python27`), otherwise
   you'll have to configure `node-gyp` manually to look at a different path.
 - Ensure the **Add python.exe to Path** option is selected.

## Visual C++ Build Tools

To build native Node modules, you will need a recent version of Visual C++ which
can be obtained in several ways

### Visual Studio 2017

If you have an existing installation of VS2017, run the **Visual Studio
Installer** and check that you have the **Desktop development with C++**
workload included.

<img width="1265" src="https://user-images.githubusercontent.com/359239/48849855-a2091800-ed7d-11e8-950b-93465eba7cd1.png">

Once you've confirmed that, open a shell and run this command to update the
configuration of NPM::

```shellsession
$ npm config set msvs_version 2017
```

### Visual Studio 2015

If you have an existing installation of VS2015, run the setup program again and
and check that you have the **Common Tools for Visual C++ 2015** feature
enabled.

<img width="475" src="https://user-images.githubusercontent.com/359239/48850346-d92bf900-ed7e-11e8-9728-e5b70654f90f.png">

Once you've confirmed that is present and any updates are applied, open a shell
and run this command to update the configuration of NPM:

```shellsession
$ npm config set msvs_version 2015
```

### Visual C++ Build Tools

If you do not have an existing Visual Studio installation, there is a
standalone [Visual C++ Build Tools](http://go.microsoft.com/fwlink/?LinkId=691126)
installer available.

After installation open a shell and run this command to update the configuration
of NPM:

```shellsession
$ npm config set msvs_version 2015
```

## Back to setup

Once you've installed the necessary dependencies, head back to the [setup page](https://github.com/desktop/desktop/blob/development/docs/contributing/setup.md) to finish getting set up.
