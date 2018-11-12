# Setting Up Development Dependencies on macOS

You will need to install these tools on your machine:

 - Node.js v8.12.0
 - Python 2.7
 - Xcode and Xcode Command Line Tools (Xcode -> Preferences -> Downloads)

## Node.js

Let's see if you have the right version of `node` installed. Open a terminal and run this command inside the Desktop source directory:

```shellsession
$ node -v
```

If you see an error about being unable to find `node`, that probably means you don't have any Node tools installed. You can install Node 8 from the [Node.js website](https://nodejs.org/download/release/v8.12.0/) and restart your shell.

If you see the output `v8.12.0`, you're good to go.

If you see the output `v10.x.y` you're ahead of what we currently support. See [#5876](https://github.com/desktop/desktop/issues/5876) for details about building GitHub Desktop with Node 10, which we can hopefully resolve soon. If you don't care about the version you are running, you can install the version from the [Node.js website](https://nodejs.org/download/release/v8.12.0/) over the top of your current install.

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

If you see `v8.12.0`, you're good to go.

#### Configuring `asdf-nodejs`

`asdf` is a little more involved to install. Check out the instructions [here](https://github.com/asdf-vm/asdf) and [here](https://github.com/asdf-vm/asdf-nodejs) for more information.

## Python

macOS comes with Python pre-installed, and it happens to be the right version, so you're probably fine! But let's be sure. Open a terminal and run this command inside the Desktop source directory:

```shellsession
$ python --version
```

If you see the output `Python 2.7`, you're good to go!

### I need to use different versions of Python in different projects!

For this, we recommend [pyenv](https://github.com/pyenv/pyenv). (It's the only game in town.)

1. Install pyenv according to [the instructions](https://github.com/pyenv/pyenv-installer#github-way-recommended).

2. Within the Desktop source directory, install version of Python it requires:

```shellsession
pyenv install
```

3. Verify you have the right version by running `python --version` again:

```shellsession
$ python --version
```

If you see the output `Python 2.7.x`, you're good to go!

## Xcode Command Line Tools

Run this command to install the Xcode command line tools.

```shellsession
xcode-select --install
```

If you already have them, it'll say so!
