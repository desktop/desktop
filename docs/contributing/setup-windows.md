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

 - Make sure you allow the Node.js installer to add `node` to the `PATH`.
 - If you are installing Node.js for the first time, select the option to
   automatically install the necessary tools. This installs Python and the
   Visual C++ Build Tools required by Desktop's native Node modules. If you do
   not select this option, install those dependencies manually as described
   below.

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

Desktop's native Node modules require the Visual C++ build tools provided by
the **Desktop development with C++** workload in Visual Studio Build Tools. You
do not need the Visual Studio IDE to develop Desktop.

If you selected the option to automatically install the necessary tools in the
Node.js installer, this workload should already be installed. Otherwise, use
one of these options:

 - If you already have Visual Studio, open the **Visual Studio Installer**,
   select **Modify** for your installation, and add the **Desktop development
   with C++** workload.
 - If you do not have Visual Studio, install the standalone [Visual Studio Build
   Tools](https://visualstudio.microsoft.com/downloads/) and select the
   **Desktop development with C++** workload.

Current versions of Node.js and `node-gyp` detect the installed build tools
automatically, so no additional npm configuration is required.

## Troubleshooting

If your local copy gets "stuck" try deleting the folder `C:\Users\[Your_User]\AppData\Roaming\GitHub Desktop-dev`.

## Back to setup

Once you've installed the necessary dependencies, head back to the [setup page](https://github.com/desktop/desktop/blob/development/docs/contributing/setup.md) to finish getting set up.
