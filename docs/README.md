# GitHub Desktop Documentation

This is the [GitHub Desktop](https://github.com/desktop/desktop) development
documentation.

## Contributing

If you are interested in contributing to the project, you should read these
resources to get familiar with how things work:

 - **[How Can I Contribute?](../.github/CONTRIBUTING.md#how-can-i-contribute)** -
    details about how you can participate
 - **[Development Environment Setup](contributing/setup.md)** - everything
    you need to know to get Desktop up and running
 - **[Engineering Values](contributing/engineering-values.md)** - our high-level engineering values
 - **[Style Guide](contributing/styleguide.md)** - notes on the coding style
 - **[Tooling](contributing/tooling.md)** - if you have a preferred IDE,
    there's some enhancements to make your life easier
 - **[Troubleshooting](contributing/troubleshooting.md)** - some additional
    known issues if you're having environment issues

## Process

Details about how the team is organizing and shipping GitHub Desktop:

 - **[Roadmap](process/roadmap.md)** - the future as planned so far
 - **[Release Planning](process/release-planning.md)** - how we plan and execute
    releases
 - **[Issue Triage](process/issue-triage.md)** - how we address issues reported
    by users
 - **[Pull Request Triage](process/pull-request-triage.md)** - how contributions are reviewed
 - **[Releasing Updates](process/releasing-updates.md)** - how we deploy things

## Technical

These documents contain more details about the internals of GitHub Desktop
and how things work:

 - **[Dialogs](technical/dialogs.md)** - details about the dialog component API
 - **[Windows menu bar](technical/windows-menu-bar.md)** - Electron doesn't
    provide inbuilt support for styling the menu for Windows, so we've created
    our own custom components to achieve this.
 - **[Developer OAuth App](technical/oauth.md)** - GitHub Desktop ships with
    the ability to OAuth on behalf of a user. A developer OAuth app is bundled
    to reduce the friction of getting started.
 - **[Building and Packaging Desktop](technical/packaging.md)** - Outlines how
    Desktop is currently packaged for all platforms 
