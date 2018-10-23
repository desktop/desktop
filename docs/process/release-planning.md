# Release Planning

This document outlines our process for planning and scheduling releases, so you
can familiarize yourself with the flow of work from opening an issue to seeing
it published in a release.

## Releases

We organize releases in two ways - marketing and milestones:

 - Marketing releases are what we use to represent planned features, and are
   high-level goals
      - **for example: 1.4, 1.5, etc.**
 - Milestones are used to track issues and pull requests associated with a
   marketing release, and can be [followed on GitHub](https://github.com/desktop/desktop/milestones)
      - **for example: 1.4.1, 1.4.2, 1.5.0, etc.**

We aim to ship updates to production approximately every two weeks, to ensure a
continuous flow of improvements to our users. Track our progress in the
[current milestones](https://github.com/desktop/desktop/milestones?direction=desc&sort=completeness&state=open).

## Scheduling Pull Requests

Pull Requests for user-facing changes should have a milestone associated with
them, to indicate when they should be merged.

### Features

Pull Requests associated with features for our marketing releases should have a
milestone defined as soon as possible, to indicate the anticipated release and
help track.

Pull requests for new features should leverage feature flags, so we can control
when a feature is made available to users. If you are using the GitHub Desktop
[beta channel](https://github.com/desktop/desktop#beta-channel)
you will be able to help test and provide feedback about upcoming features
before they are made available to everyone.

### Bugfixes

Pull Requests associated with bugfixes or unplanned work can be opened early,
but **should not** be assigned a milestone until after they have been reviewed
and approved.

We do this as late as possible in the lifetime of the pull request to give the
maintainers an opportunity to discuss when this should be merged, and sometimes
the time and effort required to review a pull request can take it beyond the
current milestone.

The reviewer who approves the pull request may assign a milestone at the same
time to propose when this pull request should be merged, and optionally add a
comment to provice context around their choice.

These factors can be used when deciding on the chosen milestone:

 - **priority** - Some bugs are more harmful (and affect more users) than
   others...
 - **impact** - Does this need time on the `beta` channel to verify it's good to
   go?
 - **timing** - Are we close to a release? Maybe it can wait a couple of days...

During the 24-hour approval window for merged pull request other maintainers may
discuss the proposed milestone (or just :thumbsup: to acknowledege and agree
with the proposed milestone).

Once the 24-hour approval window has expired the pull request can be merged by a
maintainer when the milestone corresponds with the current release.

The maintainer merging the pull request should also ensure any issues linked in
the pull request description (which will be auto-closed when merging) are also
assigned to the same milestone.

### Community Contributions

Similiar to bugfixes, community PRs and features should not have a milestone
assigned until they have been reviewed and approved, and should go through the
same process.
