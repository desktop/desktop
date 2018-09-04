# Mac System Dependencies

## Node

There are two approaches to installing Node, **simple** and **version managed**. We recommend the version managed route, but the simple method will work fine if you don't have node installed on your machine and just want to get running!

### Version Managed

We recommend using [nvm](https://github.com/creationix/nvm) to manage your node version. This makes it easier to know you are running the correct version of node for this project without effecting setup for other projects on your machine.

- Install nvm from https://github.com/creationix/nvm#install-script
- Install the version of node for GitHub Desktop with `nvm install`
- Use that version with `nvm use`
- You're good to go!

### Manual

- Install manually from https://nodejs.org/en/download/
- You're good to go!

## Python

Mac OS comes with python pre-installed, and it happens to be the right version, so you're probably fine! But if you use other versions of python, here's how to get started.

### Version Managed

For this, we recommennd [pyenv](https://github.com/pyenv/pyenv).

- Install pyenv according to https://github.com/pyenv/pyenv-installer#github-way-recommended
- Install the version of python for GitHub Desktop with `pyenv install`
- You're good to go!

### Manual

- Install manually from https://www.python.org/downloads/
- You're good to go!

## XCode Command Line Tools

- Just run `xcode-select --install`
