# Setting Up Development Dependencies on macOS

You will need to install these tools on your machine:

 - Node.js v8.11.4
 - Python 2.7
 - Xcode and Xcode Command Line Tools (Xcode -> Preferences -> Downloads)


## Node.js

Let's see if you have the right version of `node` installed. Open a terminal and run this command inside the Desktop source directory:

```shellsession
$ node -v
```

If you see an error about being unable to find `node`, that probably means you don't have any Node tools installed. You can install Node LTS (the version we need) from the [Node.js website](https://nodejs.org/en/download/) and restart your shell.

If you see the output `v8.11.x` (where `x` is any number), you're good to go.

If you see the output `v10.x.y` you're ahead of what we currently support. We have an outstanding issue building GitHub Desktop with Node 10, and hopefully can resolve this soon. If you don't care about the version you are running, you can install the version from the [Node.js website](https://nodejs.org/en/download/) over the top of your current install.

### I need to use different versions of Node.js in different projects!

We currently support these Node version managers: `nvm` and `asdf-nodejs`.

#### Configuring `nvm`

1. Install `nvm` using the instructions [here](https://github.com/creationix/nvm#install-script).

2. Within the Desktop source directory, install version of Node.js it requires:

```shellsession
$ nvm install
```

3. Ensure you are running the right version

```shellsession
$ nvm use
```

4. Verify you have the right version by running `node -v` again

```shellsession
$ node -v
```

If you see `v8.11.4`, you're good to go.

#### Configuring `asdf-nodejs`

`asdf` is a little more involved to install. Follow the instructions [here](https://github.com/asdf-vm/asdf) and [here](https://github.com/asdf-vm/asdf-nodejs)

## Python

macOS comes with Python pre-installed, and it happens to be the right version, so you're probably fine! But if you use other versions of Python, here's how to get started.

### Managed

For this, we recommend [pyenv](https://github.com/pyenv/pyenv). (It's the only game in town.)

- Install pyenv according to https://github.com/pyenv/pyenv-installer#github-way-recommended
- At the top level of this repo:
  - Install the version of Python for GitHub Desktop with `pyenv install`
- You're good to go!

### Manual

- Install manually from https://www.python.org/downloads/
- You're good to go!

## Xcode Command Line Tools

- Just run `xcode-select --install`
