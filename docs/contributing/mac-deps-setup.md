# Setting Up Development Dependencies on macOS

You will need to install these tools on your machine:

 - Node.js v8.11.4
 - Python 2.7
 - Xcode and Xcode Command Line Tools (Xcode -> Preferences -> Downloads)

## Node.js

There are two approaches to installing Node.js, **manual** and **managed**. We recommend the managed route, but the simple method will work fine if you don't have node installed on your machine and just want to get running!

### Managed

A few Node.js version managers you can use:

- [nvm](https://github.com/creationix/nvm)
- [n](https://github.com/tj/n)
- [asdf-nodejs](https://github.com/asdf-vm/asdf-nodejs)

### Manual

- Install manually from https://nodejs.org/en/download/
- You're good to go!

## Python

macOS comes with Python pre-installed, and it happens to be the right version, so you're probably fine! But if you use other versions of Python, here's how to get started.

### Managed

It seems the only game in town is [pyenv](https://github.com/pyenv/pyenv).

### Manual

- Install manually from https://www.python.org/downloads/
- You're good to go!

## Xcode Command Line Tools

- Just run `xcode-select --install`
