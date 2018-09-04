# Mac System Dependencies

## Node

There are two approaches to installing Node, **simple** and **version managed**. We recommend the version managed route, but the simple method will work fine if you don't have node installed on your machine and just want to get running!

### Version Managed

We recommend using nvm to manage your node version. This makes it easier to know you are running the correct version of node for this project without effecting setup for other projects on your machine.

- install nvm from https://github.com/creationix/nvm#install-script
- install the version of node for GitHub Desktop with `nvm install`
- use that version with `nvm use`
- you're good to go!

### Manual

- Install manually from https://nodejs.org/en/download/
- you're good to go!

## Python

Mac OS comes with python pre-installed, and it happens to be the right version, so you're probably fine! But if you use other versions of python, here's how to get started.

### Version Managed

For this, we recommennd pyenv.

- install pyenv according to https://github.com/pyenv/pyenv-installer#github-way-recommended
- install the version of python for GitHub Desktop with `pyenv install`
- you're good to go!

### Manual

- install manually from https://www.python.org/downloads/
- you're good to go!

## XCode Command Line Tools

- just run `xcode-select --install`
