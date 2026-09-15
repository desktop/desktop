# Linux Testing and You

GitHub Desktop doesn't currently support Linux in an official capacity, but many in the community have already been experimenting and testing it on their preferred distributions.

This document outlines the process to help provide a set of quality installers, based on community feedback and contributions.

## Goals

The goals for this testing process are:

* test installers and Desktop on a variety of distributions
* report issues and provide feedback - either about running Desktop or the installer
* triage and address feedback whenever contributors have bandwidth

## Testing Release Candidates

Release Candidate installers can be found on [**@shiftkey's**](https://github.com/shiftkey) [fork](https://github.com/shiftkey/desktop), listed under the [Releases](https://github.com/shiftkey/desktop/releases) tab. The current installer formats supported are Debian, RPM, AppImage and Snap.

[@shiftkey](https://github.com/shiftkey) aims to make new installers available soon after the main Desktop project tags and publishes a new update. To receive notifications when new installers are published, [subscribe](https://github.com/shiftkey/desktop/subscription) to [**@shiftkey's**](https://github.com/shiftkey) fork of the repository.

Subscribing to notifications also helps the core team to identify how many people are actively interested in this testing process.

## Providing Feedback

If you find an issue with running the installer or Desktop on your platform, please open an issue on [`shiftkey/desktop`](https://github.com/shiftkey/desktop). **Do not open issues against the main repository - these issues will be closed with a note to report the issue to the right repository.**

The issue template asks for details about your setup and how to reproduce the issue - please fill this out, as it will help with understanding and reproducing the issue.

Feel free to submit other questions or suggestions to [`shiftkey/desktop`](https://github.com/shiftkey/desktop) - this will give us a place to discuss things in more detail than the original thread about Linux support.

## Contributing Fixes

If you are interested in testing installers locally, first ensure your [development environment is setup](https://github.com/desktop/desktop/blob/development/docs/contributing/setup.md) to build and test Desktop.

Once your environment is setup, you can create an installer locally by running:

```shellsession
$ yarn
$ yarn build:prod
$ yarn run package
```

If you think you've found a solution, please submit a pull request to [`shiftkey/desktop`](https://github.com/shiftkey/desktop) explaining the change and what it fixes. If you're not quite sure, open an issue on the [`shiftkey/desktop`](https://github.com/shiftkey/desktop) fork explaining what you've found and where you think the problem lies. Maybe someone else has insight into the issue.

[**@shiftkey**](https://github.com/shiftkey) will co-ordinate upstreaming merged pull requests to the main repository.
