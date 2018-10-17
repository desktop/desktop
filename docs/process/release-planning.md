# Release Planning

This document outlines our process for planning and scheduling releases, so you
can familiarize yourself with the flow of work from opening an issue to seeing
it published in a release.

## Releases

We organize releases in two ways - marketing and milestones:

 - Marketing releases are what we use to represent planned features, and are
   high-level goals
      - **e.g. 1.4, 1.5, etc**
 - Milestones releases are used to track issues and pull requests associated
   with a marketing release, and can be followed along on GitHub
      - **e.g. 1.4.1, 1.4.2, 1.5.0, etc**

We aim to ship updates to production every two weeks, to ensure a continuous
flow of improvements to our users. You can follow along with the latest
milestones [here](https://github.com/desktop/desktop/milestones?direction=desc&sort=completeness&state=open)
to track our progress.

## Scheduling Pull Requests

Pull Requests for user-facing changes should have a milestone associated with
it, to indicate when it should be merged.

### Features

Pull Requests associated with features for our marketing releases should have a
milestone defined as soon as possible, to indicate the anticipated release and
help track.

These pull requests should also be behind a feature flag, so we can control when
a feature is enabled for users. If you are using the GitHub Desktop
[beta channel](https://github.com/desktop/desktop#beta-channel)
you will be able to help test and provide feedback about these features early.

### Bugfixes

Pull Requests associated with bugfixes or unplanned work can be opened early,
but **should not** be assigned a milestone until after it has been reviewed and
approved.

This gives the maintainers a chance to propose when this should land, based on
these factors:

 - **priority** - Some bugs are more harmful (and affect more users) than
   others...
 - **impact** - Does this need time on the `beta` channel to verify it's good to
   go?
 - **timing** - Are we close to a release? Maybe it can wait a couple of days...

We do this as late as possible in the lifetime of the pull request to give the
maintainers an opportunity to discuss when this should be merged, and sometimes
the time and effort required to review a pull request can take it beyond the
current milestone.

Once a milestone is agreed upon, and it is assigned by a maintainer, the Pull
Request can be merged by a maintainer when the milestone corresponds with the
current release. The reviewer should also ensure any issues linked in the
milestone are also assigned to the same milestone, for traceability.

> **TODO: (BF)** this feels like something to automate:
>
> The reviewer should also ensure any issues linked in the milestone are also
assigned to the same milestone, for traceability.

### Community Contributions

Similiar to bugfixes, community PRs and features should not have a milestone
assigned until they have been reviewed and approved, and should go through the
same process.
