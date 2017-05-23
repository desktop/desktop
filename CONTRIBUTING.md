# Contributing to GitHub Desktop

:+1: :tada: :sparkling_heart: Thanks for your interest! :sparkling_heart: :tada: :+1:

The following is a set of guidelines for contributing to GitHub Desktop and its
related projects, which are hosted in the [Desktop Organization](https://github.com/desktop)
on GitHub. These are just guidelines, not rules. Use your best judgment, and
feel free to propose changes to this document in a pull request.

Note that GitHub Desktop is currently a public beta, so everything is likely to
change over time as we learn and refine how we work with the community.

#### Table Of Contents

[What should I know before I get started?](#what-should-i-know-before-i-get-started)
  * [Code of Conduct](#code-of-conduct)
  * [The Beta Roadmap](#the-beta-roadmap)

[How Can I Contribute?](#how-can-i-contribute)
  * [Reporting Bugs](#reporting-bugs)
  * [Suggesting Enhancements](#suggesting-enhancements)
  * [Up for Grabs](#up-for-grabs)

[Additional Notes](#additional-notes)
  * [Issue and Pull Request Labels](#issue-and-pull-request-labels)

## What should I know before I get started?

### Code of Conduct

This project adheres to the Contributor Covenant [code of conduct](CODE_OF_CONDUCT.md).
By participating, you are expected to uphold this code.
Please report unacceptable behavior to [opensource+desktop@github.com](mailto:opensource+desktop@github.com).

### The Beta Roadmap

Currently GitHub Desktop is in a public beta, and the team is focused on
triaging reported issues and working towards a 1.0 milestone - where the
application can be used in place of the classic Mac and Windows applications.
You can follow this progress progress under the [Milestones](https://github.com/desktop/desktop/milestones)
tab.

We're still thinking about where we want to take GitHub Desktop after we reach
this 1.0 milestone. If you have ideas or suggestions please read the [Suggesting Enhancements](#suggesting-enhancements)
section below to understand how to contribute your feedback.

## How Can I Contribute?

### Reporting Bugs

This section guides you through submitting a bug report for GitHub Desktop.
Following these guidelines helps maintainers and the community understand your
report :pencil:, reproduce the behavior :computer: :computer:, and find related
reports :mag_right:.

Before creating bug reports, please check [this list](#before-submitting-a-bug-report)
as you might find out that you don't need to create one. When you are creating
a bug report, please [include as many details as possible](#how-do-i-submit-a-good-bug-report).
Fill out [the required template](../../.github/ISSUE_TEMPLATE.md), the information
it asks for helps us resolve issues faster.

#### Before Submitting A Bug Report

**Perform a [cursory search](https://github.com/desktop/desktop/labels/bug)**
to see if the problem has already been reported. If it does exist, add a
:thumbsup: to the issue to indicate this is also an issue for you, and add a
comment to the existing issue if there is extra information you can contribute.

#### How Do I Submit A (Good) Bug Report?

Bugs are tracked as [GitHub issues](https://guides.github.com/features/issues/).

Simply create an issue on the [GitHub Desktop issue tracker](https://github.com/desktop/desktop/issues)
and fill out the provided [issue template](../../.github/ISSUE_TEMPLATE.md).

The information we are interested in includes:

 - details about your environment - which build, which operating system
 - details about reproducing the issue - what steps to take, what happens, how
   often it happens
 - other relevant information - log files, screenshots, etc

### Suggesting Enhancements

This section guides you through submitting an enhancement suggestion for
GitHub Desktop, including completely new features and minor improvements to
existing functionality. Following these guidelines helps maintainers and the
community understand your suggestion :pencil: and find related suggestions
:mag_right:.

Before creating enhancement suggestions, please check [this list](#before-submitting-an-enhancement-suggestion)
as you might find out that you don't need to create one. When you are creating
an enhancement suggestion, please [include as many details as possible](#how-do-i-submit-a-good-enhancement-suggestion).
Fill in [the template](../../.github/ISSUE_TEMPLATE.md), including the steps
that you imagine you would take if the feature you're requesting existed.

#### Before Submitting An Enhancement Suggestion

**Perform a [cursory search](https://github.com/desktop/desktop/labels/enhancement)**
to see if the enhancement has already been suggested. If it has, add a
:thumbsup: to indicate your interest in it, or comment if there is additional
information you would like to add.

#### How Do I Submit A (Good) Enhancement Suggestion?

Enhancement suggestions are tracked as [GitHub issues](https://guides.github.com/features/issues/).

Simply create an issue on the [GitHub Desktop issue tracker](https://github.com/desktop/desktop/issues)
and provide the following information:

* **Use a clear and descriptive title** for the issue to identify the
  suggestion.
* **Provide a step-by-step description of the suggested enhancement** in as
  much detail as possible. This additional context helps the maintainers to
  understand the enhancement from your perspective
* **Explain why this enhancement would be useful** to GitHub Desktop users.
* **Include screenshots and animated GIFs** if relevent to help you demonstrate
  the steps or point out the part of GitHub Desktop which the suggestion is
  related to. You can use [this tool](http://www.cockos.com/licecap/) to record
  GIFs on macOS and Windows.
* **List some other applications where this enhancement exists, if applicable.**

### Up For Grabs

As the team is working towards the 1.0 release, we'll identify enhancements or
bugs that can be categorised as tasks that:

 - have low impact, or have a known workaround
 - should be fixed
 - have a narrow scope and/or easy reproduction steps
 - can be worked on independent of other tasks

These issues will be labelled as [`up-for-grabs`](https://github.com/desktop/desktop/labels/up-for-grabs)
in the repository. If you are interested in contributing to the project, please
comment on the issue to let the maintainers (and communit) know you are
interested in picking this up.

## Additional Notes

### Issue and Pull Request Labels

This section lists the labels we use to help us track and manage issues and
pull requests.

#### Type of Issue and Issue State

| Label name | :mag_right: | Description |
| --- | --- | --- |
| `enhancement` | [search](https://github.com/desktop/desktop/labels/enhancement) | Feature requests. |
| `bug` | [search](https://github.com/desktop/desktop/labels/bug)  | Confirmed bugs or reports that are very likely to be bugs. |
| `question` | [search](https://github.com/desktop/desktop/labels/question)  | Questions more than bug reports or feature requests (e.g. how do I do X). |
| `more-information-needed` | [search](https://github.com/desktop/desktop/labels/more-information-needed) | More information needs to be collected about these problems or feature requests (e.g. steps to reproduce). |
| `needs-reproduction` | [search](https://github.com/desktop/desktop/labels/needs-reproduction)  | Likely bugs, but haven't been reliably reproduced. |
| `macOS` | [search](https://github.com/desktop/desktop/labels/macOS)  | Issues specific to macOS users. |
| `Windows` | [search](https://github.com/desktop/desktop/labels/Windows)  | Issues specific to Windows users. |

#### Topics

| Label name | :mag_right: | Description |
| --- | --- | --- |
| `up-for-grabs` | [search](https://github.com/desktop/desktop/labels/up-for-grabs)  | Issues marked as ideal for external contributors. |
| `polish` | [search](https://github.com/desktop/desktop/labels/polish) | Issues not critical to the application but would provide a better experience if resolved. |
| `tech-debt` | [search](https://github.com/desktop/desktop/labels/tech-debt) | Issues related to code or architecture decisions. |
| `design` | [search](https://github.com/desktop/desktop/labels/design)  | Issues that require some design input from the maintainers as part of completing the work. |

#### Workflow

| Label name | :mag_right: | Description |
| --- | --- | --- |
| `ready-for-review` | [search](https://github.com/desktop/desktop/labels/ready-for-review)  | Pull Requests that are ready to be reviewed by the maintainers. |
