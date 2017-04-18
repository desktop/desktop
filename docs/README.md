# GitHub Desktop Documentation

This is the [GitHub Desktop](https://github.com/desktop/desktop) product development documentation.

## Contributing

If you are interested in participating and contributing to the project, you
should read these resources to get familiar with how things work:

 - **[Getting started](../README.md#i-want-to-work-on-it)** - how to get your machine setup
 - **[How we work](../CONTRIBUTING.md)** - details on the review process
 - **[Style Guide](styleguide.md)** - notes on the coding style

## Process

Here's some details about how the team is organizing and shipping Desktop:

 - **[Issue Triage](./process/issue-triage.md)** - how we address issues reported by users
 - **[Up for Grabs](./process/up-for-grabs.md)** - how we identify tasks for external contribution
 - **[Review Process](./process/reviews.md)** - how we review contributions
 - **[Releasing updates](./process/releasing-updates.md)** -how we deploy things
 - **[Roadmap](./process/roadmap.md)** - how we plan for the future

## Technical

These documents contain more details about the internals of GitHub Desktop
and how things work:

 - **[Dialogs](./technical/dialogs.md)** - details about the dialog component API
 - **[Windows menu bar](./technical/windows-menu-bar.md)** - Electron doesn't provide inbuilt support for styling the menu for Windows, so we've created our own custom components to achieve this.
