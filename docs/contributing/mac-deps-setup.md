# Setting Up Development Dependencies on macOS

You will need to install these tools on your machine:

 - Node.js v8.11.4
 - Python 2.7
 - Xcode and Xcode Command Line Tools (Xcode -> Preferences -> Downloads)

## Node.js

There are two approaches to installing Node.js, **manual** and **managed**. If you're not sure which route to go, we recommend the managed route, but do whatever makes the most sense for your development process!

### Managed

We recommend using [nvm](https://github.com/creationix/nvm) to manage your Node.js version. This makes it easier to know you are running the correct version of node for this project without affecting setup for other projects on your machine.

- Install nvm from https://github.com/creationix/nvm#install-script
- At the top level of this repo:
  - Install the version of Node.js for GitHub Desktop with `nvm install`
  - Use that version with `nvm use`
- You're good to go!

Suitable alternatives include (but aren't limited to) [n](https://github.com/tj/n) and [asdf-nodejs](https://github.com/asdf-vm/asdf-nodejs).

### Manual

- Install manually from https://nodejs.org/en/download/
- You're good to go!

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
