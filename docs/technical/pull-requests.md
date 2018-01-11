# Checking out pull requests from a forked repository
PR #3602 introduced the ability to checkout a branch from a forked repository. In order to accomplish this, we needed a way to manage remotes on your behalf. This document is intended to detail the process we developed to make checking out PRs as frictionless as possible.

## Magic Remote Prefix
One of the main problems we needed to solve was determining which remotes are no longer needed and can be cleaned. We decided to go with prefixing the remotes we add on your behalf with a magic string: `github-desktop-`

https://github.com/desktop/desktop/blob/34a05b155ff69bb19cc4da5b2caa89856e3e63fb/app/src/lib/stores/pull-request-store.ts#L26

## Cleaning Remotes
One of the goals of our design was to ensure that we don’t cause  your remotes — `.git/refs/remotes` — to grow unbounded. We prevent this by cleaning up after ourselves. We determined that a remote is a candidate for removal when it meets the following conditions.

* Start with our prefix
* The PR associated with the remote is closed

https://github.com/desktop/desktop/blob/34a05b155ff69bb19cc4da5b2caa89856e3e63fb/app/src/lib/stores/pull-request-store.ts#L91-L110

## What does this mean for me?
Doing this essentially gives us a namespace that we can safely work in. We chose the prefix `github-desktop-` because we are confident your own remote names will never start with this prefix. This means that in order for GitHub Desktop to work as expected, you should never add a remote that starts with our prefix. We feel that this is an acceptable compromise.
