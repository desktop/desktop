# Setting Up Development Dependencies on macOS

You will need to install these tools on your machine:

 - Node.js (includes npm)
 - Python 3
 - Xcode and Xcode Command Line Tools (Xcode -> Preferences -> Downloads)

## Node.js

Let's see if you have the right version of `node` installed. Open a terminal and run this command inside the Desktop source directory:

```shellsession
$ node -v
```

If you see an error about being unable to find `node`, that probably means you don't have any Node tools installed. You can download Node from the [Node.js website](https://nodejs.org/), install the package, and restart your shell.

You can verify that your installed version matches the one currently used by GitHub Desktop by looking at [our .node-version file](https://github.com/desktop/desktop/blob/development/.node-version). Usually the same major version is enough but if you're running into problems building Desktop please try installing that exact version.

### I need to use different versions of Node.js in different projects!

We currently support these Node version managers: `nvm` and `asdf-nodejs`.

#### Configuring `nvm`

1. Install `nvm` using the instructions [here](https://github.com/creationix/nvm#install-script).

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

#### Configuring `asdf-nodejs`

`asdf` is a little more involved to install. Check out the instructions [here](https://github.com/asdf-vm/asdf) and [here](https://github.com/asdf-vm/asdf-nodejs) for more information.

## npm

npm is included with Node.js; no separate package manager installation is needed.
Run `npm -v` to verify it is available on your `PATH`.

Desktop uses `package-lock.json` files to pin dependencies across machines.
See [working with packages](./working-with-packages.md) for installation,
dependency updates, and script commands.

## Python

macOS comes with Python pre-installed, and it happens to be the right version, so you're probably fine! But let's be sure. Open a terminal and run this command inside the Desktop source directory:

```shellsession
$ python3 --version
```

If you see the output `Python 3.9.x`, you're good to go!

### I need to use different versions of Python in different projects!

For this, we recommend [pyenv](https://github.com/pyenv/pyenv). (It's the only game in town.)

1. Install pyenv according to [the instructions](https://github.com/pyenv/pyenv-installer#github-way-recommended).

2. Within the Desktop source directory, install version of Python it requires:

```shellsession
pyenv install
```

3. Verify you have the right version by running `python3 --version` again:

```shellsession
$ python3 --version
```

If you see the output `Python 3.9.x`, you're good to go!

## Xcode Command Line Tools

Run this command to install the Xcode command line tools.

```shellsession
xcode-select --install
```

If you already have them, it'll say so!

## Back to setup

Once you've installed the necessary dependencies, head back to the [setup page](https://github.com/desktop/desktop/blob/development/docs/contributing/setup.md) to finish getting set up.
