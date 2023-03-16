# Contributing to `git-native-bits`

As these scripts are dependent on the OS you have setup, I've not spent much
time testing things out about the local development experience.

## Setup

You'll need a bash environment to run these scripts, and you should be able
to emulate the behaviour of Travis by setting environment variables

```
GIT_LFS_URL=https://github.com/git-lfs/git-lfs/releases/download/v1.5.5/git-lfs-darwin-amd64-1.5.5.tar.gz \
GIT_LFS_CHECKSUM=2227668c76a07931dd387602f67c99d5d42f0a99c73b76f8949bbfe3a4cc49c7 \
script/build-macos.sh ./git /tmp/build/git/
```

Please open issues if you encounter friction with running things locally and
would like it to be easier.

## Updating Git

Ensure the submodule is checked out to the correct tag, e.g:

```
cd git
git checkout v2.11.1
```

The package scripts will look for this tag, so non-tagged builds are not
currently supported. Committing this submodule change and publish a pull
request to initiate the build scripts.

Windows doesn't need to be built from source - when a new [Git for Windows](https://github.com/git-for-windows/git) release is published, just update the
`GIT_FOR_WINDOWS_URL` and `GIT_FOR_WINDOWS_CHECKSUM` variables in `.travis.yml`
to use their MinGit build.

## Changing how Git is built

Refer to the build scripts under the `script` folder for how we are building Git for each platform. Ideally we should be using the same flags
wherever possible, but sometimes we need to do platform-specific things.

## Updating Git LFS

Packages are published for each platform from the [Git LFS](https://github.com/git-lfs/git-lfs)
repository. These are defined as environment variables in the `.travis.yml` -
update the `GIT_LFS_URL` and `GIT_LFS_CHECKSUM` for all platforms and commit
the change.


