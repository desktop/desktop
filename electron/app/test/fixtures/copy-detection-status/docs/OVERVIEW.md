# Overview

This walks through the various bits and pieces of how this repository is
configured to build and package Git.

## Build Matrix

This repository uses a number of Travis build agents to co-ordinate the
various builds and packages that are needed. The dependencies needed for each
agent are rather vanilla, and shouldn't need updating between releases.

## Repository Setup

### Build Step

The shell scripts to build each platform are found under the `script` folder.
Find the platform you wish to test out, update the script and submit the
change as a pull request. This will kick off and test everything as required.

Each script may expect a `source` argument, which represents where to find Git,
and each script is expected to output the files for packaging to the specified
`destination` location.

If, for whatever reason, a script needs to fail, returning a non-zero exit code
is enough to fail the build process.

### Package Step

Packaging is rather consistent for each platform, and mostly focuses on
ensuring the right binaries are published and fingerprinted correctly.

#### GitHub Release

When a tag is pushed to GitHub, Travis will detect this and start a new build.
The artefacts from that build are then uploaded to GitHub, ready to use in a
release.

All other builds will discard these artefacts.
